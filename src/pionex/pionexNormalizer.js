/**
 * Normalize Pionex position data into the
 * internal TradeMindMZ format.
 *
 * No trading operations.
 */

function numberOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

export function normalizePionexPosition(
  position = {}
) {
  return {
    symbol:
      position.symbol ||
      position.market ||
      null,

    side:
      position.side ||
      position.direction ||
      "UNKNOWN",

    quantity: numberOrNull(
      position.quantity ??
      position.amount ??
      position.size
    ),

    entryPrice: numberOrNull(
      position.entryPrice ??
      position.entry_price ??
      position.avgPrice
    ),

    currentPrice: numberOrNull(
      position.currentPrice ??
      position.current_price ??
      position.markPrice
    ),

    unrealizedPnl: numberOrNull(
      position.unrealizedPnl ??
      position.unrealized_pnl ??
      position.pnl
    ),

    leverage: numberOrNull(
      position.leverage
    ),

    timestamp:
      position.timestamp ||
      position.updateTime ||
      new Date().toISOString(),
  };
}

export function normalizePionexPositions(
  positions = []
) {
  if (!Array.isArray(positions)) {
    return [];
  }

  return positions
    .map(normalizePionexPosition)
    .filter(
      (position) => position.symbol
    );
}
