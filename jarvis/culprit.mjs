const APP_RULES = [
  { match: /com\.apple\.WebKit|Safari Web Content|Safari/i, app: "Safari (web pages)", category: "browser" },
  { match: /Google Chrome Helper|chrome.*--type=renderer|Google Chrome/i, app: "Chrome (tabs)", category: "browser" },
  { match: /msedge|Microsoft Edge/i, app: "Edge (tabs)", category: "browser" },
  { match: /Isolated Web Content|firefox/i, app: "Firefox (tabs)", category: "browser" },
  { match: /\bBrave\b/i, app: "Brave (tabs)", category: "browser" },
  { match: /\bArc\b/i, app: "Arc (tabs)", category: "browser" },
  { match: /\bOpera\b/i, app: "Opera (tabs)", category: "browser" },
  { match: /Cursor Helper|Cursor/i, app: "Cursor", category: "dev tool" },
  { match: /Code Helper|Code/i, app: "VS Code", category: "dev tool" },
  { match: /Discord/i, app: "Discord", category: "other" },
  { match: /Spotify/i, app: "Spotify", category: "other" },
  { match: /steamwebhelper|Steam/i, app: "Steam", category: "game" },
  { match: /EpicGames|Epic Web Helper|Epic/i, app: "Epic", category: "game" },
  { match: /Battle\.net/i, app: "Battle.net", category: "game" },
  { match: /\bOBS\b/i, app: "OBS", category: "other" },
  { match: /Teams/i, app: "Teams", category: "other" },
  { match: /Zoom/i, app: "Zoom", category: "other" },
  { match: /^mds_stores$|^mds$|^mdworker/i, app: "Spotlight indexing", category: "sync/indexing" },
  { match: /^(bird|cloudd)$/i, app: "iCloud sync", category: "sync/indexing" },
  { match: /photoanalysisd/i, app: "Photos analysis", category: "sync/indexing" },
  { match: /MsMpEng/i, app: "Windows Defender scan", category: "security scan" },
  { match: /SearchIndexer/i, app: "Windows Search indexing", category: "sync/indexing" },
  { match: /TiWorker/i, app: "Windows Update", category: "system" },
];

const QUIET = new Set(["kernel_task", "WindowServer", "loginwindow", "sysmond", "distnoted", "cfprefsd", "launchd", "systemd", "Idle"]);

export function classifyProcess(proc) {
  const raw = `${proc?.name || ""} ${proc?.command || ""}`.trim();
  if (!raw || QUIET.has(proc?.name)) return null;
  for (const rule of APP_RULES) {
    if (rule.match.test(raw)) return { app: rule.app, category: rule.category, processName: proc.name || raw };
  }
  const cleaned = String(proc?.name || raw)
    .replace(/\s+Helper(?:\s*\(.*\))?$/i, "")
    .replace(/\s+\((Renderer|GPU|Plugin)\)/gi, "")
    .replace(/\.exe$/i, "")
    .slice(0, 48);
  if (!cleaned) return null;
  return { app: cleaned, category: "other", processName: proc.name || cleaned };
}

function parentWalk(list, proc, depth = 0) {
  if (depth > 4 || !proc) return proc;
  const named = classifyProcess(proc);
  if (named && named.category !== "other") return { ...proc, _classified: named };
  const parent = list.find(item => item.pid && item.pid === proc.parentPid);
  if (!parent) return { ...proc, _classified: named };
  const walked = parentWalk(list, parent, depth + 1);
  return walked?._classified ? { ...proc, _classified: walked._classified, name: proc.name } : { ...proc, _classified: named };
}

export function sampleProcesses(list, logicalCores = 1) {
  const cores = Math.max(1, Number(logicalCores) || 1);
  const grouped = new Map();
  for (const proc of list || []) {
    const walked = parentWalk(list, proc);
    const named = walked?._classified || classifyProcess(proc);
    if (!named) continue;
    const cpu = Number(proc.cpu);
    const mem = Number(proc.mem);
    const row = grouped.get(named.app) || {
      app: named.app,
      category: named.category,
      cpu: 0,
      mem: 0,
      processNames: new Set(),
    };
    if (Number.isFinite(cpu) && cpu > 0) row.cpu += cpu;
    if (Number.isFinite(mem) && mem > 0) row.mem += mem;
    if (named.processName) row.processNames.add(named.processName);
    grouped.set(named.app, row);
  }
  return [...grouped.values()].map(row => ({
    app: row.app,
    category: row.category,
    cpuPctOfMachine: Math.min(100, row.cpu / cores),
    cpuCores: row.cpu / 100,
    memPct: row.mem,
    processNames: [...row.processNames],
    at: Date.now(),
  }));
}

