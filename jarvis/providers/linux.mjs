import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseNvidiaSmiCsv, readingsFromNvidia, sensorReading } from "./common.mjs";

export function readingsFromHwmon(files, sampledAt) {
  const readings = [];
  for (const [name, entries] of Object.entries(files || {})) {
    const label = String(entries.name || name);
    const raw = entries.temp1_input;
    const celsius = Number(raw);
    if (!Number.isFinite(celsius)) continue;
    const metric = /gpu|amdgpu|nvidia/i.test(label) ? "temperature.gpu" : /cpu|k10temp|coretemp/i.test(label) ? "temperature.cpu" : "temperature.board";
    readings.push(sensorReading({
      metric,
      value: celsius > 1000 ? celsius / 1000 : celsius,
      unit: "°C",
      source: "hwmon",
      sampledAt,
      detail: `${label} temperature from Linux hwmon.`,
      maxAgeMs: 15_000,
    }));
  }
  return readings;
}

async function readHwmon(root = "/sys/class/hwmon") {
  const files = {};
  let names = [];
  try {
    names = await readdir(root);
  } catch {
    return files;
  }
  for (const name of names) {
    try {
      const chip = join(root, name);
      const label = await readFile(join(chip, "name"), "utf8").catch(() => name);
      const temp = await readFile(join(chip, "temp1_input"), "utf8");
      files[name] = { name: label.trim(), temp1_input: temp.trim() };
    } catch {
      /* this chip has no temp1_input */
    }
  }
  return files;
}

function commandText(command, args) {
  return new Promise(resolve => {
    execFile(command, args, { timeout: 1500 }, (error, stdout) => {
      resolve(error ? "" : String(stdout || ""));
    });
  });
}

export async function linuxExtraReadings({ sampledAt, hwmonRoot, nvidiaText = "" }) {
  const hwmon = readingsFromHwmon(await readHwmon(hwmonRoot), sampledAt);
  const nvidia = readingsFromNvidia(parseNvidiaSmiCsv(nvidiaText || await commandText("nvidia-smi", [
    "--query-gpu=name,temperature.gpu,utilization.gpu,clocks.gr,fan.speed,power.draw",
    "--format=csv,noheader,nounits",
  ])), sampledAt);
  return [...hwmon, ...nvidia];
}
