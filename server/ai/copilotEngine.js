import { getServerAIConfig, getAvailableProviders } from "./aiConfig.js";
import { callAICopilotProvider } from "./providers.js";
import { engineHardBlock } from "./aiDecisionEngine.js";

const MAX_CANDIDATES = 5;
const MAX_CONTEXT_CHARS = 12000;

function clean(value) {
  return String(value ?? "").trim();
}

function compactCandidate(candidate = {}) {
  return {
    symbol: candidate.symbol ?? null,
    direction: candidate.direction ?? null,
    price: candidate.price ?? null,
    entry: candidate.entry ?? null,
    stopLoss: candidate.stopLoss ?? null,
    takeProfit: candidate.takeProfit ?? null,
    engineScore: candidate.engineScore ?? candidate.score ?? null,
    confidence: candidate.confidence ?? null,
    riskReward: candidate.riskReward ?? null,
    risk: candidate.risk?.level ?? candidate.riskLevel ?? null,
    regime: candidate.regime ?? null,
    rsi: candidate.rsi ?? candidate.rsi14 ?? null,
    volumeRatio: candidate.volumeRatio ?? null,
    ema9: candidate.ema9 ?? null,
    ema21: candidate.ema21 ?? null,
    macd: candidate.macd ?? null,
    atrPct: candidate.atrPct ?? null,
    multiTimeframe: candidate.multiTimeframe ?? null,
    dataQuality: candidate.dataQuality ?? null,
    adaptiveLearning: candidate.adaptiveLearning
      ? {
          mode: candidate.adaptiveLearning.mode,
          reliability: candidate.adaptiveLearning.reliability,
          shadowAdjustment: candidate.adaptiveLearning.shadowAdjustment,
          eligibleForPromotion: candidate.adaptiveLearning.eligibleForPromotion,
        }
      : null,
  };
}

function buildCopilotPrompt({ question, candidates, history = {}, portfolio = {} }) {
  const safeContext = {
    candidates: candidates.slice(0, MAX_CANDIDATES).map(compactCandidate),
    history,
    portfolio,
  };

  let context = JSON.stringify(safeContext, null, 2);
  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS) + "\n[CONTEXT_TRUNCATED]";
  }

  return {
    systemPrompt: [
      "You are TradeMindMZ Copilot.",
      "You are an analysis and explanation assistant for a trading-analysis application.",
      "Use ONLY the supplied TradeMind context. Never invent prices, indicators, news, orders, positions, or performance.",
      "The deterministic TradeMind Engine is authoritative for trade eligibility.",
      "Never override or weaken an engine hard block.",
      "Adaptive Learning V7 is SHADOW ONLY and cannot authorize a trade.",
      "Do not place, modify, or claim to have placed any trade.",
      "If the supplied data is insufficient, say so clearly.",
      "When discussing a candidate, distinguish deterministic engine facts from AI interpretation.",
      "If asked why, explain the relevant score components, MTF alignment, risk, data quality, and learning evidence.",
      "Return concise, practical answers. Do not provide hidden chain-of-thought; give conclusions and evidence only.",
    ].join("\n"),
    userPrompt: [
      "USER QUESTION:\n" + (clean(question) || "Summarize the current TradeMind situation."),
      "TRADEMIND CONTEXT:\n" + context,
    ].join("\n\n"),
  };
}

function safeText(value) {
  return clean(value).slice(0, 4000);
}

function validateCandidateContext(candidates) {
  return candidates.map((candidate) => ({
    ...candidate,
    deterministicBlocks: engineHardBlock(candidate),
  }));
}

export async function runTradeMindCopilot({
  question = "",
  candidates = [],
  history = {},
  portfolio = {},
  preferredProvider = null,
  mode = "auto",
} = {}) {
  const available = getAvailableProviders();

  if (!available.length) {
    return {
      success: false,
      status: "NO_PROVIDER",
      provider: null,
      providers: [],
      answer: "No AI provider is configured.",
    };
  }

  const normalizedCandidates = validateCandidateContext(
    Array.isArray(candidates) ? candidates.slice(0, MAX_CANDIDATES) : []
  );

  const config = getServerAIConfig();
  const order = [
    preferredProvider,
    config.defaultProvider,
    ...available,
  ].filter((provider, index, list) =>
    provider && available.includes(provider) && list.indexOf(provider) === index
  );

  const selectedProviders =
    mode === "groq" || mode === "openai"
      ? order.filter((provider) => provider === mode)
      : order;

  if (!selectedProviders.length) {
    return {
      success: false,
      status: "PROVIDER_UNAVAILABLE",
      provider: null,
      providers: available,
      answer: "The requested Copilot provider is not configured.",
    };
  }

  const payload = buildCopilotPrompt({
    question,
    candidates: normalizedCandidates,
    history,
    portfolio,
  });

  const responses = [];
  const errors = [];

  for (const provider of selectedProviders) {
    try {
      const result = await callAICopilotProvider(provider, payload);
      responses.push({
        provider,
        answer: safeText(result?.answer ?? result?.text ?? result),
      });
      if (mode !== "consensus") break;
    } catch (error) {
      errors.push({
        provider,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!responses.length) {
    return {
      success: false,
      status: "AI_FAILED",
      provider: null,
      providers: available,
      answer: "All configured Copilot providers failed.",
      providerErrors: errors,
    };
  }

  const primary = responses[0];

  return {
    success: true,
    status: responses.length > 1 ? "COPILOT_CONSENSUS" : "COPILOT_ANALYZED",
    provider: primary.provider,
    providers: available,
    mode: responses.length > 1 ? "consensus" : mode,
    answer: primary.answer,
    opinions: responses,
    deterministicContext: normalizedCandidates.map((candidate) => ({
      symbol: candidate.symbol,
      engineScore: candidate.engineScore ?? candidate.score ?? null,
      deterministicBlocks: candidate.deterministicBlocks,
      mtfAlignment: candidate.multiTimeframe?.alignment ?? null,
      learningMode: candidate.adaptiveLearning?.mode ?? "SHADOW",
    })),
    providerErrors: errors,
    safety: {
      readOnly: true,
      automaticTrading: false,
      engineAuthority: true,
      adaptiveLearningOverride: false,
    },
  };
}
