/**
 * Market-data provider contract.
 *
 * Future providers must implement:
 *
 * getTicker(symbol)
 * getCandles(symbol, timeframe, limit)
 *
 * Providers must return normalized data.
 */

export function validateMarketProvider(provider) {
  return Boolean(
    provider &&
    typeof provider.getTicker === "function" &&
    typeof provider.getCandles === "function"
  );
}

export async function fetchTicker(
  provider,
  symbol
) {
  if (!validateMarketProvider(provider)) {
    throw new Error(
      "Invalid market-data provider."
    );
  }

  return provider.getTicker(symbol);
}

export async function fetchCandles(
  provider,
  symbol,
  timeframe = "1h",
  limit = 500
) {
  if (!validateMarketProvider(provider)) {
    throw new Error(
      "Invalid market-data provider."
    );
  }

  return provider.getCandles(
    symbol,
    timeframe,
    limit
  );
}
