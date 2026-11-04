import assert from "node:assert/strict";
import test from "node:test";
import { classifyProcess, sustainedLoadShouldFlag } from "../culprit.mjs";

test("groups WebKit helper processes as Safari web pages", () => {
  const named = classifyProcess({ name: "com.apple.WebKit.WebContent" });
  assert.equal(named.app, "Safari (web pages)");
});

test("flags a sustained heavy app and does not name a website", () => {
  const samples = Array.from({ length: 8 }, () => ([
    { name: "com.apple.WebKit.WebContent", command: "https://www.youtube.com/watch?v=abc", cpu: 180, mem: 8, pid: 10 },
    { name: "com.apple.WebKit.GPU", cpu: 40, mem: 2, pid: 11, parentPid: 10 },
  ]));
  const culprits = sustainedLoadShouldFlag(samples);
  assert.equal(culprits[0].app, "Safari (web pages)");
  assert.match(culprits[0].explanation, /cannot name the website/i);
  assert.doesNotMatch(JSON.stringify(culprits), /youtube|https?:/i);
});

test("a short spike is not a culprit", () => {
  assert.equal(sustainedLoadShouldFlag([[{ name: "com.apple.WebKit.WebContent", cpu: 700, mem: 4, pid: 3 }]]).length, 0);
});
