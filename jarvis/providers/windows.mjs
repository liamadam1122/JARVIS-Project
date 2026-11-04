import { execFile } from "node:child_process";
import { parseNvidiaSmiCsv, readingsFromNvidia, sensorReading } from "./common.mjs";

export function parseLibreHardwareMonitor(payload) {
  const found = [];
  const walk = node => {
    if (!node || typeof node !== "object") return;
    const text = `${node.Text || ""} ${node.SensorId || ""}`;
    const value = node.Value;
    if (typeof value === "string" && /°C|C$/.test(value)) {
      const numeric = Number(value.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(numeric)) {
        const metric = /gpu/i.test(text) ? "temperature.gpu" : /cpu/i.test(text) ? "temperature.cpu" : null;
        if (metric) found.push({ metric, value: numeric, detail: `${node.Text || "Sensor"} from LibreHardwareMonitor.` });
      }
    }
    for (const child of node.Children || []) walk(child);
  };
  walk(payload);
  return found;
}

export function readingsFromLibre(payload, sampledAt) {
  return parseLibreHardwareMonitor(payload).map(item => sensorReading({
    ...item,
    unit: "°C",
    source: "LibreHardwareMonitor",
    sampledAt,
    maxAgeMs: 15_000,
  }));
}

function commandText(command, args) {
  return new Promise(resolve => {
    execFile(command, args, { timeout: 1500 }, (error, stdout) => {
      resolve(error ? "" : String(stdout || ""));
    });
  });
}

async function libreIfRunning(sampledAt) {
  try {
    const response = await fetch("http://127.0.0.1:8085/data.json", { signal: AbortSignal.timeout(400) });
    if (!response.ok) return [];
    return readingsFromLibre(await response.json(), sampledAt);
  } catch {
    return [];
  }
}

export async function windowsExtraReadings({ sampledAt, nvidiaText = "" }) {
  const readings = readingsFromNvidia(parseNvidiaSmiCsv(nvidiaText || await commandText("nvidia-smi", [
    "--query-gpu=name,temperature.gpu,utilization.gpu,clocks.gr,fan.speed,power.draw",
    "--format=csv,noheader,nounits",
  ])), sampledAt);
  readings.push(...await libreIfRunning(sampledAt));
  return readings;
}
