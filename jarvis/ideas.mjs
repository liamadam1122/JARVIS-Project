const STEPS = {
  close: ["Close or quit the app that the readings name.", "Mark this moment, wait a minute, and ask again."],
  browser: ["Open the browser's own task manager. Chrome uses Shift+Esc. Safari uses Develop, then Show Web Inspector, or use Activity Monitor.", "Close the heavy tab or extension. JARVIS cannot see which site it is."],
  fps: ["In the NVIDIA App or AMD Software, cap frames near the monitor refresh.", "Lower shadows before resolution, then play the same scene."],
  windowsGpu: ["In Windows Settings, System, Display, Graphics, set the game to High performance.", "Use the official NVIDIA or AMD profile for that game."],
  vendor: ["Use the laptop maker's own performance mode if that app is already installed: Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center, or PredatorSense.", "Keep the laptop plugged in while you compare."],
  macPower: ["In System Settings, Battery, leave Low Power Mode off while you want speed, and on while you want the Mac cooler.", "Keep the Mac on a hard surface."],
  vents: ["Put the computer on a hard surface and keep the vents clear.", "Compare the same scene after a minute."],
  disk: ["Remove files you chose from the storage list until the volume is under 90 percent.", "JARVIS only read names and sizes."],
  ram: ["Close unused apps first.", "Add memory only if this computer has a free slot and swap stays high."],
  pad: ["A cooling pad is optional.", "Use it only if the temperature stays high after the free steps."],
};

function idea(partial) {
  return {
    cost: "free",
    priceRangeEUR: null,
    platforms: ["darwin", "win32", "linux"],
    formFactors: ["laptop", "desktop"],
    requires: [],
    reversible: true,
    risk: "none",
    expectedEffect: { metric: "cpu.usage", direction: "down", typicalRange: "a lower CPU reading on the same task" },
    howToVerify: { metric: "cpu.usage", compare: "before/after 60s same workload" },
    sources: [],
    ...partial,
  };
}

