import {
  normalizeCurrentMarketData,
  getMarketDataStatus,
} from "./marketDataService";

export function runMarketDataSelfTest() {
  const sample = normalizeCurrentMarketData({
    symbol: "BTCUSDT",
    price: 100000,
    volume: 123456,
    change24h: 2.5,
    timeframe: "1h",
    indicators: {
      rsi: 58,
      macd: 120,
      ema20: 99500,
      ema50: 98000,
      ema200: 85000,
    },
  });

  const status =
    getMarketDataStatus({
      symbol: "BTCUSDT",
      timeframe: "1h",
    });

  return {
    success:
      sample.symbol === "BTCUSDT" &&
      sample.price === 100000 &&
      status.cached === true,

    sample,
    status,
  };
}
