import { detectLanguage, machinePlaybookLocalized, replyInLanguageInstruction } from "./language.mjs";

const OLLAMA = "http://127.0.0.1:11434";
// Prefer smaller models on 8 GB Macs so the UI stays responsive.
const PREFERRED_MODELS = ["llama3.2:1b", "gemma3:1b", "llama3.2:3b", "qwen2.5:3b", "phi3:mini"];
const CHAT_TIMEOUT_MS = 90_000;

function readingValue(map, metric) {
  const reading = map.get(metric);
  if (reading?.status === "available" && typeof reading.value === "number" && Number.isFinite(reading.value)) {
    return { ok: true, value: reading.value, unit: reading.unit || "", detail: reading.detail || "" };
  }
  return { ok: false, status: reading?.status || "unavailable", detail: reading?.detail || "" };
}

function topicFromQuestion(question = "") {
  const q = String(question || "").toLowerCase();
  return {
    heat: /\b(hot|warm|heat|thermal|fans?|overheat|calor|caliente|ventiladores?)\b/i.test(q),
    memory: /\b(ram|memory|swap|memoria)\b/i.test(q),
    gpu: /\b(gpu|graphics|video card|tarjeta)\b/i.test(q),
    editing: /\b(final\s*cut|fcp|premiere|davinci|resolve|timeline|proxy|render|export|edit(?:ing)?|montage|edici[oó]n|l[ií]nea\s+de\s+tiempo)\b/i.test(q),
    game: /\b(game|gaming|fps|fortnite|valorant|cs2|warzone|juego|juegos)\b/i.test(q),
    lag: /\b(lag|lags|lagging|stutter|slow|slowing|freeze|freezes|tirones|lento|lent[oa]|se\s+cuelga)\b/i.test(q),
    writing: /\b(email|write|draft|letter|essay|correo|escribe|texto|redact)\b/i.test(q),
    chat: /\b(hola|hello|hi\b|hey\b|thanks|gracias|who are you|qui[eé]n eres)\b/i.test(q),
  };
}

export function relevantMachineContext(question, telemetry) {
  const topic = topicFromQuestion(question);
  const map = new Map((telemetry?.readings || []).filter(r => r?.metric).map(r => [r.metric, r]));
  const device = telemetry?.device || {};
  const lines = [];
  const kind = device.formFactor === "laptop" ? "laptop" : device.formFactor === "desktop" ? "desktop PC" : "computer";
  const identity = [device.model || device.macModel, device.chipName, device.cpuBrand, Number.isFinite(device.memoryGb) ? `${device.memoryGb.toFixed(0)} GiB memory` : ""]
    .filter(Boolean)
    .join(" · ") || "unknown";
  lines.push(`machine: ${kind}`);
  lines.push(`device: ${identity}`);

  const want = new Set(["memory.ram.usage"]);
  if (topic.heat || topic.lag || topic.editing || topic.game) {
    want.add("cpu.usage");
    want.add("temperature.cpu");
    want.add("temperature.gpu");
    want.add("gpu.usage");
  }
  if (topic.memory || topic.lag || topic.editing) {
    want.add("memory.swap.usage");
  }
  if (topic.gpu || topic.game || topic.editing) {
    want.add("gpu.usage");
    want.add("temperature.gpu");
  }
  if (!topic.writing && !topic.chat) {
    want.add("cpu.usage");
  }

  for (const metric of want) {
    const reading = readingValue(map, metric);
    if (reading.ok) lines.push(`${metric}=${Number(reading.value.toFixed(1))}${reading.unit}`);
  }

  const culprits = Array.isArray(telemetry?.culprits) ? telemetry.culprits.slice(0, 2) : [];
  if (culprits.length) {
    lines.push(`relevant apps: ${culprits.map(item => `${item.app} (~${item.cpuPctOfMachine || item.cpuCores}% machine, ${item.confidence})`).join("; ")}`);
  } else {
    const busy = (telemetry?.busyApps || []).slice(0, 2);
    if (busy.length) lines.push(`busiest apps: ${busy.map(app => `${app.name} cpu ${app.cpu}%`).join("; ")}`);
  }

  const full = (telemetry?.storageVolumes || []).find(volume => typeof volume.usePercent === "number" && volume.usePercent >= 85);
  if (full && (topic.editing || topic.lag || topic.memory)) {
    lines.push(`storage: ${full.mount} ${full.usePercent.toFixed(0)}% full`);
  }

  if (device.acConnected === false && (topic.lag || topic.game || topic.editing || topic.heat)) {
    lines.push("power: on battery");
  }

  lines.push("RULE: only quote readings from this block that help answer the latest question. Skip the rest.");
  return lines.join("\n");
}

