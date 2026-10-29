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

async function collectTelemetry() {
  const now = Date.now();
  if (cachedPayload && now - cachedAt < POLL_CACHE_MS) return cachedPayload;
  if (sampleInFlight) return sampleInFlight;

  sampleInFlight = (async () => {
    const sampledAt = new Date().toISOString();
    let native = null;
    let network = null;
    let macError = null;
    let networkError = null;
    const jobs = [];

    if (sampler) {
      jobs.push(sampler.sampleNow().then(value => { native = value; }).catch(error => { macError = error; }));
    }
    jobs.push(si.networkStats().then(value => { network = value?.[0] ?? null; }).catch(error => { networkError = error; }));
    await Promise.all(jobs);

    const sensorTime = native?.timestamp ?? sampledAt;
    const readings = [
      unavailable("voltage.input", "V", "No compatible input voltage meter is connected."),
      unavailable("voltage.output", "V", "No compatible output voltage meter is connected."),
    ];

    if (!sensorProvider) {
      readings.push(unavailable("temperature.cpu", "°C", sensorUnavailableReason, sensorUnavailableStatus));
      readings.push(unavailable("temperature.gpu", "°C", sensorUnavailableReason, sensorUnavailableStatus));
      readings.push(unavailable("fan.rpm", "rpm", sensorUnavailableReason, sensorUnavailableStatus));
      readings.push(unavailable("thermal.pressure", "level", sensorUnavailableReason, sensorUnavailableStatus));
    } else if (macError) {
      const reason = `Mac sensor read failed: ${macError.message}`;
      readings.push(unavailable("temperature.cpu", "°C", reason, "error"));
      readings.push(unavailable("temperature.gpu", "°C", reason, "error"));
      readings.push(unavailable("fan.rpm", "rpm", reason, "error"));
      readings.push(unavailable("thermal.pressure", "level", reason, "error"));
    } else if (native) {
      readings.push(mapMacReading("temperature.cpu", native.cpu?.tempCelsius, "°C", sensorTime, "CPU sensor"));
      readings.push(mapMacReading("temperature.gpu", native.gpu?.tempCelsius, "°C", sensorTime, "GPU sensor"));
      const fans = Array.isArray(native.fans) ? native.fans : [];
      if (fans.length) {
        const validFans = fans.filter(fan => Number.isFinite(fan.rpm) && fan.rpm >= 0 && fan.rpm <= 30_000);
        if (validFans.length) {
          validFans.forEach((fan, index) => {
            const name = String(fan.name || `fan${index + 1}`).replace(/[^a-z0-9_-]/gi, "_");
            readings.push(makeReading(`fan.rpm.${name}`, fan.rpm, "rpm", sensorProvider, sensorTime, "Read-only fan tachometer reading."));
          });
        } else {
          readings.push(unavailable("fan.rpm", "rpm", "Fan data was outside the supported range.", "error"));
        }
      } else {
        readings.push(makeReading("fan.rpm", null, "rpm", sensorProvider, sensorTime, "No fan sensor was reported by this Mac."));
      }
      const level = native.thermal?.level;
      readings.push(makeReading("thermal.pressure", level, "level", "macOS ProcessInfo thermal state", sensorTime, native.thermal?.state ?? "System thermal state."));
    }

    if (networkError) {
      readings.push(unavailable("network.download", "Mbps", `Network counter unavailable: ${networkError.message}`, "error"));
      readings.push(unavailable("network.upload", "Mbps", `Network counter unavailable: ${networkError.message}`, "error"));
    } else if (!network || network.operstate === "down") {
      readings.push(unavailable("network.download", "Mbps", "No active external network interface was reported."));
      readings.push(unavailable("network.upload", "Mbps", "No active external network interface was reported."));
    } else {
      const validRate = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
      const source = `systeminformation · ${network.iface}`;
      const detail = `Live interface traffic, not a speed test. Interface: ${network.iface}.`;
      readings.push(validRate(network.rx_sec)
        ? makeReading("network.download", network.rx_sec * 8 / 1_000_000, "Mbps", source, sampledAt, detail)
        : unavailable("network.download", "Mbps", "Collecting the first network counter interval."));
      readings.push(validRate(network.tx_sec)
        ? makeReading("network.upload", network.tx_sec * 8 / 1_000_000, "Mbps", source, sampledAt, detail)
        : unavailable("network.upload", "Mbps", "Collecting the first network counter interval."));
    }

    const availableCount = readings.filter(reading => reading.status === "available").length;
    const payload = {
      version: 1,
      sampledAt,
      staleAfterMs: STALE_AFTER_MS,
      state: availableCount ? "partial" : "unavailable",
      provider: sensorProvider ?? "network counters only",
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
