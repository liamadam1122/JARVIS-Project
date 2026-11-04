import { detectLanguage, machinePlaybookLocalized, replyInLanguageInstruction } from "./language.mjs";

const OLLAMA = "http://127.0.0.1:11434";
// Prefer smaller models on 8 GB Macs so the UI stays responsive.
const PREFERRED_MODELS = ["llama3.2:1b", "gemma3:1b", "llama3.2:3b", "qwen2.5:3b", "phi3:mini"];
const CHAT_TIMEOUT_MS = 90_000;
const KEY_METRICS = [
  "cpu.usage", "gpu.usage", "temperature.cpu", "temperature.gpu",
  "memory.ram.usage", "memory.swap.usage", "cpu.power", "gpu.power",
];

function compactReadings(telemetry) {
  const map = new Map((telemetry?.readings || []).filter(r => r?.metric).map(r => [r.metric, r]));
  const rows = [];
  for (const metric of KEY_METRICS) {
    const reading = map.get(metric);
    if (!reading) continue;
    if (reading.status === "available" && typeof reading.value === "number" && Number.isFinite(reading.value)) {
      rows.push(`${metric}=${Number(reading.value.toFixed(1))}${reading.unit || ""}`);
    } else {
      rows.push(`${metric}:${reading.status || "unavailable"}`);
    }
  }
  const device = telemetry?.device || {};
  const kind = device.formFactor === "laptop" ? "laptop" : device.formFactor === "desktop" ? "desktop PC" : "computer";
  const busy = (telemetry?.busyApps || []).map(app => `${app.name} cpu ${app.cpu}% memory ${app.mem}%`).join("; ");
  const heavy = (telemetry?.heavyApps || []).map(app => `${app.name} (cpu ${app.cpu}%, memory ${app.mem}%)`).join("; ");
  return [
    `machine: ${kind}`,
    `device: ${[device.model || device.macModel, device.chipName, device.cpuBrand, Array.isArray(device.gpuModels) ? device.gpuModels.join(", ") : "", Number.isFinite(device.memoryGb) ? `${device.memoryGb.toFixed(0)} GiB memory` : ""].filter(Boolean).join(" · ") || "unknown"}`,
    rows.join("; ") || "no key readings",
    Array.isArray(telemetry?.culprits) && telemetry.culprits.length
      ? `culprits: ${telemetry.culprits.map(item => `${item.app} ${item.cpuCores} cores for ${item.sustainedForSec}s confidence ${item.confidence}`).join("; ")}`
      : (busy ? `busiest apps: ${busy}` : "busiest apps: unavailable"),
    heavy ? `unusually heavy: ${heavy}` : "unusually heavy: none",
  ].join("\n");
}

export function machinePlaybook(device = {}, lang = "en") {
  return machinePlaybookLocalized(device, lang);
}

