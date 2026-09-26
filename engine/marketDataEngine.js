function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeMarket(market = {}) {
  const indicators = market?.indicators ?? {};
  const ticker = market?.ticker ?? {};

  const price = number(
    market?.price ??
    market?.lastPrice ??
    market?.close ??
    ticker?.close
  );

  const open = number(market?.open ?? ticker?.open);
  const high = number(market?.high ?? ticker?.high);
  const low = number(market?.low ?? ticker?.low);

  const close = number(
    market?.close ??
    market?.price ??
    market?.lastPrice ??
    ticker?.close
  );

  const volume = number(market?.volume ?? ticker?.volume);

  const rsi = number(
    market?.rsi ??
    market?.RSI ??
    market?.rsi14 ??
    indicators?.rsi ??
    indicators?.RSI ??
    indicators?.rsi14
  );

  const volumeRatio = number(
    market?.volumeRatio ??
    market?.volume_ratio ??
    indicators?.volumeRatio ??
    indicators?.volume_ratio
  );

  const change24h = number(
    market?.change24h ??
    market?.priceChangePercent ??
    market?.changePercent ??
    indicators?.change24h
  );

  const riskReward = number(
    market?.riskReward ??
    market?.rr ??
    market?.risk_reward ??
    indicators?.riskReward
  );

  const score = number(
    market?.score ??
    market?.aiScore ??
    market?.signalScore
  );

  const confidence = number(
    market?.confidence ??
    market?.aiConfidence
  );

  const trend = String(
    market?.trend ??
    market?.direction ??
    market?.bias ??
    "NEUTRAL"
  ).toUpperCase();

  const ema9 = number(market?.ema9 ?? indicators?.ema9);
  const ema21 = number(market?.ema21 ?? indicators?.ema21);
  const macd = number(market?.macd ?? indicators?.macd);
  const atr = number(market?.atr ?? indicators?.atr);
  const atrPct = number(market?.atrPct ?? indicators?.atrPct);
  const regime = String(
    market?.regime ??
    indicators?.regime ??
    "UNKNOWN"
  ).toUpperCase();

  return {
    ...market,
    symbol: market?.symbol ?? ticker?.symbol ?? null,
    price,
    open,
    high,
    low,
    close,
    volume,
    rsi,
    volumeRatio,
    change24h,
    riskReward,
    ema9,
    ema21,
    macd,
    atr,
    atrPct,
    regime,
    trend,
    score,
    confidence,
    timestamp:
      market?.timestamp ??
      market?.scannedAt ??
      ticker?.time ??
      Date.now(),
    raw: market,
  };
}

export function normalizeMarkets(markets = []) {
  return Array.isArray(markets)
    ? markets.map(normalizeMarket)
    : [];
}

export function normalizeMarketCandidate(market = {}) {
  return normalizeMarket(market);
}
