import {
  getTicker,
  getHistoricalCandles,
  getMarketSnapshot,
} from "./marketProvider";

/**
 * Manual read-only test helpers.
 *
 * These functions only READ market data.
 */

export async function testTicker() {
  return getTicker("BTCUSDT");
}

export async function testHistoricalData() {
  return getHistoricalCandles(
    "BTCUSDT",
    "1h",
    100
  );
}

export async function testMarketSnapshot() {
  return getMarketSnapshot({
    symbol: "BTCUSDT",
    interval: "1h",
    historicalLimit: 100,
  });
}
