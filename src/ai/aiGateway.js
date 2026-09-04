import {
  getAISettings,
  getEnabledProviders,
  isAIEnabled,
} from "./aiSettings";

/**
 * Central AI gateway.
 *
 * IMPORTANT:
 * This module does not call any external AI provider yet.
 * It only controls whether an AI request is allowed.
 *
 * Later:
 *   Market data
 *        ↓
 *   AI Gateway
 *        ↓
 *   OpenAI / Groq
 *
 * If AI is OFF, no provider may be called.
 */

export function getAIStatus() {
  const settings = getAISettings();

  return {
    enabled: isAIEnabled(),
    openai: settings.ai && settings.openai,
    groq: settings.ai && settings.groq,
    historicalLearning: settings.learning,
    providers: getEnabledProviders(),
  };
}

export function canUseAI() {
  return isAIEnabled() && getEnabledProviders().length > 0;
}

export function assertAIAccess() {
  const status = getAIStatus();

  if (!status.enabled) {
    return {
      allowed: false,
      reason: "AI analysis is disabled.",
      providers: [],
    };
  }

  if (status.providers.length === 0) {
    return {
      allowed: false,
      reason: "No AI provider is enabled.",
      providers: [],
    };
  }

  return {
    allowed: true,
    reason: null,
    providers: status.providers,
  };
}

/**
 * Placeholder for the real AI request layer.
 *
 * No network request is made here yet.
 */
export async function analyzeWithAI(_payload) {
  const access = assertAIAccess();

  if (!access.allowed) {
    return {
      success: false,
      skipped: true,
      reason: access.reason,
      providers: [],
    };
  }

  return {
    success: false,
    skipped: true,
    reason: "AI provider integration is not connected yet.",
    providers: access.providers,
  };
}
