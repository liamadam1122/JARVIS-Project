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

function relevantBite(payload, question, lang = "en") {
  const asked = String(question || "").toLowerCase();
  const readings = readingMap(payload);
  const bits = [];
  const pick = (metric, labelEn, labelEs) => {
    const reading = readings.get(metric);
    if (!usable(reading)) return;
    const label = lang === "es" ? labelEs : labelEn;
    bits.push(`${label} ${Math.round(reading.value)}${reading.unit || ""}`);
  };
  if (/\b(hot|warm|heat|thermal|fans?|calor|caliente|ventiladores?)\b/.test(asked)) {
    pick("temperature.cpu", "CPU temp", "Temp CPU");
    pick("temperature.gpu", "GPU temp", "Temp GPU");
    pick("cpu.usage", "CPU load", "Carga CPU");
  } else if (/\b(ram|memory|swap|memoria)\b/.test(asked) || /\b(final\s*cut|premiere|timeline|edit|edici)/.test(asked)) {
    pick("memory.ram.usage", "Memory", "Memoria");
    pick("memory.swap.usage", "Swap", "Swap");
    pick("cpu.usage", "CPU", "CPU");
  } else if (/\b(game|fps|gpu|graphics|juego)\b/.test(asked)) {
    pick("gpu.usage", "GPU", "GPU");
    pick("temperature.gpu", "GPU temp", "Temp GPU");
    pick("cpu.usage", "CPU", "CPU");
  } else if (looksLikeProblemSolving(asked) || looksLikeOptimize(asked)) {
    pick("cpu.usage", "CPU", "CPU");
    pick("memory.ram.usage", "Memory", "Memoria");
  }
  const heavy = heavyLine(payload, lang);
  if (heavy) bits.push(heavy);
  return bits.slice(0, 2).join(". ");
}

function namedApp(question = "") {
  const text = String(question || "");
  const match = text.match(/\b(Final Cut Pro|Final Cut|FCPX?|Premiere Pro|DaVinci Resolve|Chrome|Safari|Firefox|Spotify|Discord|Steam|Fortnite|Photoshop|After Effects|Logic Pro|GarageBand)\b/i);
  return match ? match[0] : "";
}

function customSteps(question, payload, lang = "en") {
  const asked = String(question || "").toLowerCase();
  const app = namedApp(question);
  const mac = payload?.device?.platform === "darwin";
  const es = lang === "es";

  if (/\b(final\s*cut|fcp|premiere|davinci|resolve|timeline|proxy|render|edici[oó]n|l[ií]nea\s+de\s+tiempo)\b/.test(asked)) {
    if (es) {
      return [
        app ? `Para ${app}, el tirón en la línea de tiempo suele ser preview y disco, no un fallo raro.` : "El tirón en la línea de tiempo suele ser preview y disco, no un fallo raro.",
        "1. Pon la línea de tiempo en Proxy o Better Performance.",
        "2. Genera Optimized Media o Proxy Media para los clips pesados.",
        "3. Cierra navegadores y otras apps de edición mientras trabajas.",
        "4. Deja al menos un 15–20% libre en el disco del proyecto y de la caché de render.",
        "5. Evita exportar en segundo plano mientras editas la misma secuencia.",
      ].join("\n");
    }
    return [
      app ? `For ${app}, timeline lag is usually preview load and disk pressure, not a random hardware failure.` : "Timeline lag is usually preview load and disk pressure, not a random hardware failure.",
      "1. Set the timeline to Proxy or Better Performance.",
      "2. Create Optimized Media or Proxy Media for the heavy clips.",
      "3. Quit browsers and other editors while you work.",
      "4. Keep about 15–20% free on the project and render-cache drive.",
      "5. Avoid exporting in the background while scrubbing the same sequence.",
    ].join("\n");
  }

  if (/\b(game|gaming|fps|fortnite|juego|juegos)\b/.test(asked)) {
    const plan = machinePlaybook(payload?.device, lang);
    return [
      es ? (app ? `Para ${app}, empieza por ajustes gratis.` : "Para juegos, empieza por ajustes gratis.") : (app ? `For ${app}, start with free settings.` : "For gaming, start with free settings."),
      plan.free.replace(/^Free plan\.\s*/i, "1. ").replace(/^Plan gratis\.\s*/i, "1. "),
      "2. Change one setting, mark the moment, then ask again on the same scene.",
    ].join("\n");
  }

  if (/\b(hot|warm|heat|thermal|fans?|calor|caliente|ventiladores?)\b/.test(asked)) {
    return es
      ? [
        app ? `El calor encaja con ${app} o con carga alta.` : "Parece un tema de calor o carga.",
        "1. Cierra o aligera la app más pesada (si es el navegador, cierra pestañas).",
        "2. Pon el portátil o Mac en una superficie dura y deja libres las rejillas.",
        "3. Espera un minuto y pregunta otra vez para comparar.",
      ].join("\n")
      : [
        app ? `The heat fits ${app} or another heavy load.` : "This looks like heat or sustained load.",
        "1. Quit or lighten the heaviest app (for a browser, close tabs).",
        "2. Put the laptop or Mac on a hard surface and clear the vents.",
        "3. Wait a minute, then ask again so we can compare.",
      ].join("\n");
  }

  if (/\b(chrome|safari|firefox|browser|navegador|tabs?|pestañas?)\b/.test(asked) && /\b(slow|lag|lento|lent[oa]|tirones)\b/.test(asked)) {
    return es
      ? [
        app ? `${app} suele ir lento por pestañas o extensiones, no por la GPU.` : "El navegador suele ir lento por pestañas o extensiones.",
        "1. Abre el administrador de tareas del navegador y cierra las pestañas pesadas.",
        "2. Desactiva extensiones que no uses.",
        "3. Cierra otras apps pesadas y vuelve a probar la misma página.",
      ].join("\n")
      : [
        app ? `${app} usually slows from tabs or extensions, not from the GPU.` : "Browsers usually slow from tabs or extensions.",
        "1. Open the browser task manager and close the heavy tabs.",
        "2. Turn off extensions you do not need.",
        "3. Quit other heavy apps, then try the same page again.",
      ].join("\n");
  }

  if (/\b(email|write|draft|letter|correo|escribe|texto)\b/.test(asked)) {
    return es
      ? "Dime el destinatario, el tono y el punto principal, y te escribo el texto completo."
      : "Tell me the recipient, the tone, and the main point, and I will write the full text.";
  }

  if (looksLikeOptimize(asked) || looksLikeProblemSolving(asked)) {
    const plan = machinePlaybook(payload?.device, lang);
    if (es) {
      return [
        app ? `Vamos a por ${app} con pasos concretos.` : "Vamos con pasos concretos para esta máquina.",
        plan.free,
        plan.paid,
        "Empieza por el plan gratis. No hace falta gastar dinero.",
      ].join("\n");
    }
    return [
      app ? `Here is a concrete plan for ${app}.` : "Here is a concrete plan for this machine.",
      plan.free,
      plan.paid,
      "Start with the free plan. You do not need to spend money.",
    ].join("\n");
  }

  if (es) {
    if (/hola|buenas|hey\b/.test(asked)) return "Hola. Dime qué app o qué problema tienes y te doy pasos a medida.";
    if (/gracias|thank/.test(asked)) return "De nada. Cuando cambies una cosa, pregunta otra vez y lo comparamos.";
    if (/qui[eé]n eres|qu[eé] eres/.test(asked)) return "Soy JARVIS. Respondo con pasos a medida usando las lecturas de este ordenador.";
    return mac
      ? "Dime qué quieres arreglar o mejorar en este Mac, o pide ayuda con un texto."
      : "Dime qué quieres arreglar o mejorar en este PC, o pide ayuda con un texto.";
  }
  if (/hello|hi\b|hey\b/.test(asked)) return "Hi. Tell me which app or problem you mean and I will give fitted steps.";
  if (/thank/.test(asked)) return "You're welcome. After one change, ask again and we can compare.";
  if (/who are you|what are you/.test(asked)) return "I'm JARVIS. I give fitted steps using the readings on this computer.";
  return mac
    ? "Tell me what you want to fix or improve on this Mac, or ask for help with a short write-up."
    : "Tell me what you want to fix or improve on this PC, or ask for help with a short write-up.";
}

