export function normalizeMarket(market = {}) {
  const number = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return {
    symbol: market.symbol ?? null,

    price: number(
      market.price ??
      market.lastPrice ??
      market.close
    ),

    open: number(market.open),
    high: number(market.high),
    low: number(market.low),
    close: number(
      market.close ??
      market.price ??
      market.lastPrice
    ),

    volume: number(market.volume),
    volumeRatio: number(
      market.volumeRatio ??
      market.volume_ratio
    ),

    change24h: number(
      market.change24h ??
      market.priceChangePercent ??
      market.changePercent
    ),

    rsi: number(
      market.rsi ??
      market.RSI ??
      market.rsi14
    ),

    trend: String(
      market.trend ??
      market.direction ??
      market.bias ??
      "NEUTRAL"
    ).toUpperCase(),

    score: number(
      market.score ??
      market.aiScore ??
      market.signalScore
    ),

    confidence: number(
      market.confidence ??
      market.aiConfidence
    ),

    riskReward: number(
      market.riskReward ??
      market.rr ??
      market.risk_reward
    ),

    timestamp:
      market.timestamp ??
      Date.now(),

    raw: market,
  };
}

export function normalizeMarkets(markets = []) {
  return Array.isArray(markets)
    ? markets.map(normalizeMarket)
    : [];
}
