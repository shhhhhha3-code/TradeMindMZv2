import { assertAIAccess } from "../ai/aiGateway";
import { isHistoricalLearningEnabled } from "../ai/aiSettings";

/**
 * TradeMindMZ V2 Signal Engine
 *
 * IMPORTANT:
 * - Does NOT place trades.
 * - Does NOT connect to Pionex.
 * - Does NOT call OpenAI/Groq directly.
 * - Produces a normalized signal request for the AI layer.
 */

export function createSignalRequest({
  symbol,
  price,
  marketData = {},
  historicalData = [],
}) {
  const aiAccess = assertAIAccess();

  if (!aiAccess.allowed) {
    return {
      success: false,
      status: "AI_DISABLED",
      symbol,
      reason: aiAccess.reason,
      providers: [],
    };
  }

  return {
    success: true,
    status: "READY_FOR_AI",
    symbol,
    price,
    providers: aiAccess.providers,
    historicalLearning: isHistoricalLearningEnabled(),
    marketData,
    historicalData,
  };
}

export function normalizeSignal(signal = {}) {
  const confidence = Math.max(
    0,
    Math.min(100, Number(signal.confidence) || 0)
  );

  const score = Math.max(
    0,
    Math.min(100, Number(signal.score) || 0)
  );

  return {
    symbol: signal.symbol || null,
    direction: signal.direction || "NEUTRAL",
    score,
    confidence,
    entry: Number(signal.entry) || null,
    stopLoss: Number(signal.stopLoss) || null,
    takeProfit: Number(signal.takeProfit) || null,
    riskReward: Number(signal.riskReward) || null,
    reasoning: signal.reasoning || "",
    timestamp: signal.timestamp || new Date().toISOString(),
  };
}

export function rankSignals(signals = []) {
  return [...signals]
    .map(normalizeSignal)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.confidence - a.confidence;
    });
}

export function getBestRecommendedSignal(signals = []) {
  const ranked = rankSignals(signals);

  if (!ranked.length) {
    return null;
  }

  return ranked[0];
}
