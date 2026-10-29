import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { homedir, networkInterfaces as osNetworkInterfaces } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import si from "systeminformation";

const HOST = "127.0.0.1";
const PORT = 4173;
const ORIGIN = `http://${HOST}:${PORT}`;
const STALE_AFTER_MS = 12_000;
const POLL_CACHE_MS = 1_000;
const SPEED_TEST_ORIGIN = "https://speed.cloudflare.com";
const SPEED_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const SPEED_UPLOAD_BYTES = 1 * 1024 * 1024;
const SPEED_TEST_TIMEOUT_MS = 15_000;
const SPEED_TEST_COOLDOWN_MS = 60_000;
const STORAGE_TOP_LIMIT = 20;
const html = await readFile(new URL("./index.html", import.meta.url));

let sampler = null;
let sensorProvider = null;
let sensorUnavailableReason = "Raw Mac sensors are unavailable on this platform.";
let sensorUnavailableStatus = "unsupported";
let cachedPayload = null;
let cachedAt = 0;
let sampleInFlight = null;
let speedTestInFlight = null;
let speedTestAllowedAt = 0;
let storageScanPromise = null;
let storageScanStopRequested = false;
let storageScan = { status: "idle" };

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

function addLargest(list, item) {
  if (list.length < STORAGE_TOP_LIMIT || item.bytes > list[0].bytes) {
    list.push(item);
    list.sort((a, b) => a.bytes - b.bytes);
    if (list.length > STORAGE_TOP_LIMIT) list.shift();
  }
}

