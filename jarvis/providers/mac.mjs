import { execFile } from "node:child_process";
import { macHasNoFan } from "../device.mjs";
import { sensorReading } from "./common.mjs";

export function parsePmsetTherm(text) {
  const source = String(text || "");
  if (/no thermal warning/i.test(source)) {
    return { value: 0, detail: "pmset reports no thermal warning." };
  }
  const limit = source.match(/CPU_Speed_Limit\s*=\s*(\d+)/i);
  if (limit) {
    return { value: Number(limit[1]), detail: "CPU speed limit reported by pmset -g therm." };
  }
  return null;
}

export function thermalReading(parsed, sampledAt) {
  if (!parsed) {
    return sensorReading({
      metric: "thermal.pressure", value: null, unit: "level", source: "pmset", sampledAt,
      status: "unsupported",
      detail: "This sensor provider does not expose macOS thermal pressure.",
    });
  }
  return sensorReading({
    metric: "thermal.pressure", value: parsed.value, unit: "level", source: "pmset", sampledAt,
    detail: parsed.detail, maxAgeMs: 30_000,
  });
}

export function fanlessReading(modelText, sampledAt) {
  const fanless = macHasNoFan(modelText);
  return sensorReading({
    metric: "fan.rpm", value: null, unit: "rpm", source: "apple-silicon-metrics/macmon", sampledAt,
    status: fanless ? "unsupported" : "unavailable",
    detail: fanless ? "This Mac has no fan." : "No fan tachometer reading was reported by the sensor provider.",
  });
}

function commandText(command, args) {
  return new Promise(resolve => {
    execFile(command, args, { timeout: 1200 }, (error, stdout) => {
      resolve(error ? "" : String(stdout || ""));
    });
  });
}

let cachedTherm = { at: 0, text: "" };

export async function macExtraReadings({ modelText, sampledAt }) {
  const now = Date.now();
  if (now - cachedTherm.at > 30_000) {
    cachedTherm = { at: now, text: process.platform === "darwin" ? await commandText("/usr/bin/pmset", ["-g", "therm"]) : "" };
  }
  return [thermalReading(parsePmsetTherm(cachedTherm.text), sampledAt)];
}