export const IDEAS = [
  idea({ id: "close-culprit", title: "Close the app that is using the most", category: "close/limit app", requires: ["heavy-app"], steps: STEPS.close, whyKind: "heavy-app" }),
  idea({ id: "browser-tabs", title: "Check the browser's own tab list", category: "close/limit app", requires: ["browser"], platforms: ["darwin", "win32", "linux"], steps: STEPS.browser }),
  idea({ id: "cap-fps", title: "Cap the game's frame rate", category: "game settings", platforms: ["win32", "linux"], formFactors: ["laptop", "desktop"], requires: ["gpu-bound"], steps: STEPS.fps }),
  idea({ id: "windows-gpu", title: "Set the game to high performance graphics", category: "vendor tool", platforms: ["win32"], requires: ["game"], steps: STEPS.windowsGpu }),
  idea({ id: "vendor-mode", title: "Use the laptop maker's performance mode", category: "power/thermal mode", platforms: ["win32"], formFactors: ["laptop"], requires: ["hot"], steps: STEPS.vendor }),
  idea({ id: "plug-in", title: "Plug the laptop in", category: "power/thermal mode", formFactors: ["laptop"], requires: ["on-battery"], steps: ["Connect the charger.", "Run the same scene again before judging the game."] }),
  idea({ id: "mac-energy", title: "Choose a Mac energy mode", category: "power/thermal mode", platforms: ["darwin"], steps: STEPS.macPower }),
  idea({ id: "clear-vents", title: "Clear the vents", category: "cooling hardware", requires: ["hot"], steps: STEPS.vents, risk: "none" }),
  idea({ id: "free-disk", title: "Free space on a full volume", category: "storage", requires: ["disk-full"], steps: STEPS.disk }),
  idea({ id: "pause-spotlight", title: "Let Spotlight or iCloud finish, then play", category: "close/limit app", platforms: ["darwin"], requires: ["indexing"], steps: ["Wait until Spotlight indexing or iCloud sync drops off the busy list.", "Then start the game."] }),
  idea({ id: "lower-shadows", title: "Lower shadows before resolution", category: "game settings", platforms: ["win32", "linux"], requires: ["game"], steps: ["In the game, lower shadows or the resolution scale.", "Play the same scene and compare."] }),
  idea({ id: "linux-gpu", title: "Use the official Linux GPU settings", category: "vendor tool", platforms: ["linux"], requires: ["gpu-bound"], steps: ["Use NVIDIA settings or CoreCtrl for AMD.", "Cap frames near the monitor refresh."] }),
  idea({ id: "no-optimizer", title: "Do not install an unknown optimizer", category: "close/limit app", steps: ["Skip cleaner and booster downloads.", "Use the vendor settings already named."] }),
  idea({ id: "cooling-pad", title: "Add a cooling pad", category: "cooling hardware", cost: "paid", priceRangeEUR: "20-40", formFactors: ["laptop"], requires: ["hot"], steps: STEPS.pad, risk: "low" }),
  idea({ id: "ram-upgrade", title: "Add memory only if a slot exists", category: "upgrade", cost: "paid", priceRangeEUR: "40-120", requires: ["swap"], steps: STEPS.ram, risk: "medium", reversible: false }),
  idea({ id: "mac-no-gpu-tune", title: "Do not tune a separate Mac graphics card", category: "game settings", platforms: ["darwin"], steps: ["This Mac has no separate graphics card to tune.", "Close the heavy app and lower the game scale."] }),
].flatMap(item => [item, { ...item, id: `${item.id}-repeat`, title: item.title }]).concat([
  idea({ id: "startup-apps", title: "Turn off startup apps you do not need", category: "close/limit app", steps: ["Open the system startup or login items.", "Turn off apps you do not need, then restart once."] }),
  idea({ id: "hard-surface", title: "Move a laptop off soft fabric", category: "cooling hardware", formFactors: ["laptop"], requires: ["hot"], steps: STEPS.vents }),
  idea({ id: "same-scene", title: "Compare the same scene", category: "game settings", steps: ["Change one thing.", "Mark the moment and ask again on the same scene."] }),
  idea({ id: "defender-scan", title: "Let Windows Defender finish its scan", category: "close/limit app", platforms: ["win32"], requires: ["indexing"], steps: ["If Windows Defender scan is the busy app, let it finish.", "Then play again."] }),
  idea({ id: "monitor-cap", title: "Match the frame cap to the screen", category: "game settings", platforms: ["win32", "linux"], steps: ["Cap frames near the screen's refresh rate.", "A higher cap only makes heat."] }),
  idea({ id: "icloud-pause", title: "Pause a large iCloud sync while gaming", category: "close/limit app", platforms: ["darwin"], requires: ["indexing"], steps: ["Wait for iCloud sync to leave the busy list.", "Then start the game."] }),
  idea({ id: "close-browser", title: "Close the browser before a game", category: "close/limit app", requires: ["browser"], steps: STEPS.browser }),
  idea({ id: "paid-monitor", title: "Change the monitor only if it is the limit", category: "upgrade", cost: "paid", priceRangeEUR: "150-400", platforms: ["win32", "linux"], formFactors: ["desktop"], requires: ["gpu-bound"], steps: ["A new monitor helps only when the current screen is the limit.", "You do not need to spend money."], reversible: false, risk: "low" }),
  idea({ id: "airflow-desktop", title: "Check desktop airflow", category: "cooling hardware", formFactors: ["desktop"], requires: ["hot"], steps: ["Keep intake and exhaust clear.", "Compare temperatures on the same workload."] }),
  idea({ id: "battery-game", title: "Do not judge a game on battery", category: "power/thermal mode", formFactors: ["laptop"], requires: ["on-battery"], steps: ["Plug in.", "Run the same scene again."] }),
]);

