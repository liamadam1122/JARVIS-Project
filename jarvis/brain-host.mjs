import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { cloudChat } from "./cloud.mjs";
import { loadSecrets } from "./secrets.mjs";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const TOKEN = String(process.env.JARVIS_BRAIN_TOKEN || "").trim();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const buckets = new Map();

function send(res, status, body) {
  const payload = body == null || status === 204 ? "" : JSON.stringify(body);
  res.writeHead(status, payload
    ? { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) }
    : { "Content-Length": 0 });
  res.end(payload);
}

export function clientIp(req) {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || "unknown";
}

function evictBuckets(now = Date.now()) {
  for (const [ip, bucket] of buckets) {
    if (now - bucket.start > WINDOW_MS) buckets.delete(ip);
  }
}

setInterval(() => evictBuckets(), 60_000).unref?.();

export function allow(ip, now = Date.now()) {
  evictBuckets(now);
  const bucket = buckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > WINDOW_MS) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  buckets.set(ip, bucket);
  return bucket.count <= MAX_PER_WINDOW;
}

export function resetRateLimits() {
  buckets.clear();
}

function authorized(req) {
  if (!TOKEN) return false;
  const header = String(req.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  const actual = Buffer.from(header);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function validateChatBody(body) {
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return { error: "Question required." };
  if (question.length > 8000) return { error: "Question is too long." };
  const history = Array.isArray(body.history) ? body.history : [];
  if (history.length > 8) return { error: "History is too long." };
  for (const turn of history) {
    if (!turn || (turn.role !== "user" && turn.role !== "assistant")) return { error: "History turn is invalid." };
    if (typeof turn.content !== "string" || turn.content.length > 800) return { error: "History turn is too long." };
  }
  const memoryText = typeof body.memoryText === "string" ? body.memoryText : "";
  if (memoryText.length > 4000) return { error: "Memory text is too long." };
  const telemetry = body.telemetry ?? null;
  if (telemetry != null) {
    const encoded = JSON.stringify(telemetry);
    if (Buffer.byteLength(encoded) > 20 * 1024) return { error: "Telemetry is too large." };
  }
  return {
    value: {
      question,
      history,
      memoryText,
      telemetry,
      specs: body.specs && typeof body.specs === "object" ? body.specs : {},
      includeMachine: Boolean(body.includeMachine),
    },
  };
}

async function readBody(req, maxBytes = 64_000) {
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
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createBrainServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "OPTIONS") return send(res, 204, null);
    if (url.pathname === "/v1/health" && req.method === "GET") {
      const secrets = await loadSecrets();
      const ready = Boolean(secrets.geminiKey || secrets.groqKey);
      return send(res, ready ? 200 : 503, { ok: ready, shared: true, perUserKey: false });
    }
    if (url.pathname !== "/v1/chat" || req.method !== "POST") {
      return send(res, 404, { detail: "Not found." });
    }
    if (!authorized(req)) return send(res, 401, { detail: "Unauthorized." });
    if (!allow(clientIp(req))) return send(res, 429, { detail: "Slow down. Shared brain is busy." });
    try {
      const body = await readBody(req);
      const parsed = validateChatBody(body);
      if (parsed.error) return send(res, 400, { detail: parsed.error });
      const secrets = await loadSecrets();
      if (!secrets.geminiKey && !secrets.groqKey) {
        return send(res, 503, { detail: "Shared brain has no product key configured." });
      }
      const result = await cloudChat({
        mode: "chat",
        question: parsed.value.question,
        specs: parsed.value.specs,
        telemetry: parsed.value.telemetry,
        history: parsed.value.history,
        memoryText: parsed.value.memoryText,
        includeMachine: parsed.value.includeMachine,
        secrets,
      });
      return send(res, 200, { reply: result.reply, model: result.model, provider: "shared" });
    } catch (error) {
      console.error("Shared brain failed.", error?.message || error);
      return send(res, 502, { detail: "Shared brain failed." });
    }
  });
}

export function brainConfigError() {
  if (!TOKEN && process.env.JARVIS_BRAIN_INSECURE_DEV !== "1") {
    return "JARVIS_BRAIN_TOKEN is empty. Refusing to start. Set a token, or set JARVIS_BRAIN_INSECURE_DEV=1 only on your own machine.";
  }
  return "";
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const reason = brainConfigError();
  if (reason) {
    console.error(reason);
    process.exit(1);
  }
  if (HOST === "0.0.0.0") {
    console.warn("JARVIS shared brain is bound to 0.0.0.0. Put it behind HTTPS and keep the token off the client.");
  }
  const server = createBrainServer();
  server.listen(PORT, HOST, () => {
    console.log(`JARVIS shared brain: http://${HOST}:${PORT}`);
  });
}
