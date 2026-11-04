import { readFile } from "node:fs/promises";
import { writePrivateJson } from "./private-json.mjs";

export function stripValue(value) {
  const text = JSON.stringify(value);
  const cleaned = text
    .replace(/\/Users\/[^/"\\]+/g, "/Users/user")
    .replace(/\/home\/[^/"\\]+/g, "/home/user")
    .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, "00:00:00:00:00:00")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "0.0.0.0");
  return JSON.parse(cleaned);
}

async function load(file) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return {
      version: 1,
      samples: Array.isArray(parsed.samples) ? parsed.samples : [],
      replies: Array.isArray(parsed.replies) ? parsed.replies : [],
    };
  } catch {
    return { version: 1, samples: [], replies: [] };
  }
}

export async function appendSample(file, sample) {
  const session = await load(file);
  session.samples = [...session.samples, stripValue(sample)].slice(-80);
  await writePrivateJson(file, session);
  return session;
}

export async function appendReply(file, reply) {
  const session = await load(file);
  session.replies = [...session.replies, stripValue(reply)].slice(-40);
  await writePrivateJson(file, session);
  return session;
}

export async function loadDemo(file) {
  return load(file);
}

export function nextDemoPayload(session, index) {
  const samples = session?.samples || [];
  if (!samples.length) {
    return {
      version: 1,
      sampledAt: new Date().toISOString(),
      state: "unavailable",
      readings: [],
      series: [],
      demo: true,
      detail: "This demo file has no recorded readings.",
    };
  }
  const sample = samples[index % samples.length];
  return { ...sample, demo: true };
}

export function demoReply(session, question) {
  const replies = session?.replies || [];
  const exact = replies.find(item => item.question === question);
  return exact || null;
}
