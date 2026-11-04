import assert from "node:assert/strict";
import test from "node:test";
import { discreteGpuName, parseNvidiaSmiCsv, readingsFromNvidia } from "../providers/common.mjs";
import { readingsFromHwmon } from "../providers/linux.mjs";
import { parsePmsetTherm, thermalReading } from "../providers/mac.mjs";
import { readingsFromLibre } from "../providers/windows.mjs";
import { demoReply, nextDemoPayload, stripValue } from "../recorder.mjs";

test("nvidia-smi text becomes a GPU temperature and a fan percent", () => {
  const rows = parseNvidiaSmiCsv("NVIDIA GeForce RTX 4060, 72, 96, 1800, 48, 110\n");
  const readings = readingsFromNvidia(rows, "2026-11-04T00:00:00.000Z");
  assert.equal(readings.find(item => item.metric === "temperature.gpu").value, 72);
  assert.equal(readings.find(item => item.metric === "fan.gpu.speed").unit, "%");
  assert.equal(discreteGpuName(["Intel UHD", "NVIDIA GeForce RTX 4060"]), "NVIDIA GeForce RTX 4060");
});

test("hwmon millidegrees become celsius and pmset no-warning stays honest", () => {
  const hwmon = readingsFromHwmon({ nvme: { name: "nvme", temp1_input: "42000" }, cpu: { name: "coretemp", temp1_input: "61000" } }, "2026-11-04T00:00:00.000Z");
  assert.equal(hwmon.find(item => item.metric === "temperature.cpu").value, 61);
  const thermal = thermalReading(parsePmsetTherm("Note: No thermal warning level has been recorded"), "2026-11-04T00:00:00.000Z");
  assert.equal(thermal.value, 0);
  assert.match(thermal.detail, /no thermal warning/i);
});

test("LibreHardwareMonitor JSON can supply a CPU temperature", () => {
  const readings = readingsFromLibre({
    Text: "PC",
    Children: [{ Text: "CPU Package", Value: "88 °C", Children: [] }],
  }, "2026-11-04T00:00:00.000Z");
  assert.equal(readings[0].metric, "temperature.cpu");
  assert.equal(readings[0].value, 88);
  assert.equal(readings[0].source, "LibreHardwareMonitor");
});

test("a recording strips the account name and a demo does not invent readings", () => {
  const stripped = stripValue({ path: "/Users/liamadam/Desktop/save", mac: "aa:bb:cc:dd:ee:ff" });
  assert.equal(stripped.path, "/Users/user/Desktop/save");
  assert.equal(stripped.mac, "00:00:00:00:00:00");
  const empty = nextDemoPayload({ samples: [] }, 0);
  assert.equal(empty.state, "unavailable");
  assert.equal(empty.readings.length, 0);
  assert.equal(demoReply({ replies: [{ question: "Hot?", reply: "Safari is busy.", ideas: [] }] }, "Hot?").reply, "Safari is busy.");
  assert.equal(demoReply({ replies: [] }, "Something else"), null);
});
