import { getLivePositions } from "../pionex/pionexClient.js";
import { requestPositionAnalysis } from "../services/positionAIClient.js";
import { normalizePosition } from "./positionModel.js";

export async function analyzeLivePositions({
  marketDataBySymbol = {},
  historicalDataBySymbol = {},
} = {}) {
  const response = await getLivePositions();

  if (!response?.success) {
    return {
      success: false,
      positions: [],
      error:
        response?.error ||
        "Unable to read Pionex live positions.",
    };
  }

  const positions = Array.isArray(response.positions)
    ? response.positions
    : [];

  const analyzed = [];

  for (const rawPosition of positions) {
    const position = normalizePosition(rawPosition);

    if (!position?.symbol) {
      continue;
    }

    const marketData =
      marketDataBySymbol[position.symbol] || {};

    const historicalData =
      historicalDataBySymbol[position.symbol] || [];

    const aiResult = await requestPositionAnalysis({
      position,
      marketData,
      historicalData,
    });

    analyzed.push({
      ...position,
      aiAnalysis: aiResult,
      lastAnalyzedAt: new Date().toISOString(),
    });
  }

  return {
    success: true,
    positions: analyzed,
    updatedAt: new Date().toISOString(),
  };
}
