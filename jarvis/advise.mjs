import { smartChat } from "./brain.mjs";
import { machinePlaybook, polishReply } from "./chat.mjs";
import { deriveSignals, rankIdeas } from "./ideas.mjs";
import { loadSecrets } from "./secrets.mjs";
import {
  extractSpecsFromHistory,
  loadMemory,
  memoryContext,
  mergeSensedSpecs,
  rememberInteraction,
} from "./memory.mjs";

const WEB_TIMEOUT_MS = 8_000;
const WEB_COOLDOWN_MS = 8_000;
const MAX_QUERY = 120;
let webAllowedAt = 0;

function clip(text, max = 80) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function readingMap(payload) {
  const map = new Map();
  for (const reading of payload?.readings || []) {
    if (reading?.metric) map.set(reading.metric, reading);
  }
  return map;
}

function usable(reading) {
  if (reading?.status !== "available" || typeof reading.value !== "number" || !Number.isFinite(reading.value)) return false;
  const sampledAt = Date.parse(reading.sampledAt || "");
  return Number.isFinite(sampledAt);
}

function fmt(reading) {
  if (!usable(reading)) {
    return `${reading?.metric || "reading"}: ${reading?.status || "unavailable"}`;
  }
  const unit = reading.unit || "";
  const value = unit === "%" || unit === "°C" || unit === "W" || unit === "GiB"
    ? reading.value.toFixed(1)
    : Math.round(reading.value);
  return `${reading.metric} ${value} ${unit} (${reading.source})`.trim();
}

function deviceLine(device = {}) {
  return [
    device.macModel,
    device.chipName,
    Array.isArray(device.gpuModels) ? device.gpuModels.join(", ") : null,
    device.cpuBrand,
    Number.isFinite(device.memoryGb) ? `${device.memoryGb.toFixed(0)} GiB RAM` : null,
  ].filter(Boolean).join(" · ") || "hardware identity incomplete";
}

