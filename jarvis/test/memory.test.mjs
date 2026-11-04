import assert from "node:assert/strict";
import test from "node:test";
import { memoryContext } from "../memory.mjs";

const memory = {
  profile: { games: "Fortnite", notes: "stuttering when building", cpu: "Apple M2", ram: "8 GB" },
  facts: ["User cannot run Fortnite"],
  cases: [{ problem: "Fortnite stutters", step: "close the browser" }],
  threads: {},
};

test("an optimization question does not inherit a remembered game", () => {
  const text = memoryContext(memory, "Optimize this PC for gaming");
  assert.doesNotMatch(text, /fortnite/i);
  assert.match(text, /Apple M2/);
});

test("a question that names the game can use that memory", () => {
  assert.match(memoryContext(memory, "Fortnite stutters when I build"), /Fortnite/);
});
