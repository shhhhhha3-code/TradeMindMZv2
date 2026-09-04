import { analyzeWithAI } from "./aiGateway";
import { getAIAnalysisPolicy } from "../config/aiPolicy";
import { analyzeMarket } from "../analysis/marketAnalysis";
import {
  evaluateHistoricalSignal,
} from "../learning/historicalLearning";

function buildHistoricalEvidence(candles = []) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return {
      available: false,
      samples: 0,
      winRate: 0,
      averageReturn: 0,
    };
  }

  const results = [];

  for (let i = 0; i < candles.length - 1; i += 1) {
    const entry = Number(candles[i]?.close);
    const future = Number(candles[i + 1]?.close);

    if (
      !Number.isFinite(entry) ||
      !Number.isFinite(future) ||
      entry <= 0
    ) {
      continue;
    }

    const change =
      ((future - entry) / entry) * 100;

    results.push({
      result:
        change > 0
          ? "WIN"
          : change < 0
            ? "LOSS"
            : "FLAT",
      returnPercent: change,
    });
  }

  if (!results.length) {
    return {
      available: false,
      samples: 0,
      winRate: 0,
      averageReturn: 0,
    };
  }

  const wins = results.filter(
    (item) => item.result === "WIN"
  ).length;

  const averageReturn =
    results.reduce(
      (sum, item) =>
        sum + item.returnPercent,
      0
    ) / results.length;

  return {
    available: true,
    samples: results.length,
    winRate:
      (wins / results.length) * 100,
    averageReturn,
  };
}

export async function createAIAnalysis({
  symbol,
  candles = [],
  marketData = {},
} = {}) {
  const policy = getAIAnalysisPolicy();

  /*
   * HARD STOP:
   * AI disabled means absolutely no provider call.
   */
  if (!policy.enabled) {
    return {
      success: false,
      skipped: true,
      status: "AI_DISABLED",
      symbol,
      recommendation: null,
      reason: "AI analysis is disabled.",
    };
  }

  if (!policy.providers.length) {
    return {
      success: false,
      skipped: true,
      status: "NO_PROVIDER",
      symbol,
      recommendation: null,
      reason: "No AI provider is enabled.",
    };
  }

  const technical = analyzeMarket(candles);

  const historical =
    policy.historicalLearning
      ? buildHistoricalEvidence(candles)
      : {
          available: false,
          samples: 0,
          winRate: 0,
          averageReturn: 0,
        };

  const payload = {
    symbol,

    market: {
      ...marketData,
      technical,
    },

    historical,

    instruction: `
You are the TradeMindMZ market analysis engine.

Analyze the supplied market and historical evidence.

Return ONE normalized recommendation.

Possible directions:
BUY
SELL
HOLD
NEUTRAL

Do not place trades.
Do not claim that an order was placed.

The recommendation must include:
symbol
direction
score 0-100
confidence 0-100
entry
stopLoss
takeProfit
riskReward
reasoning

Prefer NO TRADE when evidence is weak.
`,
  };

  const result =
    await analyzeWithAI(payload);

  if (!result?.success) {
    return {
      ...result,
      symbol,
      technical,
      historical,
    };
  }

  return {
    ...result,
    symbol,
    technical,
    historical,
  };
}