async function scanMountedStorage() {
  const result = {
    status: "scanning",
    startedAt: new Date().toISOString(),
    scannedEntries: 0,
    scannedFiles: 0,
    scannedDirectories: 0,
    scannedVolumes: [],
    unreadableEntries: 0,
    unreadableDirectories: 0,
    unreadableVolumes: 0,
    skippedSymlinks: 0,
    skippedMountBoundaries: 0,
    skippedDuplicateVolumes: 0,
    skippedVirtualFilesystems: 0,
    topFiles: [],
    topFolders: [],
  };
  storageScan = result;

  try {
    let volumes = await si.fsSize();
    if (!Array.isArray(volumes)) volumes = [];
    let mounts = volumes
      .filter(volume => typeof volume.mount === "string" && isAbsolute(volume.mount))
      .filter(volume => !["/proc", "/sys", "/dev", "/run"].some(path => volume.mount === path || volume.mount.startsWith(path + sep)));
    if (!mounts.length) {
      mounts = [{ mount: homedir(), type: "home-folder fallback" }];
      result.usedHomeFallback = true;
    }

    const roots = [];
    for (const volume of mounts) {
      const filesystemType = String(volume.type || "").toLowerCase();
      if (/^(proc|sysfs|devtmpfs|tmpfs|devfs|autofs|overlay|squashfs|cgroup2?|pstore|securityfs|tracefs|debugfs)$/.test(filesystemType)) {
        result.skippedVirtualFilesystems += 1;
        continue;
      }
      try {
        const canonicalPath = await realpath(volume.mount);
        const info = await lstat(canonicalPath);
        if (!info.isDirectory()) {
          result.unreadableVolumes += 1;
          continue;
        }
        roots.push({ mount: volume.mount, path: canonicalPath, device: info.dev });
      } catch {
        result.unreadableVolumes += 1;
      }
    }

    roots.sort((a, b) => a.path.length - b.path.length);
    const uniqueRoots = [];
    for (const root of roots) {
      const alreadyCovered = uniqueRoots.some(parent =>
        parent.device === root.device && (root.path === parent.path || root.path.startsWith(parent.path.endsWith(sep) ? parent.path : parent.path + sep))
      );
      if (alreadyCovered) {
        result.skippedDuplicateVolumes += 1;
      } else {
        uniqueRoots.push(root);
      }
    }

    scanRoots: for (const root of uniqueRoots) {
      if (storageScanStopRequested) { result.status = "cancelled"; break; }
      result.scannedVolumes.push(root.mount);
      const rootFrame = { path: root.path, displayPath: root.mount, bytes: 0, parent: null, entries: null, index: 0 };
      const stack = [rootFrame];
      scanEntries: while (stack.length) {
        if (storageScanStopRequested) { result.status = "cancelled"; break scanRoots; }
        const frame = stack[stack.length - 1];
        if (frame.entries === null) {
          try {
            frame.entries = await readdir(frame.path, { withFileTypes: true });
          } catch {
            result.unreadableDirectories += 1;
            frame.entries = [];
          }
        }
        if (frame.index >= frame.entries.length) {
          stack.pop();
          if (frame.parent) {
            frame.parent.bytes += frame.bytes;
            addLargest(result.topFolders, { path: frame.displayPath, bytes: frame.bytes });
          }
          continue;
        }

        const entry = frame.entries[frame.index++];
        const fullPath = join(frame.path, entry.name);
        const displayPath = join(frame.displayPath, entry.name);
        result.scannedEntries += 1;
        let info;
        try {
          info = await lstat(fullPath);
        } catch {
          result.unreadableEntries += 1;
          continue;
        }

        if (info.isSymbolicLink()) {
          result.skippedSymlinks += 1;
        } else if (root.device !== undefined && info.dev !== root.device) {
          result.skippedMountBoundaries += 1;
        } else if (info.isDirectory()) {
          result.scannedDirectories += 1;
          stack.push({ path: fullPath, displayPath, bytes: 0, parent: frame, entries: null, index: 0 });
        } else if (info.isFile()) {
          result.scannedFiles += 1;
          frame.bytes += info.size;
          addLargest(result.topFiles, { path: displayPath, bytes: info.size });
        }

        if (result.scannedEntries % 500 === 0) {
          result.updatedAt = new Date().toISOString();
          await new Promise(resolve => setImmediate(resolve));
          if (storageScanStopRequested) { result.status = "cancelled"; break scanRoots; }
        }
      }
      result.totalBytes = (result.totalBytes || 0) + rootFrame.bytes;
    }

    result.topFiles.reverse();
    result.topFolders.reverse();
    if (result.status !== "cancelled") result.status = result.usedHomeFallback || result.unreadableEntries || result.unreadableDirectories || result.unreadableVolumes ? "partial" : "complete";
    result.completedAt = new Date().toISOString();
    result.detail = result.status === "cancelled" ? "The scan was stopped by the user; file contents were not opened." : result.usedHomeFallback ? "Mounted-volume discovery failed; only the home folder was scanned. File contents were not opened." : "File contents were not opened. Symlinks and nested mount boundaries were skipped; each mounted volume is scanned at most once where detectable."
  } catch {
    result.status = "error";
    result.completedAt = new Date().toISOString();
    result.detail = "The storage scan stopped unexpectedly; no file contents were opened.";
  }
  storageScan = result;
}

