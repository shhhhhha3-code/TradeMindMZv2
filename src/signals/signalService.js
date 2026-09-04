import {
  createAIAnalysis,
} from "../ai/aiAnalysis";

import {
  normalizeSignal,
  rankSignals,
  getBestRecommendedSignal,
} from "./signalEngine";

export async function generateSignal({
  symbol,
  candles = [],
  marketData = {},
} = {}) {
  const analysis =
    await createAIAnalysis({
      symbol,
      candles,
      marketData,
    });

  if (
    !analysis ||
    analysis.skipped ||
    !analysis.success
  ) {
    return {
      success: false,
      status:
        analysis?.status ||
        "ANALYSIS_FAILED",
      symbol,
      signal: null,
      analysis,
    };
  }

  const signal =
    normalizeSignal(
      analysis.signal ||
      analysis.recommendation ||
      {}
    );

  return {
    success: true,
    status: "SIGNAL_READY",
    symbol,
    signal,
    analysis,
  };
}

export function rankRecommendedSignals(
  signals = []
) {
  return rankSignals(
    signals.filter(Boolean)
  );
}

export function selectBestSignal(
  signals = []
) {
  return getBestRecommendedSignal(
    signals.filter(Boolean)
  );
}
