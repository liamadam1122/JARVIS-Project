import { smartChat } from "./brain.mjs";
import { machinePlaybook, polishReply } from "./chat.mjs";
import { deriveSignals, rankIdeas } from "./ideas.mjs";
import { detectLanguage } from "./language.mjs";
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

function localFindings(payload, specs, question, lang = "en") {
  const readings = readingMap(payload);
  const cpuTemp = readings.get("temperature.cpu");
  const gpuTemp = readings.get("temperature.gpu");
  const cpuUse = readings.get("cpu.usage");
  const gpuUse = readings.get("gpu.usage");
  const ram = readings.get("memory.ram.usage");
  const swap = readings.get("memory.swap.usage");
  const findings = [];
  const es = lang === "es";

  if (usable(gpuTemp) && gpuTemp.value >= 85) {
    findings.push(es
      ? `La temperatura de la GPU está alta (${fmt(gpuTemp)}). Suele ser carga o calor, no un fallo seguro de hardware.`
      : `GPU temperature is high (${fmt(gpuTemp)}). Thermal or load pressure until proven otherwise — not a guaranteed hardware failure.`);
  } else if (usable(gpuTemp) && gpuTemp.value >= 75) {
    findings.push(es
      ? `La GPU está caliente (${fmt(gpuTemp)}). Revisa rejillas, superficie y si un juego o el navegador están usando la GPU.`
      : `GPU is warm (${fmt(gpuTemp)}). Check vents, surface, and whether a game or browser is using the GPU.`);
  } else if (!usable(gpuTemp)) {
    findings.push(es ? "La temperatura de la GPU no está disponible en esta máquina." : "GPU temperature isn't available on this machine.");
  }

  if (usable(cpuTemp) && cpuTemp.value >= 95) {
    findings.push(es
      ? `La temperatura de la CPU está alta (${fmt(cpuTemp)}). Baja la carga, revisa el flujo de aire y vuelve a medir con la misma tarea.`
      : `CPU temperature is high (${fmt(cpuTemp)}). Reduce load, check airflow, then re-measure the same workload.`);
  } else if (!usable(cpuTemp)) {
    findings.push(es ? "La temperatura de la CPU no está disponible en esta máquina." : "CPU temperature isn't available on this machine.");
  }

  if (usable(gpuUse) && gpuUse.value >= 90) {
    findings.push(es
      ? `El uso de la GPU es ${fmt(gpuUse)}. Si hay un juego abierto, es carga normal, no una GPU rota.`
      : `GPU utilization is ${fmt(gpuUse)}. If a game is open, this is expected load, not a broken GPU.`);
  }
  if (usable(cpuUse) && cpuUse.value >= 90) {
    const heavy = payload?.busyApps?.[0];
    findings.push(heavy
      ? (es
        ? `El uso de la CPU es ${fmt(cpuUse)}. La app más ocupada ahora es ${heavy.name}.`
        : `CPU utilization is ${fmt(cpuUse)}. The busiest app right now is ${heavy.name}.`)
      : (es ? `El uso de la CPU es ${fmt(cpuUse)}.` : `CPU utilization is ${fmt(cpuUse)}.`));
  }
  if (usable(ram) && ram.value >= 90) {
    findings.push(es
      ? `La RAM está al ${fmt(ram)}. Cerrar apps sin usar es más seguro que comprar memoria hasta que se repita.`
      : `RAM is ${fmt(ram)}. Closing unused apps is safer than buying RAM until shortage repeats.`);
  }
  if (usable(swap) && swap.value >= 20) {
    findings.push(es
      ? `Hay swap en uso (${fmt(swap)}). Eso puede hacer tirones en juegos aunque la GPU se vea bien.`
      : `Swap is in use (${fmt(swap)}). That can stutter games even when the GPU looks fine.`);
  }

  const volumes = Array.isArray(payload?.storageVolumes) ? payload.storageVolumes : [];
  const full = volumes.find(volume => typeof volume.usePercent === "number" && volume.usePercent >= 90);
  if (full) {
    findings.push(es
      ? `Un volumen montado está casi lleno (${full.mount}: ${full.usePercent.toFixed(0)}% usado). Poco disco puede parecer un problema de GPU.`
      : `A mounted volume is nearly full (${full.mount}: ${full.usePercent.toFixed(0)}% used). Low disk can look like a GPU problem.`);
  }

  if (!findings.length) {
    findings.push(es
      ? "No hay una alerta clara en los sensores ahora. O la máquina está en rangos normales, o esos sensores no están disponibles."
      : "No red-line sensor is currently available. Either the machine is within ordinary ranges, or the needed sensors are unsupported.");
  }

  const games = clip(specs.games, 120);
  const budget = clip(specs.budget, 40);
  if (games) findings.push(es ? `Juegos/trabajo: ${games}.` : `Stated games/work: ${games}.`);
  if (budget) findings.push(es ? `Presupuesto: ${budget}.` : `Spend cap: ${budget}.`);
  if (clip(question, 160)) findings.push(`Question: ${clip(question, 160)}`);
  return findings;
}

