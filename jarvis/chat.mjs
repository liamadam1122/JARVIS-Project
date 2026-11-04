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

export function machinePlaybook(device = {}) {
  const gpu = Array.isArray(device.gpuModels) ? device.gpuModels.join(" ") : "";
  const id = `${device.manufacturer || ""} ${device.model || ""} ${device.macModel || ""} ${gpu}`.toLowerCase();
  const discrete = /nvidia|geforce|rtx|gtx|radeon|\brx\s?\d|arc a\d/i.test(gpu);
  const mac = device.platform === "darwin" || /macbook|imac|mac mini|mac studio/.test(id);
  const laptop = device.formFactor === "laptop";
  const plugged = device.acConnected === false ? " It is on battery, so plug it in before judging game performance." : "";
  if (mac) {
    return {
      kind: "mac",
      guidance: "This is a Mac. Show CPU, GPU, memory, and fan speed when those readings exist. Do not claim a separate graphics card can be tuned, overclocked, or replaced. Most Mac memory is soldered.",
      free: "Free plan. Close the heaviest app, lower the game resolution scale, and keep the vents clear. There is no separate graphics card to tune on this Mac.",
      paid: "Paid plan. A memory upgrade is not available on most MacBooks. A different computer is the only hardware change, and you do not need to spend money.",
    };
  }
  if (laptop && !discrete) {
    const vendor = /lenovo|thinkpad/.test(id)
      ? "In Lenovo Vantage, set Intelligent Cooling or the balanced performance mode."
      : "Use the laptop maker's own power or thermal app if it is already installed.";
    return {
      kind: "laptop",
      guidance: `This is a laptop without a separate gaming GPU, including many ThinkPads.${plugged} Help with heat, fans, memory, and startup apps. Do not invent a gaming graphics card and do not suggest overclocking. ${vendor}`,
      free: `Free plan. ${vendor} Close heavy startup apps and keep the vents clear. This machine does not show a separate gaming GPU, so there is nothing to overclock.${plugged}`,
      paid: "Paid plan. More memory only if RAM or swap stays high and this laptop has a free slot. You do not need to spend money.",
    };
  }
  if (laptop) {
    return {
      kind: "gaming-laptop",
      guidance: `This is a gaming laptop.${plugged} Stay on the charger. Use the maker's performance mode if that app is already installed: Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center, or PredatorSense. In the NVIDIA App or AMD Software, choose the high-performance GPU for the game and cap frames near the laptop screen refresh. Do not suggest a random undervolt tool or an unknown optimizer.`,
      free: `Free plan. Plug the laptop in. Set the vendor performance mode in Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center, or PredatorSense when that app is already installed. In the NVIDIA App or AMD Software, use the official profile and cap frames near the screen refresh. Close the heaviest app, lower shadows before resolution, and keep the vents clear. Do not install an unknown optimizer.${plugged}`,
      paid: "Paid plan. More memory only if this laptop has a slot and RAM or swap stays high after the free steps. A cooling pad only if the temperature stays high with clear vents. You do not need to spend money.",
    };
  }
  const linux = device.platform === "linux";
  return {
    kind: "desktop",
    guidance: linux
      ? "This is a desktop PC on Linux. Use the official NVIDIA or AMD settings, or CoreCtrl for AMD. Do not suggest an unknown optimizer."
      : "This is a desktop gaming PC. In Windows Settings, System, Display, Graphics, set the game to High performance. Use the NVIDIA App or AMD Software for that game, a high-performance power plan while gaming, and a frame cap near the monitor refresh. Do not suggest an unknown optimizer.",
    free: linux
      ? "Free plan. Close the heaviest app, lower shadows before resolution, and cap frames near the monitor refresh in the official NVIDIA or AMD settings, or CoreCtrl for AMD. Keep the vents clear. Do not install an unknown optimizer."
      : "Free plan. In Windows Settings, System, Display, Graphics, set the game to High performance. In the NVIDIA App or AMD Software, use the official profile and cap frames near the monitor refresh. Use a high-performance power plan while gaming. Close the heaviest app, lower shadows before resolution, and keep the vents clear. Do not install an unknown optimizer.",
    paid: "Paid plan. More memory only if RAM or swap stays high after the free steps. Better cooling only if the temperature stays high with clear vents. A higher-refresh monitor only if the current display is the limit. You do not need to spend money.",
  };
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

export function systemPrompt(_mode, specs, telemetry, memoryText) {
  return [
    "You are JARVIS, a premium private assistant for this laptop or desktop PC. One conversation covers chat, everyday work writing, troubleshooting, and careful optimization.",
    "Voice: calm, precise, smooth. Write plain sentences. No slang unless the user uses it. No hype. No filler.",
    "Never use emojis, asterisks, stars, markdown, headings, or decorative symbols. Do not format with bold or bullets made of stars.",
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
    machinePlaybook(telemetry?.device).guidance,
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

export function buildChatMessages({ mode, question, specs, telemetry, history, memoryText }) {
  const messages = [
    { role: "system", content: systemPrompt(mode, specs, telemetry, memoryText) },
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
