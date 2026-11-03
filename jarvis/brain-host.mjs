import { createServer } from "node:http";
import { cloudChat } from "./cloud.mjs";
import { loadSecrets } from "./secrets.mjs";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8787);
const TOKEN = String(process.env.JARVIS_BRAIN_TOKEN || "").trim();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const buckets = new Map();

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function allow(ip) {
  const now = Date.now();
  const bucket = buckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > WINDOW_MS) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  buckets.set(ip, bucket);
  return bucket.count <= MAX_PER_WINDOW;
}

async function readBody(req, maxBytes = 200_000) {
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

function authorized(req) {
  if (!TOKEN) return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (url.pathname === "/v1/health" && req.method === "GET") {
    const secrets = await loadSecrets();
    const ready = Boolean(secrets.geminiKey || secrets.groqKey);
    return send(res, ready ? 200 : 503, {
      ok: ready,
      shared: true,
      perUserKey: false,
    });
  }
  if (url.pathname !== "/v1/chat" || req.method !== "POST") {
    return send(res, 404, { detail: "Not found." });
  }
  if (!authorized(req)) return send(res, 401, { detail: "Unauthorized." });
  if (!allow(clientIp(req))) return send(res, 429, { detail: "Slow down. Shared brain is busy." });
  try {
    const body = await readBody(req);
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return send(res, 400, { detail: "Question required." });
    const secrets = await loadSecrets();
    if (!secrets.geminiKey && !secrets.groqKey) {
      return send(res, 503, { detail: "Shared brain has no product key configured." });
    }
    const result = await cloudChat({
      mode: "chat",
      question,
      specs: body.specs || {},
      telemetry: body.telemetry || null,
      history: Array.isArray(body.history) ? body.history : [],
      memoryText: typeof body.memoryText === "string" ? body.memoryText : "",
      includeMachine: Boolean(body.includeMachine),
      secrets,
    });
    return send(res, 200, {
      reply: result.reply,
      model: result.model,
      provider: "shared",
    });
  } catch (error) {
    return send(res, 502, { detail: error.message || "Shared brain failed." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`JARVIS shared brain: http://${HOST}:${PORT}`);
});
