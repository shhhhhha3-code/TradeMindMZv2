import {
  normalizeMarketData,
  normalizeHistoricalData,
} from "../data/marketData";

/**
 * TradeMindMZ V2 — Market Provider
 *
 * READ-ONLY market data.
 *
 * IMPORTANT:
 * - No trading
 * - No BUY
 * - No SELL
 * - No Pionex order execution
 * - No AI calls
 *
 * Provider can later be replaced without changing
 * the signal engine.
 */

const BINANCE_API =
  "https://api.binance.com/api/v3";

export async function getTicker(symbol = "BTCUSDT") {
  const response = await fetch(
    `${BINANCE_API}/ticker/24hr?symbol=${encodeURIComponent(symbol)}`
  );

  if (!response.ok) {
    throw new Error(
      `Market ticker request failed: ${response.status}`
    );
  }

  const data = await response.json();

  return normalizeMarketData({
    symbol: data.symbol,
    price: data.lastPrice,
    volume: data.volume,
    change24h: data.priceChangePercent,
    high24h: data.highPrice,
    low24h: data.lowPrice,
    timestamp: new Date().toISOString(),
  });
}

export async function getHistoricalCandles(
  symbol = "BTCUSDT",
  interval = "1h",
  limit = 500
) {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 500, 1),
    1000
  );

  const url =
    `${BINANCE_API}/klines` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&limit=${safeLimit}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Historical market request failed: ${response.status}`
    );
  }

  const rows = await response.json();

  const candles = rows.map((row) => ({
    timestamp: new Date(row[0]).toISOString(),
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
  }));

  return normalizeHistoricalData(candles);
}

export async function getMarketSnapshot({
  symbol = "BTCUSDT",
  interval = "1h",
  historicalLimit = 500,
} = {}) {
  const [ticker, historical] =
    await Promise.all([
      getTicker(symbol),
      getHistoricalCandles(
        symbol,
        interval,
        historicalLimit
      ),
    ]);

  return {
    ticker,
    historical,
    latestCandle:
      historical[historical.length - 1] || null,
    provider: "binance",
    timestamp: new Date().toISOString(),
  };
}
