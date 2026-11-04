import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writePrivateJson } from "./private-json.mjs";

const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), "data", "experiments.json");

function experimentsPath() {
  return process.env.JARVIS_EXPERIMENTS_PATH || DEFAULT_PATH;
}

function emptyStore() {
  return { version: 1, experiments: [] };
}

export async function loadExperiments() {
  try {
    const parsed = JSON.parse(await readFile(experimentsPath(), "utf8"));
    return {
      version: 1,
      experiments: Array.isArray(parsed.experiments) ? parsed.experiments : [],
    };
  } catch {
    return emptyStore();
  }
}

export async function startExperiment({ ideaId, metric, before }) {
  const store = await loadExperiments();
  const experiment = {
    id: randomUUID(),
    ideaId: String(ideaId || "").slice(0, 80),
    metric: String(metric || "cpu.usage").slice(0, 80),
    before: Number.isFinite(before) ? before : null,
    after: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  store.experiments = [...store.experiments, experiment].slice(-40);
  await writePrivateJson(experimentsPath(), store);
  return experiment;
}

export async function finishExperiment(id, after) {
  const store = await loadExperiments();
  const experiment = store.experiments.find(item => item.id === id);
  if (!experiment) return null;
  experiment.after = Number.isFinite(after) ? after : null;
  experiment.finishedAt = new Date().toISOString();
  await writePrivateJson(experimentsPath(), store);
  return experiment;
}
