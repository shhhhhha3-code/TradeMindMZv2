/**
 * TradeMindMZ V2 Market Data Layer
 *
 * This layer only normalizes market information.
 *
 * IMPORTANT:
 * - No trading.
 * - No Pionex orders.
 * - No OpenAI calls.
 * - No Groq calls.
 *
 * Real market-data providers will be connected later.
 */

export function normalizeMarketData(data = {}) {
  return {
    symbol: data.symbol || null,

    price: toNumber(data.price),
    volume: toNumber(data.volume),

    change24h: toNumber(data.change24h),
    high24h: toNumber(data.high24h),
    low24h: toNumber(data.low24h),

    timestamp:
      data.timestamp ||
      new Date().toISOString(),

    timeframe: data.timeframe || "1h",

    indicators: {
      rsi: toNumber(data.indicators?.rsi),
      macd: toNumber(data.indicators?.macd),
      ema20: toNumber(data.indicators?.ema20),
      ema50: toNumber(data.indicators?.ema50),
      ema200: toNumber(data.indicators?.ema200),
    },
  };
}

export function normalizeHistoricalData(rows = []) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => ({
      timestamp: row.timestamp || null,
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume),
    }))
    .filter(
      (row) =>
        row.timestamp &&
        row.open !== null &&
        row.high !== null &&
        row.low !== null &&
        row.close !== null
    );
}

export function getLatestCandle(rows = []) {
  const normalized = normalizeHistoricalData(rows);

  if (!normalized.length) {
    return null;
  }

  return normalized[normalized.length - 1];
}

export function calculatePriceChange(previous, current) {
  const oldPrice = Number(previous);
  const newPrice = Number(current);

  if (
    !Number.isFinite(oldPrice) ||
    !Number.isFinite(newPrice) ||
    oldPrice === 0
  ) {
    return null;
  }

  return ((newPrice - oldPrice) / oldPrice) * 100;
}

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}
