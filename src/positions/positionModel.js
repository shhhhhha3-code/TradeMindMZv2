/**
 * TradeMindMZ V2 — Live Position Model
 *
 * Represents a position the user has manually opened
 * in Pionex.
 *
 * IMPORTANT:
 * TradeMindMZ never opens or closes the position.
 */

export function createTrackedPosition({
  symbol,
  side = "LONG",
  entryPrice,
  quantity,
  source = "PIONEX",
}) {
  return {
    id:
      crypto.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`,

    symbol,

    side,

    entryPrice:
      Number(entryPrice) || null,

    quantity:
      Number(quantity) || null,

    source,

    status: "LIVE",

    aiRecommendation: "HOLD",

    aiConfidence: 0,

    aiReasoning: "",

    stopLoss: null,

    takeProfit: null,

    currentPrice: null,

    unrealizedPercent: 0,

    createdAt:
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),
  };
}

export function updateTrackedPosition(
  position,
  updates = {}
) {
  return {
    ...position,
    ...updates,

    updatedAt:
      new Date().toISOString(),
  };
}

export function calculatePositionPerformance({
  side = "LONG",
  entryPrice,
  currentPrice,
}) {
  const entry = Number(entryPrice);
  const current = Number(currentPrice);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(current) ||
    entry <= 0
  ) {
    return null;
  }

  const change =
    side === "SHORT"
      ? ((entry - current) / entry) * 100
      : ((current - entry) / entry) * 100;

  return change;
}
