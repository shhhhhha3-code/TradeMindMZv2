function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function calculateMomentum(market) {
  const change = finite(market?.change24h);

  if (change === null) {
    return { value: null, state: "UNKNOWN" };
  }

  if (change >= 3) return { value: change, state: "STRONG_UP" };
  if (change >= 1) return { value: change, state: "UP" };
  if (change <= -3) return { value: change, state: "STRONG_DOWN" };
  if (change <= -1) return { value: change, state: "DOWN" };

  return { value: change, state: "FLAT" };
}

export function classifyRSI(rsi) {
  const value = finite(rsi);

  if (value === null) return "UNKNOWN";
  if (value >= 80) return "EXTREME_OVERBOUGHT";
  if (value >= 70) return "OVERBOUGHT";
  if (value >= 55) return "BULLISH_ZONE";
  if (value >= 45) return "NEUTRAL";
  if (value >= 30) return "BEARISH_ZONE";
  return "OVERSOLD";
}

export function classifyTrend(trend = "NEUTRAL") {
  const value = String(trend).toUpperCase();

  if (
    value.includes("BULL") ||
    value === "LONG" ||
    value === "BUY" ||
    value === "UP"
  ) return "BULLISH";

  if (
    value.includes("BEAR") ||
    value === "SHORT" ||
    value === "SELL" ||
    value === "DOWN"
  ) return "BEARISH";

  return "NEUTRAL";
}

export function classifyMarketRegime(market = {}) {
  const atrPct = finite(market?.atrPct ?? market?.indicators?.atrPct);
  const ema9 = finite(market?.ema9 ?? market?.indicators?.ema9);
  const ema21 = finite(market?.ema21 ?? market?.indicators?.ema21);
  const price = finite(market?.price);

  if (atrPct === null && (ema9 === null || ema21 === null)) {
    return "UNKNOWN";
  }

  const normalizedSpread =
    price && price > 0 && ema9 !== null && ema21 !== null
      ? Math.abs(ema9 - ema21) / price * 100
      : 0;

  if (atrPct !== null && atrPct >= 5) return "HIGH_VOLATILITY";
  if (normalizedSpread >= 0.75) return "TRENDING";
  if (atrPct !== null && atrPct <= 0.35) return "LOW_VOLATILITY";

  return "RANGING";
}

export function buildTechnicalSnapshot(market) {
  const momentum = calculateMomentum(market);
  const rsiValue = finite(market?.rsi);
  const ema9 = finite(market?.ema9 ?? market?.indicators?.ema9);
  const ema21 = finite(market?.ema21 ?? market?.indicators?.ema21);
  const macd = finite(market?.macd ?? market?.indicators?.macd);
  const atr = finite(market?.atr ?? market?.indicators?.atr);
  const atrPct = finite(market?.atrPct ?? market?.indicators?.atrPct);

  const suppliedRegime = String(market?.regime ?? "").toUpperCase();
  const regime =
    suppliedRegime && suppliedRegime !== "UNKNOWN"
      ? suppliedRegime
      : classifyMarketRegime({ ...market, ema9, ema21, atrPct });

  return {
    symbol: market?.symbol ?? null,
    trend: classifyTrend(market?.trend),
    momentum,
    rsi: { value: rsiValue, state: classifyRSI(rsiValue) },
    ema9,
    ema21,
    macd,
    atr,
    atrPct,
    regime,
    volumeRatio: finite(market?.volumeRatio),
    riskReward: finite(market?.riskReward),
  };
}
