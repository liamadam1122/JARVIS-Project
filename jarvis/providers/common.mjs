export function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function sensorReading({ metric, value, unit, source, sampledAt, detail, status, maxAgeMs }) {
  const numeric = finiteNumber(value);
  const resolved = status || (numeric == null ? "unavailable" : "available");
  return {
    metric,
    value: resolved === "available" ? numeric : null,
    unit,
    status: resolved === "available" && numeric == null ? "unavailable" : resolved,
    source: source || null,
    sampledAt: sampledAt || null,
    detail,
    maxAgeMs: Number.isFinite(maxAgeMs) ? maxAgeMs : undefined,
  };
}

export function parseNvidiaSmiCsv(text) {
  return String(text || "").split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const [name, temp, util, clock, fan, power] = line.split(",").map(part => part.trim());
    return {
      name: name || "",
      temp: finiteNumber(temp),
      util: finiteNumber(util),
      clock: finiteNumber(clock),
      fan: finiteNumber(fan),
      power: finiteNumber(power),
    };
  }).filter(row => row.name || row.temp != null || row.util != null);
}

export function readingsFromNvidia(rows, sampledAt) {
  const gpu = (rows || []).find(row => row.temp != null || row.util != null || row.fan != null);
  if (!gpu) return [];
  const source = "nvidia-smi";
  const readings = [];
  if (gpu.temp != null) {
    readings.push(sensorReading({
      metric: "temperature.gpu", value: gpu.temp, unit: "°C", source, sampledAt,
      detail: `GPU temperature for ${gpu.name || "the NVIDIA GPU"} from nvidia-smi.`,
      maxAgeMs: 15_000,
    }));
  }
  if (gpu.util != null) {
    readings.push(sensorReading({
      metric: "gpu.usage", value: gpu.util, unit: "%", source, sampledAt,
      detail: "GPU utilization from nvidia-smi.",
      maxAgeMs: 15_000,
    }));
  }
  if (gpu.clock != null) {
    readings.push(sensorReading({
      metric: "gpu.frequency", value: gpu.clock, unit: "MHz", source, sampledAt,
      detail: "GPU clock from nvidia-smi.",
      maxAgeMs: 15_000,
    }));
  }
  if (gpu.power != null) {
    readings.push(sensorReading({
      metric: "gpu.power", value: gpu.power, unit: "W", source, sampledAt,
      detail: "GPU power from nvidia-smi.",
      maxAgeMs: 15_000,
    }));
  }
  if (gpu.fan != null) {
    readings.push(sensorReading({
      metric: "fan.gpu.speed", value: gpu.fan, unit: "%", source, sampledAt,
      detail: "GPU fan speed as a percent of full, from nvidia-smi. This is not an RPM.",
      maxAgeMs: 15_000,
    }));
  }
  return readings;
}

export function discreteGpuName(models = []) {
  return models.find(name => /nvidia|geforce|rtx|radeon|\bamd\b/i.test(String(name))) || null;
}

export function groupForMetric(metric) {
  if (/^temperature|^fan\.|^thermal/.test(metric)) return "Heat";
  if (/power|voltage/.test(metric)) return "Power";
  if (/usage|frequency|^memory/.test(metric)) return "Load";
  return "Other";
}

export function mergeReadings(existing, extra) {
  for (const reading of extra || []) {
    const index = existing.findIndex(item => item.metric === reading.metric);
    if (index === -1) existing.push(reading);
    else if (existing[index].status !== "available" && reading.status === "available") existing[index] = reading;
  }
  return existing;
}
