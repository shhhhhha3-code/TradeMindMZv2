import {
  loadTrackedPositions,
  saveTrackedPositions,
} from "./positionStorage.js";

export function addManualPionexPosition({
  symbol,
  side = "LONG",
  entryPrice,
  quantity,
  stopLoss = null,
  takeProfit = null,
}) {
  const positions =
    loadTrackedPositions();

  const position = {
    id:
      typeof crypto !== "undefined" &&
      crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,

    symbol:
      String(symbol)
        .trim()
        .toUpperCase(),

    side,

    entryPrice:
      Number(entryPrice),

    quantity:
      Number(quantity),

    stopLoss:
      Number.isFinite(
        Number(stopLoss)
      )
        ? Number(stopLoss)
        : null,

    takeProfit:
      Number.isFinite(
        Number(takeProfit)
      )
        ? Number(takeProfit)
        : null,

    source:
      "MANUAL_PIONEX",

    status:
      "LIVE",

    aiRecommendation:
      "HOLD",

    aiConfidence:
      0,

    aiReasoning:
      "Waiting for AI analysis.",

    currentPrice:
      null,

    unrealizedPercent:
      0,

    createdAt:
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),
  };

  const next = [
    ...positions,
    position,
  ];

  saveTrackedPositions(next);

  return position;
}
