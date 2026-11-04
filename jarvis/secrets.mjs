import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writePrivateJson } from "./private-json.mjs";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const SECRETS_PATH = join(DATA_DIR, "secrets.json");
const HOST_ENV_PATH = join(DATA_DIR, "host.env");

async function loadHostEnv() {
  try {
    const text = await readFile(HOST_ENV_PATH, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* host.env is optional */
  }
}

function clipKey(value) {
  return String(value || "").replace(/\s+/g, "").trim().slice(0, 200);
}

function mask(key) {
  const value = clipKey(key);
  if (!value) return null;
  if (value.length < 10) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function readSecretsFile() {
  if (process.env.JARVIS_TEST_OFFLINE === "1") {
    return { groqKey: "", geminiKey: "", allowLocal: false, allowWebLookup: false };
  }
  await loadHostEnv();
  try {
    const parsed = JSON.parse(await readFile(SECRETS_PATH, "utf8"));
    return {
      groqKey: clipKey(parsed.groqKey || process.env.GROQ_API_KEY || process.env.JARVIS_GROQ_KEY),
      geminiKey: clipKey(parsed.geminiKey || process.env.GEMINI_API_KEY || process.env.JARVIS_GEMINI_KEY),
      // Default offline: cloud only, so the Mac stays light.
      allowLocal: Boolean(parsed.allowLocal) || process.env.JARVIS_ALLOW_LOCAL === "1",
      allowWebLookup: Boolean(parsed.allowWebLookup),
    };
  } catch {
    return {
      groqKey: clipKey(process.env.GROQ_API_KEY || process.env.JARVIS_GROQ_KEY),
      geminiKey: clipKey(process.env.GEMINI_API_KEY || process.env.JARVIS_GEMINI_KEY),
      allowLocal: process.env.JARVIS_ALLOW_LOCAL === "1",
      allowWebLookup: false,
    };
  }
}

export async function loadSecrets() {
  return readSecretsFile();
}

export async function saveSecrets({ groqKey, geminiKey, clearGroq = false, clearGemini = false, allowLocal, allowWebLookup } = {}) {
  const current = await readSecretsFile();
  const next = {
    groqKey: clearGroq ? "" : (groqKey !== undefined ? clipKey(groqKey) : current.groqKey),
    geminiKey: clearGemini ? "" : (geminiKey !== undefined ? clipKey(geminiKey) : current.geminiKey),
    allowLocal: allowLocal !== undefined ? Boolean(allowLocal) : Boolean(current.allowLocal),
    allowWebLookup: allowWebLookup !== undefined ? Boolean(allowWebLookup) : Boolean(current.allowWebLookup),
  };
  await writePrivateJson(SECRETS_PATH, next);
  return next;
}

export async function publicBrainConfig() {
  const secrets = await readSecretsFile();
  return {
    groqConfigured: Boolean(secrets.groqKey),
    geminiConfigured: Boolean(secrets.geminiKey),
    groqMasked: mask(secrets.groqKey),
    geminiMasked: mask(secrets.geminiKey),
    allowLocal: Boolean(secrets.allowLocal),
    allowWebLookup: Boolean(secrets.allowWebLookup),
    cloudFirst: true,
  };
}
