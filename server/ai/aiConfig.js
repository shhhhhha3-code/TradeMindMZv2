/**
 * TradeMindMZ V2 — Server AI Configuration
 *
 * API keys MUST remain server-side.
 *
 * Expected environment variables:
 *
 * OPENAI_API_KEY=
 * GROQ_API_KEY=
 *
 * Optional:
 * AI_DEFAULT_PROVIDER=groq
 */

export function getServerAIConfig() {
  return {
    openai: {
      enabled: Boolean(process.env.OPENAI_API_KEY),
      configured: Boolean(process.env.OPENAI_API_KEY),
    },

    groq: {
      enabled: Boolean(process.env.GROQ_API_KEY),
      configured: Boolean(process.env.GROQ_API_KEY),
    },

    defaultProvider:
      process.env.AI_DEFAULT_PROVIDER || "groq",
  };
}

export function getAvailableProviders() {
  const config = getServerAIConfig();

  const providers = [];

  if (config.groq.configured) {
    providers.push("groq");
  }

  if (config.openai.configured) {
    providers.push("openai");
  }

  return providers;
}
