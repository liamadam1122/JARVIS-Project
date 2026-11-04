import { cloudChat } from "./cloud.mjs";
import { localChat, ollamaStatus } from "./chat.mjs";
import { loadSecrets, publicBrainConfig } from "./secrets.mjs";
import { remoteSharedChat, sharedBrainTarget } from "./shared-brain.mjs";

export async function brainStatus() {
  const [config, ollama, target] = await Promise.all([
    publicBrainConfig(),
    ollamaStatus(),
    sharedBrainTarget(),
  ]);
  const hostCloud = Boolean(config.geminiConfigured || config.groqConfigured);

  if (target.remote) {
    let remoteOk = false;
    try {
      const response = await fetch(`${target.brainUrl}/v1/health`, { signal: AbortSignal.timeout(2500) });
      remoteOk = response.ok;
    } catch {
      remoteOk = false;
    }
    return {
      preferred: remoteOk ? "shared" : "offline",
      label: remoteOk
        ? "Shared cloud brain · no personal key"
        : "Shared cloud brain unreachable",
      cloudReady: remoteOk,
      shared: true,
      remote: true,
      perUserKey: false,
      brainHost: target.brainUrl,
      localReady: Boolean(ollama.running && ollama.models.length),
      allowLocal: config.allowLocal,
      geminiConfigured: false,
      groqConfigured: false,
      ollama,
    };
  }

  let preferred = "offline";
  if (config.geminiConfigured) preferred = "gemini";
  else if (config.groqConfigured) preferred = "groq";
  else if (config.allowLocal && ollama.running && ollama.models.length) preferred = "local";

  return {
    preferred,
    label: hostCloud
      ? "Shared Google brain · one key for every user"
      : "Shared brain waiting for the product key",
    cloudReady: hostCloud,
    shared: true,
    remote: false,
    perUserKey: false,
    brainHost: null,
    localReady: Boolean(ollama.running && ollama.models.length),
    allowLocal: config.allowLocal,
    geminiConfigured: config.geminiConfigured,
    groqConfigured: config.groqConfigured,
    ollama,
  };
}

export async function smartChat(args) {
  const target = await sharedBrainTarget();
  const secrets = await loadSecrets();
  let remoteError = null;
  if (target.remote) {
    try {
      return await remoteSharedChat(args, target);
    } catch (error) {
      remoteError = error;
    }
  }
  if (secrets.groqKey || secrets.geminiKey) {
    try {
      return await cloudChat({ ...args, secrets });
    } catch (error) {
      remoteError = error;
    }
  }
  if (secrets.allowLocal) {
    const local = await localChat(args);
    return { ...local, model: `ollama:${local.model}`, provider: "local" };
  }
  throw remoteError || new Error(
    "JARVIS uses one shared online brain so nobody pastes a personal API key. The product still needs a single Google AI key on the server (not on each computer). Apple iCloud cannot host that server.",
  );
}
