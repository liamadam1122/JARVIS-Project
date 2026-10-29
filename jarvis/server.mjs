import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import si from "systeminformation";

const HOST = "127.0.0.1";
const PORT = 4173;
const ORIGIN = `http://${HOST}:${PORT}`;
const STALE_AFTER_MS = 12_000;
const POLL_CACHE_MS = 1_000;
const html = await readFile(new URL("./index.html", import.meta.url));

let sampler = null;
let sensorProvider = null;
let sensorUnavailableReason = "Raw Mac sensors are unavailable on this platform.";
let sensorUnavailableStatus = "unsupported";
let cachedPayload = null;
let cachedAt = 0;
let sampleInFlight = null;

if (process.platform === "darwin" && process.arch === "arm64") {
  try {
    const metrics = await import("apple-silicon-metrics");
    if (metrics.isSupported()) {
      sampler = metrics.createSampler({ intervalMs: 1000 });
      await sampler.prime();
      sensorProvider = "apple-silicon-metrics/macmon";
      sensorUnavailableReason = "The Mac sensor provider returned no reading.";
    }
  } catch (error) {
    sensorUnavailableReason = `Mac sensor provider unavailable: ${error.message}`;
      sensorUnavailableStatus = "error";
  }
}

function makeReading(metric, value, unit, source, sampledAt, detail, status = "available") {
  const finite = typeof value === "number" && Number.isFinite(value);
  if (status !== "available" || !finite) {
    return {
      metric,
      value: null,
      unit,
      status: status === "available" ? "unavailable" : status,
      source: source ?? null,
      sampledAt: sampledAt ?? null,
      detail,
    };
  }
  return { metric, value, unit, status, source, sampledAt, detail };
}

function unavailable(metric, unit, detail, status = "unavailable") {
  return makeReading(metric, null, unit, null, null, detail, status);
}

function mapMacReading(metric, value, unit, timestamp, detail) {
  if (!sensorProvider) return unavailable(metric, unit, sensorUnavailableReason, "unsupported");
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return makeReading(metric, null, unit, sensorProvider, timestamp, sensorUnavailableReason);
  }
  if (unit === "°C" && (value < -40 || value > 130)) {
    return makeReading(metric, null, unit, sensorProvider, timestamp, "Sensor value outside the supported temperature range.", "error");
  }
  return makeReading(metric, value, unit, sensorProvider, timestamp, detail);
}