function sanitizeQuery(parts) {
  return clip(parts.filter(Boolean).join(" ").replace(/[^\w.\- +]/g, " "), MAX_QUERY);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: { "User-Agent": "JARVIS-local-advisor/0.1 (loopback diagnostic; not a crawler)" },
    });
    if (!response.ok) throw new Error("lookup failed");
    return await response.json();
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function searchRelatedIssues(query) {
  if (!query || Date.now() < webAllowedAt) {
    return { status: "skipped", results: [], detail: "Web lookup skipped (empty query or cooldown)." };
  }
  webAllowedAt = Date.now() + WEB_COOLDOWN_MS;
  const encoded = encodeURIComponent(query);
  try {
    const data = await fetchJson(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=4&namespace=0&format=json&origin=*`);
    const titles = Array.isArray(data?.[1]) ? data[1] : [];
    const snippets = Array.isArray(data?.[2]) ? data[2] : [];
    const urls = Array.isArray(data?.[3]) ? data[3] : [];
    const results = titles.map((title, index) => ({
      title: clip(title, 90),
      snippet: clip(snippets[index] || "Wikipedia topic match. Confirm against vendor docs.", 220),
      url: typeof urls[index] === "string" && urls[index].startsWith("https://en.wikipedia.org/") ? urls[index] : null,
      source: "Wikipedia OpenSearch",
    })).filter(item => item.title && item.url).slice(0, 4);
    return {
      status: results.length ? "available" : "empty",
      query,
      results,
      detail: results.length
        ? "Web matches are encyclopedia titles, not a live scan of every GPU forum. Treat them as leads, not proof."
        : "No encyclopedia matches for the sanitized query.",
    };
  } catch {
    return {
      status: "error",
      query,
      results: [],
      detail: "Web lookup failed. Diagnosis still uses local sensors only.",
    };
  }
}

function localFindings(payload, specs, question) {
  const readings = readingMap(payload);
  const cpuTemp = readings.get("temperature.cpu");
  const gpuTemp = readings.get("temperature.gpu");
  const cpuUse = readings.get("cpu.usage");
  const gpuUse = readings.get("gpu.usage");
  const ram = readings.get("memory.ram.usage");
  const swap = readings.get("memory.swap.usage");
  const findings = [];

  if (usable(gpuTemp) && gpuTemp.value >= 85) {
    findings.push(`GPU temperature is high (${fmt(gpuTemp)}). Thermal or load pressure until proven otherwise — not a guaranteed hardware failure.`);
  } else if (usable(gpuTemp) && gpuTemp.value >= 75) {
    findings.push(`GPU is warm (${fmt(gpuTemp)}). Check vents, surface, and whether a game or browser is using the GPU.`);
  } else if (!usable(gpuTemp)) {
    findings.push("GPU temperature isn't available on this machine.");
  }

  if (usable(cpuTemp) && cpuTemp.value >= 95) {
    findings.push(`CPU temperature is high (${fmt(cpuTemp)}). Reduce load, check airflow, then re-measure the same workload.`);
  } else if (!usable(cpuTemp)) {
    findings.push("CPU temperature isn't available on this machine.");
  }

  if (usable(gpuUse) && gpuUse.value >= 90) {
    findings.push(`GPU utilization is ${fmt(gpuUse)}. If a game is open, this is expected load, not a broken GPU.`);
  }
  if (usable(cpuUse) && cpuUse.value >= 90) {
    const heavy = payload?.busyApps?.[0];
    findings.push(heavy
      ? `CPU utilization is ${fmt(cpuUse)}. The busiest app right now is ${heavy.name}.`
      : `CPU utilization is ${fmt(cpuUse)}.`);
  }
  if (usable(ram) && ram.value >= 90) {
    findings.push(`RAM is ${fmt(ram)}. Closing unused apps is safer than buying RAM until shortage repeats.`);
  }
  if (usable(swap) && swap.value >= 20) {
    findings.push(`Swap is in use (${fmt(swap)}). That can stutter games even when the GPU looks fine.`);
  }

  const volumes = Array.isArray(payload?.storageVolumes) ? payload.storageVolumes : [];
  const full = volumes.find(volume => typeof volume.usePercent === "number" && volume.usePercent >= 90);
  if (full) findings.push(`A mounted volume is nearly full (${full.mount}: ${full.usePercent.toFixed(0)}% used). Low disk can look like a GPU problem.`);

  if (!findings.length) {
    findings.push("No red-line sensor is currently available. Either the machine is within ordinary ranges, or the needed sensors are unsupported.");
  }

  const games = clip(specs.games, 120);
  const budget = clip(specs.budget, 40);
  if (games) findings.push(`Stated games/work: ${games}.`);
  if (budget) findings.push(`Spend cap: ${budget}.`);
  if (clip(question, 160)) findings.push(`Question: ${clip(question, 160)}`);
  return findings;
}

function heavyLine(payload) {
  const culprit = (payload?.culprits || []).find(item => item?.app) || null;
  if (culprit) return `${culprit.app} is using ${culprit.cpuPctOfMachine}% of the machine right now.`;
  const heavy = payload?.heavyApps?.[0] || payload?.busyApps?.[0];
  if (!heavy) return "";
  return `${heavy.name} is using ${heavy.cpu}% CPU right now.`;
}

function diagnoseReply({ payload, specs, question }) {
  const findings = localFindings(payload, specs, question).filter(item => !item.startsWith("Question:") && !item.startsWith("Stated") && !item.startsWith("Spend"));
  return [
    `On this ${deviceLine(payload?.device)}, ${findings[0] || "the available readings do not show a single fault."}`,
    heavyLine(payload),
    findings.slice(1, 3).join(" "),
    "Nothing was changed. Do one thing, mark the moment in the sidebar, then ask again so the next reading can be compared.",
  ].filter(Boolean).join(" ");
}

function optimizeReply({ payload, specs, question }) {
  const finding = localFindings(payload, specs, question).find(item => !item.startsWith("Question:") && !item.startsWith("Stated") && !item.startsWith("Spend")) || "The readings that are present are enough to start.";
  const plan = machinePlaybook(payload?.device);
  return [
    `${deviceLine(payload?.device)}. ${finding} ${heavyLine(payload)}`.trim(),
    plan.free,
    plan.paid,
    "The free plan is the better start. You do not need to spend money. A missing sensor does not block this.",
  ].join(" ");
}

export function looksLikeProblemSolving(text) {
  return /\b(optim\w*|diagnos\w*|troubleshoot|stutter(?:ing)?|fps|overheat(?:ing)?|thermal|hot\b|fan\b|ram\b|swap\b|crash(?:ing|es)?|lag(?:ging)?|temp(?:erature)?|slow(?:er|ing)?|speed up|boost|tune|fix (?:my )?(?:pc|mac|laptop|computer)|check (?:my )?(?:pc|mac|laptop|computer|sensors?|specs?|stats?|machine)|show (?:my )?(?:specs?|sensors?|stats?|telemetry|machine)|machine (?:readings?|stats?|specs?)|what(?:'s| is) wrong|why is (?:my )?(?:pc|mac|laptop|computer)|performance issue|graphics settings|what should i (buy|change))\b/i.test(text || "");
}

function looksLikeOptimize(text) {
  return /\b(optim\w*|faster|speed up|boost|tune|settings|what should i (buy|change)|budget)\b/i.test(text || "");
}

function safeDetail(error) {
  const message = String(error?.message || "The online brain did not answer.");
  return message.replace(/https?:\/\/\S+/g, "").replace(/key=[^\s&]+/gi, "").slice(0, 180);
}

function renderIdeas(ideas) {
  if (!ideas?.length) return "";
  return ideas.slice(0, 3).map((item, index) => `${index + 1}. ${item.title}. ${item.cost === "paid" ? "Paid plan." : "Free plan."} ${item.why} ${item.steps[0] || ""}`).join(" ");
}

export async function advise({ mode, question, specs, telemetry, history, threadId = "default", moment = "", problem = null }) {
  const role = "chat";
  const memory = await loadMemory();
  const includeMachine = true;
  const mergedSpecs = extractSpecsFromHistory(history, question, {
    ...memory.profile,
    ...(specs || {}),
  });
  const wantsPlan = Boolean(problem) || looksLikeProblemSolving(question) || looksLikeOptimize(question);
  const wantsOptimize = looksLikeOptimize(question) || mode === "optimize" || Boolean(problem);
  const plannedSpecs = mergeSensedSpecs(mergedSpecs, telemetry);
  const signals = wantsPlan ? deriveSignals(telemetry, telemetry?.culprits || [], problem || { text: question }) : [];
  const ideas = wantsPlan ? rankIdeas(signals, telemetry?.device || {}, problem || { budget: plannedSpecs.budget, text: question }) : [];
  const ideaBlock = ideas.length ? `RANKED IDEAS:\n${ideas.map(item => `${item.title} (${item.cost}): ${item.why}`).join("\n")}` : "";
  let llmDetail = null;

  try {
    const llm = await smartChat({
      mode: role,
      question,
      specs: plannedSpecs,
      telemetry,
      history,
      memoryText: [memoryContext(memory, question), moment ? `MARKED MOMENT: ${moment}` : "", ideaBlock].filter(Boolean).join("\n"),
      includeMachine,
    });
    const reply = polishReply(llm.reply);
    await rememberInteraction({ mode: role, question, reply, specs: plannedSpecs, threadId });
    return {
      mode: role,
      reply,
      ideas,
      specs: plannedSpecs,
      appliedChanges: false,
      model: llm.model,
      provider: llm.provider,
      detail: llm.detail || null,
      unlockMachine: includeMachine,
    };
  } catch (error) {
    llmDetail = safeDetail(error);
  }

  const secrets = await loadSecrets();
  const device = telemetry?.device || {};
  const gpu = Array.isArray(device.gpuModels) ? device.gpuModels[0] : device.chipName;
  const query = sanitizeQuery([
    gpu || device.cpuBrand || "laptop GPU",
    wantsOptimize ? "game graphics settings" : "graphics overheating",
  ]);
  const web = secrets.allowWebLookup ? await searchRelatedIssues(query) : { status: "skipped", results: [], detail: "Web lookup is off." };
  const reply = polishReply([
    wantsOptimize
      ? optimizeReply({ payload: telemetry, specs: plannedSpecs, question, web })
      : diagnoseReply({ payload: telemetry, specs: plannedSpecs, question, web }),
    renderIdeas(ideas),
  ].filter(Boolean).join(" "));
  await rememberInteraction({ mode: role, question, reply, specs: plannedSpecs, threadId });
  return {
    mode: role,
    reply,
    ideas,
    specs: plannedSpecs,
    web,
    appliedChanges: false,
    model: "local-rules",
    provider: "local-rules",
    detail: llmDetail,
    unlockMachine: true,
  };
}

export async function readJsonBody(req, maxBytes = 200_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      req.destroy();
      throw new Error("payload too large");
    }
    chunks.push(chunk);
  }
  if (!size) throw new Error("empty body");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