function heavyLine(payload, lang = "en") {
  const culprit = (payload?.culprits || []).find(item => item?.app) || null;
  if (culprit) {
    return lang === "es"
      ? `${culprit.app} está usando el ${culprit.cpuPctOfMachine}% de la máquina ahora.`
      : `${culprit.app} is using ${culprit.cpuPctOfMachine}% of the machine right now.`;
  }
  const heavy = payload?.heavyApps?.[0] || payload?.busyApps?.[0];
  if (!heavy) return "";
  return lang === "es"
    ? `${heavy.name} está usando el ${heavy.cpu}% de CPU ahora.`
    : `${heavy.name} is using ${heavy.cpu}% CPU right now.`;
}

function chattyLocalReply({ payload, question, lang }) {
  const asked = String(question || "").toLowerCase();
  const heavy = heavyLine(payload, lang);
  const device = deviceLine(payload?.device);
  if (lang === "es") {
    if (/hola|buenas|hey\b/.test(asked)) {
      return `Hola. Estoy en ${device}.${heavy ? ` ${heavy}` : ""} Dime qué notas en el Mac o el PC, o pide optimizarlo.`;
    }
    if (/gracias|thank/.test(asked)) {
      return "De nada. Si quieres, mira otra vez las lecturas después de un cambio y te digo si se movieron.";
    }
    if (/qui[eé]n eres|what are you|qu[eé] eres/.test(asked)) {
      return "Soy JARVIS. Leo CPU, memoria y temperatura en este ordenador y respondo aquí. No cambio ajustes por ti.";
    }
    return `En ${device}: ${heavy || "no hay una app claramente pesada ahora"}. Pregúntame por calor, lentitud o cómo optimizarlo, o pide ayuda con un texto.`;
  }
  if (/hello|hi\b|hey\b/.test(asked)) {
    return `Hi. I'm on ${device}.${heavy ? ` ${heavy}` : ""} Tell me what feels wrong, or ask to optimize this machine.`;
  }
  if (/thank/.test(asked)) {
    return "You're welcome. After one change, ask again and I can compare the next reading.";
  }
  if (/who are you|what are you/.test(asked)) {
    return "I'm JARVIS. I read CPU, memory, and temperature on this computer and answer here. I do not change settings for you.";
  }
  return `On ${device}: ${heavy || "no single app looks heavy right now"}. Ask about heat, slowness, or optimizing, or ask for help with a short write-up.`;
}

function diagnoseReply({ payload, specs, question, lang }) {
  const findings = localFindings(payload, specs, question, lang).filter(item => !item.startsWith("Question:") && !item.startsWith("Stated") && !item.startsWith("Spend") && !item.startsWith("Juegos") && !item.startsWith("Presupuesto"));
  if (!looksLikeProblemSolving(question) && !looksLikeOptimize(question)) {
    return chattyLocalReply({ payload, question, lang });
  }
  if (lang === "es") {
    return [
      `En este ${deviceLine(payload?.device)}, ${findings[0] || "las lecturas no señalan un solo fallo."}`,
      heavyLine(payload, lang),
      findings.slice(1, 3).join(" "),
      "No he cambiado nada. Haz un solo paso, marca el momento en la barra lateral y pregunta otra vez para comparar la siguiente lectura.",
    ].filter(Boolean).join(" ");
  }
  return [
    `On this ${deviceLine(payload?.device)}, ${findings[0] || "the available readings do not show a single fault."}`,
    heavyLine(payload, lang),
    findings.slice(1, 3).join(" "),
    "Nothing was changed. Do one thing, mark the moment in the sidebar, then ask again so the next reading can be compared.",
  ].filter(Boolean).join(" ");
}

