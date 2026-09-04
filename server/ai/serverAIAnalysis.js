import {
  getServerAIConfig,
  getAvailableProviders,
} from "./aiConfig.js";

import { callAIProvider } from "./providers.js";
import { buildSignalPrompt } from "./signalPrompt.js";

export async function analyzeMarketWithServerAI({
  symbol,
  price,
  marketData = {},
  historicalEvidence = {},
}) {
  const config = getServerAIConfig();
  const providers = getAvailableProviders();

  if (!providers.length) {
    return {
      success: false,
      status: "NO_PROVIDER",
      signal: null,
      providers: [],
      error: "No AI provider is configured.",
    };
  }

  const prompt = buildSignalPrompt({
    symbol,
    price,
    marketData,
    historicalEvidence,
  });

  const orderedProviders = [
    config.defaultProvider,
    ...providers.filter(
      (provider) =>
        provider !== config.defaultProvider
    ),
  ].filter(
    (provider, index, list) =>
      list.indexOf(provider) === index
  );

  const errors = [];

  for (const provider of orderedProviders) {
    if (!providers.includes(provider)) {
      continue;
    }

    try {
      const signal = await callAIProvider(
        provider,
        prompt
      );

      return {
        success: true,
        status: "AI_ANALYZED",
        provider,
        providers,
        signal,
        error: null,
      };
    } catch (error) {
      errors.push({
        provider,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  return {
    success: false,
    status: "AI_FAILED",
    signal: null,
    providers,
    error: "All configured AI providers failed.",
    providerErrors: errors,
  };
}


/**
 * Compatibility entry point used by server/index.js.
 *
 * Keeps the server API stable while reusing the
 * existing server-side AI analysis implementation.
 */
export async function analyzeServerAI(payload = {}) {
  return analyzeMarketWithServerAI(payload);
}
