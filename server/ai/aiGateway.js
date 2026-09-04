import {
  getServerAIConfig,
  getAvailableProviders,
} from "./aiConfig.js";

/**
 * Server-side AI gateway.
 *
 * This is the ONLY layer that will later be allowed
 * to communicate with OpenAI/Groq.
 *
 * No trading functionality exists here.
 */

export function getServerAIStatus() {
  const config = getServerAIConfig();

  return {
    openaiConfigured:
      config.openai.configured,

    groqConfigured:
      config.groq.configured,

    defaultProvider:
      config.defaultProvider,

    availableProviders:
      getAvailableProviders(),
  };
}

export function selectProvider({
  preferredProvider,
  clientSettings = {},
}) {
  const config = getServerAIConfig();

  const available =
    getAvailableProviders();

  if (!clientSettings.ai) {
    return {
      provider: null,
      allowed: false,
      reason: "AI disabled by user.",
    };
  }

  const requested = preferredProvider;

  if (
    requested === "openai" &&
    clientSettings.openai &&
    config.openai.configured
  ) {
    return {
      provider: "openai",
      allowed: true,
      reason: null,
    };
  }

  if (
    requested === "groq" &&
    clientSettings.groq &&
    config.groq.configured
  ) {
    return {
      provider: "groq",
      allowed: true,
      reason: null,
    };
  }

  if (
    config.groq.configured &&
    clientSettings.groq
  ) {
    return {
      provider: "groq",
      allowed: true,
      reason: "Fallback provider selected.",
    };
  }

  if (
    config.openai.configured &&
    clientSettings.openai
  ) {
    return {
      provider: "openai",
      allowed: true,
      reason: "Fallback provider selected.",
    };
  }

  return {
    provider: null,
    allowed: false,
    reason: "No enabled and configured AI provider.",
  };
}

/**
 * Placeholder for provider execution.
 *
 * Deliberately makes NO external request yet.
 */
export async function runAIAnalysis({
  payload,
  preferredProvider,
  clientSettings,
}) {
  const selection = selectProvider({
    preferredProvider,
    clientSettings,
  });

  if (!selection.allowed) {
    return {
      success: false,
      skipped: true,
      provider: null,
      reason: selection.reason,
    };
  }

  return {
    success: false,
    skipped: true,
    provider: selection.provider,
    reason:
      "Provider execution is not connected yet.",
    payloadReceived: Boolean(payload),
  };
}
