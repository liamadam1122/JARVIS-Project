import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writePrivateJson } from "./private-json.mjs";

const DEFAULT_MEMORY_PATH = join(dirname(fileURLToPath(import.meta.url)), "data", "memory.json");

function memoryPath() {
  return process.env.JARVIS_MEMORY_PATH || DEFAULT_MEMORY_PATH;
}

const emptyMemory = () => ({
  version: 1,
  updatedAt: null,
  profile: { games: "", budget: "", notes: "", goals: "", cpu: "", ram: "", gpu: "", cooling: "", fans: "", monitor: "" },
  facts: [],
  threads: {},
});

function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function extractSpecsFromText(text, base = {}) {
  const source = String(text || "");
  const next = {
    games: clip(base.games, 200),
    budget: clip(base.budget, 80),
    notes: clip(base.notes, 240),
    goals: clip(base.goals, 200),
    cpu: clip(base.cpu, 160),
    ram: clip(base.ram, 80),
    gpu: clip(base.gpu, 160),
    cooling: clip(base.cooling, 80),
    fans: clip(base.fans, 160),
    monitor: clip(base.monitor, 160),
  };

  const labeled = (key) => {
    const match = source.match(new RegExp(`(?:^|[\\n;])\\s*${key}\\s*[:=-]\\s*([^;\\n]+)`, "i"));
    return match ? clip(match[1], 200) : "";
  };
  next.games = labeled("games?(?:\\s*/\\s*workload)?") || labeled("workload") || next.games;
  next.budget = labeled("budget") || labeled("spend(?:\\s*cap)?") || next.budget;
  next.notes = labeled("notes?") || labeled("symptoms?") || next.notes;
  next.cpu = labeled("cpu") || next.cpu;
  next.ram = labeled("ram") || labeled("memory") || next.ram;
  next.gpu = labeled("gpu") || labeled("graphics(?:\\s*card)?") || next.gpu;
  next.cooling = labeled("cooling") || next.cooling;
  next.fans = labeled("fans?") || next.fans;
  next.monitor = labeled("monitor") || labeled("display") || next.monitor;

  if (!next.games) {
    const play = source.match(/\b(?:i\s+play|playing)\s+([A-Za-z0-9][\w:'+-]{1,40})(?:\b|$)/i);
    if (play) next.games = clip(play[1], 80);
  }
  if (!next.budget) {
    const money = source.match(/(?:\$|€)\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*(?:€|eur|usd|\$)\b|\b(?:budget|spend|willing to spend|can spend)\s*(?:is|=|:)?\s*(\$?\d+|€\s*\d+|free|\$0|0)\b/i);
    if (money) next.budget = clip(money[1] || money[0], 40);
  }
  if (!next.notes) {
    const symptoms = source.match(/\b(stutter(?:ing)?|fps drop|overheat(?:ing)?|loud fans?|thermal throttle|crash(?:ing)?|on battery|plugged in)\b/ig);
    if (symptoms?.length) next.notes = clip([...new Set(symptoms.map(s => s.toLowerCase()))].join(", "), 240);
  }
  if (!next.cooling) {
    if (/\b(liquid cooling|water cooling|aio|closed loop)\b/i.test(source)) next.cooling = "liquid";
    else if (/\bair cooling\b/i.test(source)) next.cooling = "air";
  }
  if (!next.ram) {
    const ram = source.match(/\b(\d{1,3})\s*gb\s*(?:of\s*)?(?:ram|memory)\b/i);
    if (ram) next.ram = `${ram[1]} GB`;
  }
  if (!next.monitor) {
    const monitor = source.match(/\b(\d{3,4}p|\d{3,4}\s*x\s*\d{3,4}|\d{2,3}\s*hz)\b/i);
    if (monitor) next.monitor = clip(monitor[1], 40);
  }
  return next;
}

const OPTIMIZE_FIELDS = [
  ["cpu", "CPU"],
  ["ram", "RAM"],
  ["gpu", "graphics card and its memory"],
  ["cooling", "air or liquid cooling"],
  ["fans", "what the fans do"],
  ["monitor", "monitor size, resolution, and refresh rate"],
  ["games", "the games or workloads to tune"],
];

export function sensedHardware(telemetry) {
  const device = telemetry?.device || {};
  const displays = Array.isArray(device.displays) ? device.displays : [];
  const fans = (telemetry?.readings || [])
    .filter(reading => String(reading?.metric || "").startsWith("fan.rpm") && reading.status === "available" && typeof reading.value === "number")
    .map(reading => `${Math.round(reading.value)} rpm`)
    .slice(0, 4);
  return {
    cpu: clip(device.cpuBrand || device.chipName, 160),
    ram: Number.isFinite(device.memoryGb) ? `${device.memoryGb.toFixed(0)} GiB` : "",
    gpu: clip(Array.isArray(device.gpuModels) ? device.gpuModels.join(", ") : "", 160),
    fans: fans.length ? fans.join(", ") : "",
    monitor: clip(displays.map(display => [display.model, display.resolution, display.refresh ? `${display.refresh} Hz` : ""].filter(Boolean).join(" ")).join("; "), 160),
    cooling: "",
  };
}

export function mergeSensedSpecs(specs, telemetry) {
  const sensed = sensedHardware(telemetry);
  const next = { ...specs };
  for (const key of ["cpu", "ram", "gpu", "fans", "monitor", "cooling"]) {
    if (!clip(next[key], 1) && clip(sensed[key], 1)) next[key] = sensed[key];
  }
  return next;
}

export function extractSpecsFromHistory(history = [], question = "", base = {}) {
  let specs = { ...base };
  for (const turn of history) {
    if (turn?.role === "user" && turn.content) specs = extractSpecsFromText(turn.content, specs);
  }
  return extractSpecsFromText(question, specs);
}

export function specsComplete(specs, mode) {
  if (mode !== "optimize" && mode !== "diagnose") return true;
  if (mode === "optimize") return OPTIMIZE_FIELDS.every(([key]) => clip(specs[key], 1));
  return true;
}

export function askForSpecs(mode, specs) {
  if (mode !== "optimize") {
    return "I can start from the sensors. Tell me the game, when it started, and what you are willing to spend, including nothing.";
  }
  const known = OPTIMIZE_FIELDS.filter(([key]) => clip(specs[key], 1)).map(([key, label]) => `${label}: ${specs[key]}`);
  const missing = OPTIMIZE_FIELDS.filter(([key]) => !clip(specs[key], 1)).map(([, label]) => label);
  return [
    "Before an optimization plan I need the machine filled in. I will not guess the missing parts.",
    known.length ? `Already read: ${known.join(". ")}.` : "I could not read enough of this computer to skip the questions.",
    missing.length ? `Reply with ${missing.join(", ")}.` : "",
    "One message is enough. Example: cooling: air; fans: they spin; monitor: 27 inch 1440p 165 Hz; games: the game you play. Correct anything I already read if it is wrong.",
    "You do not need a budget. I will still show a free plan and a paid plan, and I will say you do not have to spend money.",
  ].filter(Boolean).join(" ");
}

async function ensureMemory() {
  try {
    const raw = await readFile(memoryPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...emptyMemory(),
      ...parsed,
      profile: { ...emptyMemory().profile, ...(parsed.profile || {}) },
      facts: Array.isArray(parsed.facts) ? parsed.facts.slice(-40) : [],
      threads: parsed.threads && typeof parsed.threads === "object" ? parsed.threads : {},
    };
  } catch {
    return emptyMemory();
  }
}

let writeChain = Promise.resolve();

function withMemoryLock(work) {
  const run = writeChain.then(work, work);
  writeChain = run.then(() => {}, () => {});
  return run;
}

async function saveMemory(memory) {
  memory.updatedAt = new Date().toISOString();
  await writePrivateJson(memoryPath(), memory);
  return memory;
}

export async function loadMemory() {
  return ensureMemory();
}

function cleanChat(chat) {
  if (!chat || typeof chat.id !== "string" || !chat.id.trim()) return null;
  const history = (Array.isArray(chat.history) ? chat.history : [])
    .filter(turn => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .slice(-40)
    .map(turn => ({ role: turn.role, content: turn.content.slice(0, 4000) }));
  if (!history.length) return null;
  return {
    id: chat.id.trim().slice(0, 64),
    title: clip(chat.title, 80) || "New conversation",
    history,
    updatedAt: typeof chat.updatedAt === "string" ? chat.updatedAt : new Date().toISOString(),
  };
}

export async function loadChats() {
  const memory = await ensureMemory();
  const chats = Array.isArray(memory.chats) ? memory.chats : [];
  return chats.map(cleanChat).filter(Boolean).slice(0, 40);
}

export async function saveChats(chats) {
  return withMemoryLock(async () => {
    const memory = await ensureMemory();
    memory.chats = (Array.isArray(chats) ? chats : []).map(cleanChat).filter(Boolean).slice(0, 40);
    await saveMemory(memory);
    return memory.chats;
  });
}

export async function rememberInteraction({ mode, question, reply, specs, threadId = "default" }) {
  return withMemoryLock(() => rememberUnlocked({ mode, question, reply, specs, threadId }));
}

async function rememberUnlocked({ mode, question, reply, specs, threadId = "default" }) {
  const memory = await ensureMemory();
  memory.profile = {
    games: clip(specs?.games || memory.profile.games, 200),
    budget: clip(specs?.budget || memory.profile.budget, 80),
    notes: clip(specs?.notes || memory.profile.notes, 240),
    goals: clip(specs?.goals || memory.profile.goals, 200),
    cpu: clip(specs?.cpu || memory.profile.cpu, 160),
    ram: clip(specs?.ram || memory.profile.ram, 80),
    gpu: clip(specs?.gpu || memory.profile.gpu, 160),
    cooling: clip(specs?.cooling || memory.profile.cooling, 80),
    fans: clip(specs?.fans || memory.profile.fans, 160),
    monitor: clip(specs?.monitor || memory.profile.monitor, 160),
  };

  const fact = clip(`${mode}: ${question} → ${String(reply || "").slice(0, 180)}`, 280);
  if (fact) {
    memory.facts = [...memory.facts.filter(item => item !== fact), fact].slice(-40);
  }

  const thread = Array.isArray(memory.threads[threadId]) ? memory.threads[threadId] : [];
  thread.push(
    { role: "user", content: clip(question, 2000), at: new Date().toISOString() },
    { role: "assistant", content: clip(reply, 2000), at: new Date().toISOString() },
  );
  memory.threads[threadId] = thread.slice(-40);
  const problem = /\b(optim\w*|diagnos|hot|heat|fan|crash|slow|stutter|fps|lag)\b/i.test(question || "");
  if (problem && reply) {
    const caseNote = {
      at: new Date().toISOString(),
      problem: clip(question, 180),
      step: clip(reply, 240),
    };
    const cases = Array.isArray(memory.cases) ? memory.cases : [];
    memory.cases = [...cases, caseNote].slice(-8);
  }
  await saveMemory(memory);
  return memory;
}

function mentions(question, text) {
  const haystack = String(question || "").toLowerCase();
  const tokens = String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 3);
  return tokens.some(token => haystack.includes(token));
}

export function memoryContext(memory, question = "") {
  if (!memory) return "";
  const personal = mentions(question, memory.profile?.games) || mentions(question, memory.profile?.notes);
  const profileBits = [
    personal && memory.profile?.games ? `games=${memory.profile.games}` : "",
    personal && memory.profile?.budget ? `budget=${memory.profile.budget}` : "",
    personal && memory.profile?.notes ? `notes=${memory.profile.notes}` : "",
    memory.profile?.goals ? `goals=${memory.profile.goals}` : "",
    memory.profile?.cpu ? `cpu=${memory.profile.cpu}` : "",
    memory.profile?.ram ? `ram=${memory.profile.ram}` : "",
    memory.profile?.gpu ? `gpu=${memory.profile.gpu}` : "",
    memory.profile?.cooling ? `cooling=${memory.profile.cooling}` : "",
    memory.profile?.fans ? `fans=${memory.profile.fans}` : "",
    memory.profile?.monitor ? `monitor=${memory.profile.monitor}` : "",
  ].filter(Boolean);
  const threadFacts = Array.isArray(memory.threads?.[memory.activeThread])
    ? memory.threads[memory.activeThread].slice(-4).map(item => item.content).join(" | ")
    : "";
  const facts = personal ? (memory.facts || []).slice(-8).join(" | ") : threadFacts;
  const cases = personal
    ? (Array.isArray(memory.cases) ? memory.cases : []).slice(-3).map(item => `${item.problem} → ${item.step}`).join(" | ")
    : "";
  return [
    profileBits.length ? `KNOWN PROFILE: ${profileBits.join("; ")}` : "",
    cases ? `PAST CASES: ${cases}` : "",
    facts ? `RECENT MEMORY: ${facts}` : "",
  ].filter(Boolean).join("\n");
}

export async function forgetFact(index) {
  return withMemoryLock(async () => {
    const memory = await ensureMemory();
    const facts = Array.isArray(memory.facts) ? memory.facts : [];
    const at = Number(index);
    if (!Number.isInteger(at) || at < 0 || at >= facts.length) return memory;
    facts.splice(at, 1);
    memory.facts = facts;
    await saveMemory(memory);
    return memory;
  });
}

export async function clearMemory() {
  return withMemoryLock(async () => {
    const fresh = emptyMemory();
    await saveMemory(fresh);
    return fresh;
  });
}