function optimizeReply({ payload, specs, question, lang }) {
  const finding = localFindings(payload, specs, question, lang).find(item => !item.startsWith("Question:") && !item.startsWith("Stated") && !item.startsWith("Spend") && !item.startsWith("Juegos") && !item.startsWith("Presupuesto"))
    || (lang === "es" ? "Con las lecturas que hay ya se puede empezar." : "The readings that are present are enough to start.");
  const plan = machinePlaybook(payload?.device, lang);
  if (lang === "es") {
    return [
      `${deviceLine(payload?.device)}. ${finding} ${heavyLine(payload, lang)}`.trim(),
      plan.free,
      plan.paid,
      "El plan gratis es el mejor comienzo. No hace falta gastar dinero. Un sensor que falte no bloquea esto.",
    ].join(" ");
  }
  return [
    `${deviceLine(payload?.device)}. ${finding} ${heavyLine(payload, lang)}`.trim(),
    plan.free,
    plan.paid,
    "The free plan is the better start. You do not need to spend money. A missing sensor does not block this.",
  ].join(" ");
}

export function looksLikeProblemSolving(text) {
  return /\b(optim\w*|diagnos\w*|troubleshoot|stutter(?:ing)?|fps|overheat(?:ing)?|thermal|hot\b|fan\b|ram\b|swap\b|crash(?:ing|es)?|lag(?:ging)?|temp(?:erature)?|slow(?:er|ing)?|speed up|boost|tune|fix (?:my )?(?:pc|mac|laptop|computer)|check (?:my )?(?:pc|mac|laptop|computer|sensors?|specs?|stats?|machine)|show (?:my )?(?:specs?|sensors?|stats?|telemetry|machine)|machine (?:readings?|stats?|specs?)|what(?:'s| is) wrong|why is (?:my )?(?:pc|mac|laptop|computer)|performance issue|graphics settings|what should i (buy|change)|calor|caliente|lento|lent[oa]|r[aá]pido|ventilador|tirones|se\s+cuelga|se\s+apaga|por\s+qu[eé]|qu[eé]\s+pasa|arreglar|problema|rendimiento)\b/i.test(text || "");
}

function looksLikeOptimize(text) {
  return /\b(optim\w*|faster|speed up|boost|tune|settings|what should i (buy|change)|budget|m[aá]s\s+r[aá]pido|mejorar|ajustes|configur)\b/i.test(text || "");
}

function safeDetail(error) {
  const message = String(error?.message || "The online brain did not answer.");
  return message.replace(/https?:\/\/\S+/g, "").replace(/key=[^\s&]+/gi, "").slice(0, 180);
}

function renderIdeas(ideas, lang = "en") {
  if (!ideas?.length) return "";
  const paid = lang === "es" ? "Plan de pago." : "Paid plan.";
  const free = lang === "es" ? "Plan gratis." : "Free plan.";
  return ideas.slice(0, 3).map((item, index) => `${index + 1}. ${item.title}. ${item.cost === "paid" ? paid : free} ${item.why} ${item.steps[0] || ""}`).join(" ");
}

export async function advise({ mode, question, specs, telemetry, history, threadId = "default", moment = "", problem = null, language = "" }) {
  const role = "chat";
  const memory = await loadMemory();
  const includeMachine = true;
  const lang = detectLanguage(question, language);
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
      language: lang,
      memoryText: [memoryContext(memory, question), moment ? `MARKED MOMENT: ${moment}` : "", ideaBlock].filter(Boolean).join("\n"),
      includeMachine,
    });
    const reply = polishReply(llm.reply);
    await rememberInteraction({ mode: role, question, reply, specs: plannedSpecs, threadId });
    return {
      mode: role,
      reply,
      ideas,
      language: lang,
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
      ? optimizeReply({ payload: telemetry, specs: plannedSpecs, question, lang })
      : diagnoseReply({ payload: telemetry, specs: plannedSpecs, question, lang }),
    wantsPlan ? renderIdeas(ideas, lang) : "",
  ].filter(Boolean).join(" "));
  await rememberInteraction({ mode: role, question, reply, specs: plannedSpecs, threadId });
  return {
    mode: role,
    reply,
    ideas: wantsPlan ? ideas : [],
    language: lang,
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
