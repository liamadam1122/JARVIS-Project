import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { finishExperiment, startExperiment } from "../experiments.mjs";

test("an experiment stores the before reading and the measured after reading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-experiments-"));
  process.env.JARVIS_EXPERIMENTS_PATH = join(dir, "experiments.json");
  try {
    const started = await startExperiment({ ideaId: "close-culprit", metric: "cpu.usage", before: 72 });
    const finished = await finishExperiment(started.id, 28);
    assert.equal(finished.before, 72);
    assert.equal(finished.after, 28);
    assert.equal(await finishExperiment("missing", 1), null);
  } finally {
    delete process.env.JARVIS_EXPERIMENTS_PATH;
    await rm(dir, { recursive: true, force: true });
  }
});
