import { buildChatMessages } from "./chat.mjs";

const CHAT_TIMEOUT_MS = 12_000;
const GROQ_MODEL = "llama-3.3-70b-versatile";
// Flash-lite answers first. Heavier models are only a fallback.
const GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-3.6-flash"];
let preferredGeminiModel = GEMINI_MODELS[0];

async function groqChat({ messages, apiKey }) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 700,
      messages,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail.includes("Invalid API Key") || response.status === 401
      ? "Groq API key was rejected. Check the key in Machine → Brain."
      : `Groq request failed (${response.status}).`);
  }
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("Groq returned an empty reply.");
  return { reply, model: `groq:${GROQ_MODEL}`, provider: "groq", appliedChanges: false };
}

async function geminiChat({ messages, apiKey, model }) {
  const system = messages.find(item => item.role === "system")?.content || "";
  const contents = messages
    .filter(item => item.role === "user" || item.role === "assistant")
    .map(item => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const generationConfig = { temperature: 0.3, maxOutputTokens: 700 };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const err = new Error(response.status === 400 || response.status === 403
      ? "Gemini API key was rejected. Check the key in Machine → Brain."
      : `Gemini request failed (${response.status}).`);
    err.status = response.status;
    err.detail = detail;
    throw err;
  }
  const data = await response.json();
  const reply = data?.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join("\n").trim();
  if (!reply) throw new Error("Gemini returned an empty reply.");
  return { reply, model: `gemini:${model}`, provider: "gemini", appliedChanges: false };
}

async function geminiChatWithFallback({ messages, apiKey }) {
  const order = [preferredGeminiModel, ...GEMINI_MODELS.filter(model => model !== preferredGeminiModel)];
  const errors = [];
  for (const model of order) {
    try {
      const result = await geminiChat({ messages, apiKey, model });
      preferredGeminiModel = model;
      return result;
    } catch (error) {
      if (error.message?.includes("rejected")) throw error;
      errors.push(`${model}: ${error.message}`);
    }
  }
  const busy = errors.length && errors.every(item => /\b(429|500|502|503|504)\b/.test(item));
  const error = new Error(busy
    ? "The online brain is busy. JARVIS will answer from the readings on this computer."
    : "The online brain did not answer. JARVIS will answer from the readings on this computer.");
  error.status = busy ? 503 : 502;
  throw error;
}

export async function cloudChat({ mode, question, specs, telemetry, history, memoryText, secrets, includeMachine = false, language }) {
  const messages = buildChatMessages({ mode, question, specs, telemetry, history, memoryText, includeMachine, language });
  const errors = [];

  // Gemini first (Google AI credits), then Groq backup.
  if (secrets?.geminiKey) {
    try {
      return await geminiChatWithFallback({ messages, apiKey: secrets.geminiKey });
    } catch (error) {
      errors.push(error.message || "Gemini failed");
    }
  }
  if (secrets?.groqKey) {
    try {
      return await groqChat({ messages, apiKey: secrets.groqKey });
    } catch (error) {
      errors.push(error.message || "Groq failed");
    }
  }
  throw new Error(errors[0] || "No cloud API key configured.");
}