export function polishReply(text) {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\w])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[*•●▪]\s+/gm, "")
    .replace(/[★☆✦✧▶►]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function systemPrompt(_mode, specs, telemetry, memoryText, lang = "en") {
  return [
    "You are JARVIS, a premium private assistant for this laptop or desktop PC. One conversation covers chat, everyday work writing, troubleshooting, and careful optimization.",
    replyInLanguageInstruction(lang),
    "Voice: calm, precise, smooth. Write plain sentences. No slang unless the user uses it. No hype. No filler.",
    "Never use emojis, asterisks, stars, markdown, headings, or decorative symbols. Do not format with bold or bullets made of stars.",
    "Do not sound like a fixed script or an automated ticket reply. Answer the latest message directly, in your own words, using the live readings only when they help.",
    "Long messages: one short summary, then the answer. Work writing stays concise. Stop when done.",
    "You can see this computer's live readings and the apps using the most CPU and memory. The same reading path covers laptops and desktop PCs. A laptop is a machine with a battery. A desktop is a machine without one.",
    "Always answer. A missing sensor, fan speed, cooling type, monitor, or game does not stop the reply. Name that one item as unavailable, then continue with everything else you can read. Do not invent the missing number. Do not refuse, stall, or send a questionnaire instead of an answer.",
    "Do not dump a specification list during ordinary chat or writing. Answer the question.",
    "If culprits are present, name the friendly app and its confidence. You see apps, not websites, tabs, or files. For a browser, say one or more tabs or extensions. Do not invent which site.",
    "If RANKED IDEAS are present, explain the top idea first. Offer a free idea before a paid one. Do not add an idea that is not in that list.",
    "A remembered game is only a name from an earlier message. Never say the user cannot run a game. Do not mention a game unless the user names it in their latest message. An old reply, an example, or a laptop with 8 GiB of memory is not proof a game will not launch.",
    "If PAST CASES are present, use them only when the user is talking about that same problem. Do not drag an old game into a new question.",
    "If a marked moment is included, say in one sentence whether CPU or memory moved, and whether that is better.",
    "A problem is a fault: heat, fans stopped, crashes, stutter, slowness. Explain what the problem is in plain language, then what can be done about it. Use every reading that is present. One reversible next step. Never claim you changed the machine. Do not turn a fault into a shopping list.",
    "Optimization always gets an answer in the same reply. Free plan first: ordered steps in system settings and only well-known free tools from the PC or laptop maker, NVIDIA, or AMD. Paid plan second: only parts that match the readings you actually have, such as cooling, RAM, or a monitor. Say which plan fits better. Say they do not need to spend money. If cooling, fans, or the monitor were not read, still write both plans and mark only those items unavailable. Never suggest cracks, cheats, undervolt tools from unknown publishers, or unknown optimizer downloads.",
    "Ordinary chat, greetings, and writing help do not need a free plan or a paid plan.",
    machinePlaybook(telemetry?.device, lang).guidance,
    memoryText || "",
    specs?.games ? `User-stated games/workload: ${specs.games}` : "",
    specs?.budget ? `User-stated budget: ${specs.budget}` : "",
    specs?.notes ? `User-stated notes: ${specs.notes}` : "",
    specs?.cpu ? `CPU: ${specs.cpu}` : "",
    specs?.ram ? `RAM: ${specs.ram}` : "",
    specs?.gpu ? `Graphics: ${specs.gpu}` : "",
    specs?.cooling ? `Cooling: ${specs.cooling}` : "",
    specs?.fans ? `Fans: ${specs.fans}` : "",
    specs?.monitor ? `Monitor: ${specs.monitor}` : "",
    "LIVE MACHINE:",
    compactReadings(telemetry),
  ].filter(Boolean).join("\n");
}

export function buildChatMessages({ mode, question, specs, telemetry, history, memoryText, language }) {
  const lang = detectLanguage(question, language);
  const messages = [
    { role: "system", content: systemPrompt(mode, specs, telemetry, memoryText, lang) },
  ];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-4)) {
      if (!turn || (turn.role !== "user" && turn.role !== "assistant")) continue;
      const content = String(turn.content || "").slice(0, 800);
      if (content) messages.push({ role: turn.role, content });
    }
  }
  messages.push({ role: "user", content: String(question || "").slice(0, 8000) });
  return messages;
}

async function listModels() {
  const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error("Ollama tags failed");
  const data = await response.json();
  return (data.models || []).map(model => model.name).filter(Boolean);
}

export async function ollamaStatus() {
  try {
    const models = await listModels();
    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  }
}

export async function localChat({ mode, question, specs, telemetry, history, memoryText }) {
  const models = await listModels();
  const model = PREFERRED_MODELS.find(name => models.some(item => item === name || item.startsWith(`${name}-`) || item.startsWith(name)))
    || models[0];
  if (!model) {
    throw new Error("The local model is still downloading (about 2 GB). Leave this page open and try again in a few minutes.");
  }

  const messages = buildChatMessages({ mode, question, specs, telemetry, history, memoryText });

  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      keep_alive: "2m",
      options: { temperature: 0.4, num_ctx: 4096, num_predict: 700 },
    }),
  });
  if (!response.ok) throw new Error("Local model request failed.");
  const data = await response.json();
  const reply = data?.message?.content?.trim();
  if (!reply) throw new Error("Local model returned an empty reply.");
  return { reply, model, appliedChanges: false };
}
