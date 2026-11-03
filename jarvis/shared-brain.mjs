import { readFile } from "node:fs/promises";

export async function sharedBrainTarget() {
  let fileUrl = "";
  try {
    const parsed = JSON.parse(await readFile(new URL("./brain.public.json", import.meta.url), "utf8"));
    fileUrl = String(parsed.brainUrl || "").trim();
  } catch {
    fileUrl = "";
  }
  const brainUrl = String(process.env.JARVIS_BRAIN_URL || fileUrl || "").replace(/\/$/, "");
  const token = String(process.env.JARVIS_BRAIN_TOKEN || "").trim();
  return {
    brainUrl,
    token,
    remote: brainUrl.startsWith("https://") || brainUrl.startsWith("http://"),
  };
}

export async function remoteSharedChat(args, target) {
  const response = await fetch(`${target.brainUrl}/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(target.token ? { Authorization: `Bearer ${target.token}` } : {}),
    },
    signal: AbortSignal.timeout(70_000),
    body: JSON.stringify({
      mode: args.mode || "chat",
      question: String(args.question || "").slice(0, 8000),
      history: Array.isArray(args.history) ? args.history.slice(-8) : [],
      specs: args.specs || {},
      telemetry: args.telemetry || null,
      memoryText: String(args.memoryText || "").slice(0, 4000),
      includeMachine: Boolean(args.includeMachine),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `Shared brain failed (${response.status}).`);
  }
  if (!data.reply) throw new Error("Shared brain returned an empty reply.");
  return {
    reply: data.reply,
    model: data.model || "shared:gemini",
    provider: data.provider || "shared",
    appliedChanges: false,
  };
}