export function machinePlaybook(device = {}, lang = "en") {
  return machinePlaybookLocalized(device, lang);
}

export function polishReply(text) {
  let out = String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\w])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[★☆✦✧▶►]/g, "")
    .replace(/[ \t]+\n/g, "\n");

  // Turn star/bullet lists into plain numbered steps so the chat stays easy to scan.
  let step = 0;
  out = out.replace(/^\s*[*•●▪\-]\s+/gm, () => {
    step += 1;
    return `${step}. `;
  });

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function systemPrompt(_mode, specs, telemetry, memoryText, lang = "en", question = "") {
  return [
    "You are JARVIS, a private assistant on this computer. You chat, help with writing, troubleshoot, and optimize. Answer like a capable normal AI: fitted to THIS message, not a template.",
    replyInLanguageInstruction(lang),
    "Voice: calm, clear, human. Short sentences. No slang unless the user uses it. No hype. No filler.",
    "Never use emojis, asterisks, markdown headings, or decorative symbols. Numbered lists are good. Put each step on its own line.",
    "",
    "How every reply should look:",
    "1) First line: a direct answer to what they asked.",
    "2) Then only the readings that matter for that answer. One or two numbers max. Never paste a full stats dump.",
    "3) Then custom steps for their exact app or task (Final Cut, a game, a browser, an email, heat, and so on). Name the app they named.",
    "4) If they want speed or a fix: a short Free plan list, then a Paid plan only when the readings support buying something. Say they do not need to spend money.",
    "5) Stop. No wrap-up paragraph that repeats the same advice.",
    "",
    "Custom fit means: if they mention Final Cut Pro timeline lag, talk proxies, optimized media, render cache, timeline resolution, background exports, and memory pressure. If they mention a game, talk that game path. If they ask for an email, write the email. Ordinary chat needs no free or paid plan.",
    "Always answer. A missing sensor does not stop you. Mention only that one missing item if it matters. Do not invent numbers.",
    "You see apps, not websites, tabs, or files. For a browser, say tabs or extensions. Do not invent which site.",
    "If RANKED IDEAS are present, weave the best matching ones into your custom steps. Prefer free before paid. Do not add ideas that are not in that list.",
    "A remembered game is only a name from an earlier message. Do not mention a game unless the user names it now.",
    "Never claim you changed the machine. Never suggest cracks, cheats, undervolt tools from unknown publishers, or unknown optimizer downloads.",
    machinePlaybook(telemetry?.device, lang).guidance,
    memoryText || "",
    specs?.games ? `User-stated games/workload: ${specs.games}` : "",
    specs?.budget ? `User-stated budget: ${specs.budget}` : "",
    specs?.notes ? `User-stated notes: ${specs.notes}` : "",
    "RELEVANT MACHINE CONTEXT (use sparingly):",
    relevantMachineContext(question, telemetry),
  ].filter(item => item !== null && item !== undefined).join("\n");
}

export function buildChatMessages({ mode, question, specs, telemetry, history, memoryText, language }) {
  const lang = detectLanguage(question, language);
  const messages = [
    { role: "system", content: systemPrompt(mode, specs, telemetry, memoryText, lang, question) },
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

export async function localChat({ mode, question, specs, telemetry, history, memoryText, language }) {
  const models = await listModels();
  const model = PREFERRED_MODELS.find(name => models.some(item => item === name || item.startsWith(`${name}-`) || item.startsWith(name)))
    || models[0];
  if (!model) {
    throw new Error("The local model is still downloading (about 2 GB). Leave this page open and try again in a few minutes.");
  }

  const messages = buildChatMessages({ mode, question, specs, telemetry, history, memoryText, language });

  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      keep_alive: "2m",
      options: { temperature: 0.45, num_ctx: 4096, num_predict: 900 },
    }),
  });
  if (!response.ok) throw new Error("Local model request failed.");
  const data = await response.json();
  const reply = data?.message?.content?.trim();
  if (!reply) throw new Error("Local model returned an empty reply.");
  return { reply, model, appliedChanges: false };
}