function customFittedLocalReply({ payload, question, lang }) {
  const es = lang === "es";
  const lead = customSteps(question, payload, lang);
  const bite = relevantBite(payload, question, lang);
  const parts = [lead];
  if (bite && (looksLikeProblemSolving(question) || looksLikeOptimize(question))) {
    parts.push(es ? `Lectura útil ahora: ${bite}.` : `Useful reading now: ${bite}.`);
  }
  return parts.filter(Boolean).join("\n\n");
}

export function looksLikeProblemSolving(text) {
  return /\b(optim\w*|diagnos\w*|troubleshoot|stutter(?:ing)?|fps|overheat(?:ing)?|thermal|hot\b|fans?\b|ram\b|swap\b|crash(?:ing|es)?|lag(?:ging)?|temp(?:erature)?|slow(?:er|ing)?|speed up|boost|tune|fix (?:my )?(?:pc|mac|laptop|computer)|check (?:my )?(?:pc|mac|laptop|computer|sensors?|specs?|stats?|machine)|show (?:my )?(?:specs?|sensors?|stats?|telemetry|machine)|machine (?:readings?|stats?|specs?)|what(?:'s| is) wrong|why is (?:my )?(?:pc|mac|laptop|computer)|performance issue|graphics settings|what should i (buy|change)|calor|caliente|lento|lent[oa]|r[aá]pido|ventiladores?|tirones|se\s+cuelga|se\s+apaga|por\s+qu[eé]|qu[eé]\s+pasa|arreglar|problema|rendimiento|timeline|proxy|final\s*cut|premiere|davinci)\b/i.test(text || "");
}

function looksLikeOptimize(text) {
  return /\b(optim\w*|faster|speed up|boost|tune|settings|what should i (buy|change)|budget|m[aá]s\s+r[aá]pido|mejorar|ajustes|configur|make it faster|más fluido|mas fluido)\b/i.test(text || "");
}

function safeDetail(error) {
  const message = String(error?.message || "The online brain did not answer.");
  return message.replace(/https?:\/\/\S+/g, "").replace(/key=[^\s&]+/gi, "").slice(0, 180);
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
  const reply = polishReply(customFittedLocalReply({
    payload: telemetry,
    question,
    lang,
  }));
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
