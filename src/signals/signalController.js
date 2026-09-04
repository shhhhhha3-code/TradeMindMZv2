import {
  getMarketSnapshot,
} from "../providers/marketProvider";

import {
  analyzeMarket,
} from "../analysis/marketAnalysis";

import {
  buildHistoricalLearningSummary,
} from "../learning/historicalLearning";

import {
  requestAIAnalysis,
} from "../services/aiClient";

import {
  createSignalViewModel,
} from "./signalViewModel";

export async function generateLiveAISignal({
  symbol = "BTCUSDT",
  interval = "1h",
  historicalLimit = 200,
} = {}) {
  /*
   * Market data is read-only.
   */
  const snapshot =
    await getMarketSnapshot({
      symbol,
      interval,
      historicalLimit,
    });

  const historical =
    snapshot.historical || [];

  /*
   * Technical analysis runs locally.
   */
  const analysis =
    analyzeMarket({
      symbol,
      price:
        snapshot.ticker?.price,
      candles: historical,
    });

  /*
   * Historical evidence is calculated
   * before AI is called.
   */
  const historicalEvidence =
    buildHistoricalLearningSummary(
      historical
    );

  /*
   * AI request happens only through
   * the central AI client.
   */
  const aiResult =
    await requestAIAnalysis({
      symbol,
      price:
        snapshot.ticker?.price,
      marketData: {
        ticker: snapshot.ticker,
        technicalAnalysis: analysis,
      },
      historicalEvidence,
    });

  return {
    market: snapshot,
    analysis,
    historicalEvidence,
    ai: createSignalViewModel(
      aiResult
    ),
  };
}