export class CulpritTracker {
  constructor() {
    this.windows = new Map();
    this.lastClientAt = 0;
    this.gpuAttribution = "unsupported";
  }

  noteClient() {
    this.lastClientAt = Date.now();
  }

  get wantsSamples() {
    return Date.now() - this.lastClientAt < 60_000;
  }

  ingest(list, logicalCores = 1, at = Date.now()) {
    const sample = sampleProcesses(list, logicalCores).map(row => ({ ...row, at }));
    for (const row of sample) {
      const history = this.windows.get(row.app) || [];
      history.push(row);
      this.windows.set(row.app, history.filter(item => at - item.at <= 120_000));
    }
    for (const [app, history] of this.windows) {
      const fresh = history.filter(item => at - item.at <= 120_000);
      if (!fresh.length) this.windows.delete(app);
      else this.windows.set(app, fresh);
    }
    return this.snapshot({ at });
  }

  snapshot({ swapInUse = false, at = Date.now() } = {}) {
    const culprits = [];
    for (const history of this.windows.values()) {
      const fresh = history.filter(item => at - item.at <= 120_000);
      if (!fresh.length) continue;
      const avg = fresh.reduce((sum, item) => sum + item.cpuPctOfMachine, 0) / fresh.length;
      const peak = Math.max(...fresh.map(item => item.cpuPctOfMachine));
      const mem = fresh[fresh.length - 1].memPct;
      const sustainedForSec = Math.max(0, (at - fresh[0].at) / 1000);
      const heavy = (avg >= 15 && sustainedForSec >= 30) || (mem >= 20 && swapInUse);
      if (!heavy) continue;
      const confidence = sustainedForSec >= 60 ? "high" : sustainedForSec >= 30 ? "medium" : "low";
      const latest = fresh[fresh.length - 1];
      const browser = latest.category === "browser";
      culprits.push({
        app: latest.app,
        category: latest.category,
        cpuPctOfMachine: Number(avg.toFixed(1)),
        cpuCores: Number((fresh.reduce((sum, item) => sum + item.cpuCores, 0) / fresh.length).toFixed(1)),
        memPct: Number(mem.toFixed(1)),
        gpuPct: null,
        sustainedForSec: Math.round(sustainedForSec),
        confidence,
        processNames: latest.processNames,
        explanation: browser
          ? `One or more tabs or extensions in ${latest.app.replace(/ \(.*\)$/, "")}. Open the browser's Task Manager to see which. JARVIS cannot name the website.`
          : `${latest.app} is using about ${avg.toFixed(1)}% of the machine.`,
        score: 0.6 * avg + 0.25 * peak + 0.15 * mem,
      });
    }
    culprits.sort((a, b) => b.score - a.score);
    const busyApps = [...this.windows.values()].map(history => history[history.length - 1]).filter(Boolean)
      .sort((a, b) => b.cpuPctOfMachine - a.cpuPctOfMachine)
      .slice(0, 6)
      .map(row => ({ name: row.app, cpu: Number(row.cpuPctOfMachine.toFixed(1)), mem: Number(row.memPct.toFixed(1)), category: row.category }));
    const heavyApps = culprits.filter(item => item.confidence !== "low").slice(0, 3).map(item => ({
      name: item.app,
      cpu: item.cpuPctOfMachine,
      mem: item.memPct,
    }));
    return { culprits, culpritWindowSec: 120, busyApps, heavyApps, gpuAttribution: this.gpuAttribution };
  }
}

export function sustainedLoadShouldFlag(samples) {
  const tracker = new CulpritTracker();
  let at = 0;
  for (const list of samples) {
    at += 5000;
    tracker.ingest(list, 8, at);
  }
  return tracker.snapshot({ at }).culprits;
}