export function deriveSignals(telemetry, culprits = [], problem = {}) {
  const readings = new Map((telemetry?.readings || []).map(reading => [reading.metric, reading]));
  const usable = metric => readings.get(metric)?.status === "available" && Number.isFinite(readings.get(metric)?.value);
  const value = metric => usable(metric) ? readings.get(metric).value : null;
  const signals = [];
  const add = (id, severity, evidence) => signals.push({ id, severity, evidence, sampledAt: telemetry?.sampledAt || null });
  const cpu = value("temperature.cpu");
  const gpu = value("temperature.gpu");
  if (cpu != null && cpu >= 90) add("hot", Math.min(1, cpu / 100), `CPU temperature is ${cpu.toFixed(0)} °C.`);
  if (gpu != null && gpu >= 80) add("hot", Math.min(1, gpu / 100), `GPU temperature is ${gpu.toFixed(0)} °C.`);
  const heavy = (culprits || []).find(item => item.confidence !== "low") || (culprits || [])[0];
  if (heavy) {
    add("heavy-app", heavy.confidence === "high" ? 0.9 : 0.6, `${heavy.app} has used ${heavy.cpuCores} cores for ${heavy.sustainedForSec} seconds.`);
    if (heavy.category === "browser") add("browser", 0.7, heavy.explanation);
    if (heavy.category === "sync/indexing" || heavy.category === "security scan") add("indexing", 0.6, `${heavy.app} is the busy background task.`);
  }
  const ram = value("memory.ram.usage");
  const swap = value("memory.swap.usage");
  if (ram != null && ram >= 90) add("swap", 0.8, `Memory is at ${ram.toFixed(0)} percent.`);
  if (swap != null && swap >= 20) add("swap", 0.7, `Swap is in use at ${swap.toFixed(0)} percent.`);
  const full = (telemetry?.storageVolumes || []).find(volume => typeof volume.usePercent === "number" && volume.usePercent >= 90);
  if (full) add("disk-full", 0.8, `${full.mount} is ${full.usePercent.toFixed(0)} percent full.`);
  if (telemetry?.device?.acConnected === false) add("on-battery", 0.5, "The computer is on battery.");
  const gpuUse = value("gpu.usage");
  const cpuUse = value("cpu.usage");
  if (gpuUse != null && gpuUse >= 95) add("gpu-bound", 0.8, `GPU load is ${gpuUse.toFixed(0)} percent.`);
  if (cpuUse != null && cpuUse >= 95 && (gpuUse == null || gpuUse < 50)) add("cpu-bound", 0.7, `CPU load is ${cpuUse.toFixed(0)} percent.`);
  if (/unavailable|unsupported/i.test(String(readings.get("fan.rpm")?.status || ""))) {
    add("fan-unknown", 0.1, readings.get("fan.rpm")?.detail || "Fan speed is not reported.");
  }
  const text = `${problem?.text || ""} ${(problem?.symptoms || []).join(" ")} ${(problem?.apps || "")}`.toLowerCase();
  if (/game|fortnite|fps|stutter/.test(text)) add("game", 0.5, "The question names a game or gameplay.");
  if (/hot|warm|fan|thermal/.test(text)) add("hot", 0.4, "The question names heat.");
  return signals;
}

export function rankIdeas(signals, device = {}, problem = {}) {
  const platform = device.platform || "";
  const form = device.formFactor || "";
  const budget = String(problem?.budget || "").toLowerCase();
  const hidePaid = budget === "0" || budget.includes("free") || budget.includes("€0") || budget.includes("$0");
  const ids = new Set(signals.map(signal => signal.id));
  const ranked = IDEAS.filter(item => {
    if (platform && item.platforms?.length && !item.platforms.includes(platform)) return false;
    if (form && item.formFactors?.length && !item.formFactors.includes(form)) return false;
    if (hidePaid && item.cost === "paid") return false;
    if (item.requires?.length && !item.requires.some(id => ids.has(id))) return false;
    return true;
  }).map(item => {
    const matched = item.requires?.length
      ? signals.filter(signal => item.requires.includes(signal.id))
      : [];
    const severity = matched.reduce((max, signal) => Math.max(max, signal.severity || 0), matched.length ? 0 : 0.2);
    const score = severity * (item.cost === "free" ? 1.3 : 1) * (item.reversible ? 1.2 : 1) / (item.risk === "medium" ? 1.4 : 1);
    const evidence = matched[0]?.evidence || "The readings that are present are enough to start.";
    return { ...item, score, why: evidence };
  }).sort((a, b) => b.score - a.score);
  const unique = [];
  const seen = new Set();
  for (const item of ranked) {
    if (seen.has(item.title)) continue;
    seen.add(item.title);
    unique.push(item);
    if (unique.length === 5) break;
  }
  return unique;
}