function addSystemInformationReadings(readings, info, sampledAt) {
  const add = (metric, value, unit, detail, status = "available") => {
    readings.push(makeReading(metric, value, unit, "systeminformation", sampledAt, detail, status));
  };
  const validPercent = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  const gib = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value / (1024 ** 3) : null;
  const memory = info.memory || {};
  const total = memory.total;
  const active = Number.isFinite(memory.active) ? memory.active : memory.used;
  const percent = Number.isFinite(active) && Number.isFinite(total) && total > 0 ? active / total * 100 : null;
  const gpu = info.graphics?.controllers?.[0] || {};

  add("cpu.usage", validPercent(info.load?.currentLoad), "%", "OS-reported total CPU load (systeminformation).");
  const cpuTemp = info.temperature?.main;
  const cpuTempStatus = Number.isFinite(cpuTemp) && (cpuTemp < -40 || cpuTemp > 130) ? "error" : "available";
  add("temperature.cpu", cpuTemp, "°C", cpuTempStatus === "error" ? "Temperature outside the supported range." : "CPU temperature reported by systeminformation; unsupported on some Macs.", cpuTempStatus);
  add("gpu.usage", validPercent(gpu.utilizationGpu), "%", "GPU utilization reported by systeminformation; unsupported on some Macs.");
  const gpuTemp = gpu.temperatureGpu;
  const gpuTempStatus = Number.isFinite(gpuTemp) && (gpuTemp < -40 || gpuTemp > 130) ? "error" : "available";
  add("temperature.gpu", gpuTemp, "°C", gpuTempStatus === "error" ? "Temperature outside the supported range." : "GPU temperature reported by systeminformation; unsupported on some Macs.", gpuTempStatus);
  add("memory.ram.used", gib(active), "GiB", "Active RAM reported by systeminformation; reclaimable cache is excluded.");
  add("memory.ram.total", gib(total), "GiB", "Total RAM reported by systeminformation.");
  add("memory.ram.usage", validPercent(percent), "%", "Active RAM as a percentage of total RAM.");
  add("memory.swap.used", gib(memory.swapused), "GiB", "Swap used as reported by systeminformation.");
  add("memory.swap.total", gib(memory.swaptotal), "GiB", "Total swap reported by systeminformation.");
  add("memory.swap.usage", validPercent(Number.isFinite(memory.swapused) && memory.swaptotal > 0 ? memory.swapused / memory.swaptotal * 100 : null), "%", "Swap used as a percentage of reported swap capacity.");
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
    let volumeRows = [];
    let volumeError = false;
    let systemInfo = { load: null, memory: null, temperature: null, cpu: null, graphics: null, system: null };
    let macError = null;
    let networkError = null;
    const jobs = [];

    if (sampler) {
      jobs.push(sampler.sampleNow().then(value => { native = value; }).catch(error => { macError = error; }));
    }
    jobs.push(si.networkStats("*").then(value => { networkRows = Array.isArray(value) ? value : []; }).catch(error => { networkError = error; }));
    jobs.push(si.networkInterfaces(false).then(value => { networkMetadata = Array.isArray(value) ? value : []; }).catch(() => {}));
    jobs.push(si.fsSize().then(value => { volumeRows = Array.isArray(value) ? value : []; }).catch(() => { volumeError = true; }));
    jobs.push(si.currentLoad().then(value => { systemInfo.load = value; }).catch(() => {}));
    jobs.push(si.mem().then(value => { systemInfo.memory = value; }).catch(() => {}));
    jobs.push(si.cpuTemperature().then(value => { systemInfo.temperature = value; }).catch(() => {}));
    jobs.push(si.cpu().then(value => { systemInfo.cpu = value; }).catch(() => {}));
    jobs.push(si.graphics().then(value => { systemInfo.graphics = value; }).catch(() => {}));
    jobs.push(si.system().then(value => { systemInfo.system = value; }).catch(() => {}));
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

    const fallbacks = [];
    addSystemInformationReadings(fallbacks, systemInfo, sampledAt);
    for (const fallback of fallbacks) {
      const index = readings.findIndex(reading => reading.metric === fallback.metric);
      if (index === -1) readings.push(fallback);
      else if (readings[index].status !== "available" && fallback.status === "available") readings[index] = fallback;
    }

    const systemInterfaces = osNetworkInterfaces();
    if (!networkMetadata.length) {
      networkMetadata = Object.entries(systemInterfaces).map(([iface, addresses]) => ({
        iface,
        default: false,
        operstate: addresses?.length ? "unknown" : "down",
        type: iface === "lo0" || iface === "lo" ? "loopback" : "unknown",
      }));
    }
    networkRows = networkRows.filter(network => typeof network.iface === "string" && network.iface.trim());
    if (!networkRows.length && networkMetadata.length) {
      networkRows = networkMetadata.map(network => ({
        iface: network.iface,
        operstate: network.operstate,
        rx_sec: null,
        tx_sec: null,
      }));
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
              : makeReading(metric, null, "Mbps", source, sampledAt, "No valid per-interface counter rate was reported by the current provider.", "unavailable");
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
    const controllers = Array.isArray(systemInfo.graphics?.controllers) ? systemInfo.graphics.controllers : [];
    const controllerModels = controllers.map(controller => {
      const vendor = String(controller.vendor || "").trim();
      const model = String(controller.model || "").trim();
      if (!model) return vendor || null;
      return vendor && !model.toLowerCase().startsWith(vendor.toLowerCase()) ? `${vendor} ${model}` : model;
    }).filter(Boolean);
    const appleChip = process.platform === "darwin"
      ? controllers.find(controller => /^Apple$/i.test(String(controller.vendor || "")) && /^Apple\s+(?:M\d+|A\d+\s+Pro)\b/i.test(String(controller.model || "")))
      : null;
    const gpuCoreCount = Number.parseInt(controllers[0]?.cores, 10);
    const device = {
      ...(sampler?.soc ?? native?.soc ?? {}),
      macModel: process.platform === "darwin" ? systemInfo.system?.version || systemInfo.system?.model || null : null,
      chipName: sampler?.soc?.chipName || appleChip?.model?.replace(/^Apple\s+/i, "Apple ") || null,
      cpuBrand: systemInfo.cpu?.brand || null,
      cpuCores: Number.isFinite(systemInfo.cpu?.physicalCores) ? systemInfo.cpu.physicalCores : systemInfo.cpu?.cores ?? null,
      memoryGb: Number.isFinite(systemInfo.memory?.total) ? systemInfo.memory.total / (1024 ** 3) : sampler?.soc?.memoryGb ?? null,
      gpuModels: controllerModels,
      gpuCores: Number.isFinite(gpuCoreCount) && gpuCoreCount > 0 ? gpuCoreCount : null,
    };

    const payload = {
      version: 1,
      sampledAt,
      staleAfterMs: STALE_AFTER_MS,
      state: availableCount ? "partial" : "unavailable",
      provider: sensorProvider ? `${sensorProvider} + systeminformation` : "systeminformation capability fallback",
      device,
      storageVolumes: volumeError ? null : volumeRows.map(volume => ({
        mount: volume.mount,
        filesystem: volume.fs,
        type: volume.type,
        sizeBytes: Number.isFinite(volume.size) ? volume.size : null,
        usedBytes: Number.isFinite(volume.used) ? volume.used : null,
        availableBytes: Number.isFinite(volume.available) ? volume.available : null,
        usePercent: Number.isFinite(volume.use) ? volume.use : null,
      })),
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

async function readLimited(response, expectedBytes) {
  if (!response.ok || new URL(response.url).origin !== SPEED_TEST_ORIGIN || !response.body) {
    throw new Error("The speed-test provider returned an invalid response.");
  }
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > expectedBytes) throw new Error("The provider exceeded the configured transfer limit.");
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (received !== expectedBytes) throw new Error("The provider returned an incomplete measurement.");
  return received;
}

async function consumeBounded(response, maximumBytes) {
  if (!response.ok || new URL(response.url).origin !== SPEED_TEST_ORIGIN || !response.body) {
    throw new Error("The speed-test provider returned an invalid upload response.");
  }
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) throw new Error("The provider returned an oversized response.");
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function runSpeedTest() {
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SPEED_TEST_TIMEOUT_MS);
  try {
    const downloadStarted = performance.now();
    const downloadResponse = await fetch(`${SPEED_TEST_ORIGIN}/__down?bytes=${SPEED_DOWNLOAD_BYTES}`, {
      method: "GET", redirect: "error", signal: controller.signal,
    });
    const downloaded = await readLimited(downloadResponse, SPEED_DOWNLOAD_BYTES);
    const downloadSeconds = Math.max((performance.now() - downloadStarted) / 1000, 0.001);

    const uploadStarted = performance.now();
    const uploadResponse = await fetch(`${SPEED_TEST_ORIGIN}/__up?bytes=${SPEED_UPLOAD_BYTES}`, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/octet-stream" },
      body: randomBytes(SPEED_UPLOAD_BYTES),
    });
    if (!uploadResponse.ok || new URL(uploadResponse.url).origin !== SPEED_TEST_ORIGIN) {
      throw new Error("The speed-test provider rejected the upload measurement.");
    }
    await consumeBounded(uploadResponse, 64 * 1024);
    const uploadSeconds = Math.max((performance.now() - uploadStarted) / 1000, 0.001);
    return {
      status: "available",
      source: "Cloudflare speed.cloudflare.com",
      sampledAt: startedAt,
      downloadMbps: downloaded * 8 / downloadSeconds / 1_000_000,
      uploadMbps: SPEED_UPLOAD_BYTES * 8 / uploadSeconds / 1_000_000,
      transferredBytes: SPEED_DOWNLOAD_BYTES + SPEED_UPLOAD_BYTES,
    };
  } catch (error) {
    return {
      status: "error",
      source: "Cloudflare speed.cloudflare.com",
      sampledAt: startedAt,
      detail: error.name === "AbortError" ? "Speed test timed out after 15 seconds." : "Speed test failed; no result was recorded.",
    };
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

const server = createServer(async (req, res) => {
  if (req.headers.host !== `${HOST}:${PORT}`) return send(res, 403, "text/plain; charset=utf-8", "Local host only.");
  if (req.headers.origin && req.headers.origin !== ORIGIN) return send(res, 403, "text/plain; charset=utf-8", "Same-origin requests only.");
  if (req.url === "/api/storage-scan/stop") {
    if (req.method !== "POST" || req.headers.origin !== ORIGIN || Number(req.headers["content-length"] || 0) !== 0 || req.headers["transfer-encoding"]) {
      return send(res, 403, "text/plain; charset=utf-8", "Same-origin POST without a body required.");
    }
    if (!storageScanPromise) return send(res, 409, "application/json; charset=utf-8", JSON.stringify({ status: storageScan.status }));
    storageScanStopRequested = true;
    return send(res, 202, "application/json; charset=utf-8", JSON.stringify({ status: "stopping" }));
  }
  if (req.url === "/api/storage-scan") {
    if (req.method === "GET") {
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify(storageScan));
    }
    if (req.method !== "POST") return send(res, 405, "text/plain; charset=utf-8", "GET or POST required.");
    if (req.headers.origin !== ORIGIN || Number(req.headers["content-length"] || 0) !== 0 || req.headers["transfer-encoding"]) {
      return send(res, 403, "text/plain; charset=utf-8", "Same-origin requests without a body only.");
    }
    if (storageScanPromise) return send(res, 409, "application/json; charset=utf-8", JSON.stringify({ status: "scanning", detail: "A storage scan is already running." }));
    storageScanStopRequested = false;
    storageScanPromise = scanMountedStorage().finally(() => { storageScanPromise = null; });
    return send(res, 202, "application/json; charset=utf-8", JSON.stringify({ status: "scanning" }));
  }
  if (req.url === "/api/speed-test") {
    if (req.method !== "POST") return send(res, 405, "text/plain; charset=utf-8", "POST required.");
    if (req.headers.origin !== ORIGIN || Number(req.headers["content-length"] || 0) !== 0 || req.headers["transfer-encoding"]) {
      return send(res, 403, "text/plain; charset=utf-8", "Same-origin requests without a body only.");
    }
    if (speedTestInFlight) return send(res, 429, "application/json; charset=utf-8", JSON.stringify({ detail: "A speed test is already running." }));
    if (Date.now() < speedTestAllowedAt) return send(res, 429, "application/json; charset=utf-8", JSON.stringify({ detail: "Please wait before running another speed test." }));
    speedTestAllowedAt = Date.now() + SPEED_TEST_COOLDOWN_MS;
    speedTestInFlight = runSpeedTest();
    try {
      const result = await speedTestInFlight;
      return send(res, result.status === "available" ? 200 : 502, "application/json; charset=utf-8", JSON.stringify(result));
    } finally {
      speedTestInFlight = null;
    }
  }
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
  console.log("Read-only sensor access. An internet speed test runs only after an explicit request.");
});

function stop() {
  sampler?.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