function addAppleSiliconReadings(readings, native, sampledAt) {
  const add = (metric, value, unit, detail) => readings.push(mapMacReading(metric, value, unit, sampledAt, detail));
  const ratio = value => typeof value === "number" && Number.isFinite(value) ? value * 100 : null;
  const gib = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value / (1024 ** 3) : null;
  const percent = (used, total) => typeof used === "number" && Number.isFinite(used) && typeof total === "number" && Number.isFinite(total) && total > 0
    ? used / total * 100
    : null;

  add("cpu.usage", ratio(native.cpu?.usageRatio), "%", "CPU utilization");
  add("cpu.power", native.cpu?.powerWatts, "W", "CPU power draw");
  add("temperature.cpu", native.cpu?.tempCelsius, "°C", "CPU temperature");
  add("gpu.usage", ratio(native.gpu?.usageRatio), "%", "GPU utilization");
  add("gpu.frequency", native.gpu?.frequencyMhz, "MHz", "GPU frequency");
  add("gpu.power", native.gpu?.powerWatts, "W", "GPU power draw");
  add("temperature.gpu", native.gpu?.tempCelsius, "°C", "GPU temperature");
  add("memory.ram.used", gib(native.memory?.ramUsedBytes), "GiB", "RAM currently used");
  add("memory.ram.total", gib(native.memory?.ramTotalBytes), "GiB", "RAM total reported by the provider");
  add("memory.ram.usage", percent(native.memory?.ramUsedBytes, native.memory?.ramTotalBytes), "%", "RAM used as a percentage of reported total");
  add("memory.ram.power", native.memory?.ramPowerWatts, "W", "RAM power draw");
  add("memory.swap.used", gib(native.memory?.swapUsedBytes), "GiB", "Swap currently used");
  add("memory.swap.total", gib(native.memory?.swapTotalBytes), "GiB", "Swap total reported by the provider");
  add("memory.swap.usage", percent(native.memory?.swapUsedBytes, native.memory?.swapTotalBytes), "%", "Swap used as a percentage of reported total");
  add("accelerator.ane.power", native.ane?.powerWatts, "W", "Apple Neural Engine power draw");
  readings.push(unavailable("thermal.pressure", "level", "This sensor provider does not expose macOS thermal pressure.", "unsupported"));

  const fans = Array.isArray(native.fans) ? native.fans : [];
  if (!fans.length) {
    readings.push(makeReading("fan.rpm", null, "rpm", sensorProvider, sampledAt, "No fan tachometer reading was reported by the sensor provider."));
    return;
  }
  const usedKeys = new Set();
  fans.forEach((fan, index) => {
    const rawName = String(fan.name || `fan${index + 1}`).slice(0, 64);
    const baseKey = rawName.replace(/[^a-z0-9_-]/gi, "_") || `fan${index + 1}`;
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${baseKey}_${suffix++}`;
    usedKeys.add(key);
    const detail = `Read-only fan tachometer. Hardware label: ${rawName}.`;
    const fanStatus = Number.isFinite(fan.rpm) && fan.rpm >= 0 && fan.rpm <= 30_000 ? "available" : "error";
    readings.push(makeReading(`fan.rpm.${key}`, fan.rpm, "rpm", sensorProvider, sampledAt, detail, fanStatus));
    readings.push(makeReading(`fan.rpm_max.${key}`, fan.maxRpm, "rpm", sensorProvider, sampledAt, `Maximum fan speed reported for ${rawName}.`));
  });
}

function addUnavailableAppleReadings(readings, reason, status) {
  const metrics = [
    ["cpu.usage", "%"], ["cpu.power", "W"], ["temperature.cpu", "°C"],
    ["gpu.usage", "%"], ["gpu.frequency", "MHz"], ["gpu.power", "W"], ["temperature.gpu", "°C"],
    ["memory.ram.used", "GiB"], ["memory.ram.total", "GiB"], ["memory.ram.usage", "%"], ["memory.ram.power", "W"],
    ["memory.swap.used", "GiB"], ["memory.swap.total", "GiB"], ["memory.swap.usage", "%"],
    ["accelerator.ane.power", "W"], ["fan.rpm", "rpm"], ["thermal.pressure", "level"],
  ];
  for (const [metric, unit] of metrics) readings.push(unavailable(metric, unit, reason, status));
}

async function collectTelemetry() {
  const now = Date.now();
  if (cachedPayload && now - cachedAt < POLL_CACHE_MS) return cachedPayload;
  if (sampleInFlight) return sampleInFlight;

  sampleInFlight = (async () => {
    const sampledAt = new Date().toISOString();
    let native = null;
    let networkRows = [];
    let networkMetadata = [];
    let macError = null;
    let networkError = null;
    const jobs = [];

    if (sampler) {
      jobs.push(sampler.sampleNow().then(value => { native = value; }).catch(error => { macError = error; }));
    }
    jobs.push(si.networkStats("*").then(value => { networkRows = Array.isArray(value) ? value : []; }).catch(error => { networkError = error; }));
    jobs.push(si.networkInterfaces(false).then(value => { networkMetadata = Array.isArray(value) ? value : []; }).catch(() => {}));
    await Promise.all(jobs);

    const readings = [
      unavailable("voltage.input", "V", "No compatible input voltage meter is connected."),
      unavailable("voltage.output", "V", "No compatible output voltage meter is connected."),
    ];

    if (!sensorProvider) {
      addUnavailableAppleReadings(readings, sensorUnavailableReason, sensorUnavailableStatus);
    } else if (macError) {
      const reason = `Mac sensor read failed: ${macError.message}`;
      addUnavailableAppleReadings(readings, reason, "error");
    } else if (native) {
      addAppleSiliconReadings(readings, native, native.timestamp ?? sampledAt);
    }

    if (networkError) {
      readings.push(unavailable("network.download", "Mbps", `Network counter unavailable: ${networkError.message}`, "error"));
      readings.push(unavailable("network.upload", "Mbps", `Network counter unavailable: ${networkError.message}`, "error"));
    } else {
      const usedKeys = new Set();
      for (const network of networkRows) {
        const iface = String(network.iface || "unknown").slice(0, 64);
        const baseKey = iface.replace(/[^a-z0-9_-]/gi, "_") || "unknown";
        let key = baseKey;
        let suffix = 2;
        while (usedKeys.has(key)) key = `${baseKey}_${suffix++}`;
        usedKeys.add(key);
        const source = `systeminformation · ${iface}`;
        const detail = `Live interface traffic, not a speed test. Interface: ${iface}.`;
        const addNetworkReading = (direction, bytesPerSecond, label) => {
          const metric = `network.${key}.${direction}`;
          const isValid = typeof bytesPerSecond === "number" && Number.isFinite(bytesPerSecond) && bytesPerSecond >= 0;
          const reading = network.operstate === "down"
            ? makeReading(metric, null, "Mbps", source, sampledAt, `Interface ${iface} is down.`, "unavailable")
            : isValid
              ? makeReading(metric, bytesPerSecond * 8 / 1_000_000, "Mbps", source, sampledAt, detail)
              : makeReading(metric, null, "Mbps", source, sampledAt, "Collecting the first network counter interval.", "unavailable");
          readings.push({ ...reading, label: `${iface} ${label}` });
        };
        addNetworkReading("download", network.rx_sec, "download");
        addNetworkReading("upload", network.tx_sec, "upload");
      }
      if (!networkRows.length) {
        readings.push(unavailable("network.download", "Mbps", "No network interface counters were reported."));
        readings.push(unavailable("network.upload", "Mbps", "No network interface counters were reported."));
      }
    }

    const availableCount = readings.filter(reading => reading.status === "available").length;
    const device = sampler?.soc ?? native?.soc ?? null;
    const payload = {
      version: 1,
      sampledAt,
      staleAfterMs: STALE_AFTER_MS,
      state: availableCount ? "partial" : "unavailable",
      provider: sensorProvider ?? "network counters only",
      device,
      capabilities: {
        defaultNetworkInterface: networkMetadata.find(network => network.default)?.iface ?? null,
        networkInterfaces: networkMetadata.map(network => ({
          name: network.iface,
          isDefault: Boolean(network.default),
          state: network.operstate ?? "unknown",
          type: network.type ?? "unknown",
        })),
        metrics: readings.map(reading => reading.metric),
      },
      readings,
    };
    cachedPayload = payload;
    cachedAt = Date.now();
    return payload;
  })();

  try {
    return await sampleInFlight;
  } finally {
    sampleInFlight = null;
  }
}

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.headers.host !== `${HOST}:${PORT}`) return send(res, 403, "text/plain; charset=utf-8", "Local host only.");
  if (req.headers.origin && req.headers.origin !== ORIGIN) return send(res, 403, "text/plain; charset=utf-8", "Same-origin requests only.");
  if (req.method !== "GET") return send(res, 405, "text/plain; charset=utf-8", "Read-only GET endpoint.");

  if (req.url === "/" || req.url === "/index.html") {
    return send(res, 200, "text/html; charset=utf-8", html);
  }
  if (req.url === "/api/telemetry") {
    try {
      const payload = await collectTelemetry();
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify(payload));
    } catch {
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        version: 1,
        sampledAt: new Date().toISOString(),
        staleAfterMs: STALE_AFTER_MS,
        state: "unavailable",
        provider: "local read-only bridge",
        readings: [],
        detail: "Telemetry collection failed. No sensor values were invented.",
      }));
    }
  }
  return send(res, 404, "text/plain; charset=utf-8", "Not found.");
});

server.listen(PORT, HOST, () => {
  console.log(`JARVIS local telemetry: ${ORIGIN}`);
  console.log("Read-only sensor access. Voltage and speed-test readings stay unavailable until supported hardware or an explicit speed test is added.");
});

function stop() {
  sampler?.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
