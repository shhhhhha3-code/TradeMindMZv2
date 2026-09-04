function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function calculateMomentum(market) {
  const change = finite(market?.change24h);

  if (change === null) {
    return {
      value: null,
      state: "UNKNOWN",
    };
  }

  if (change >= 3) {
    return {
      value: change,
      state: "STRONG_UP",
    };
  }

  if (change >= 1) {
    return {
      value: change,
      state: "UP",
    };
  }

  if (change <= -3) {
    return {
      value: change,
      state: "STRONG_DOWN",
    };
  }

  if (change <= -1) {
    return {
      value: change,
      state: "DOWN",
    };
  }

  return {
    value: change,
    state: "FLAT",
  };
}

export function classifyRSI(rsi) {
  const value = finite(rsi);

  if (value === null) {
    return "UNKNOWN";
  }

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
  ) {
    return "BULLISH";
  }

  if (
    value.includes("BEAR") ||
    value === "SHORT" ||
    value === "SELL" ||
    value === "DOWN"
  ) {
    return "BEARISH";
  }

  return "NEUTRAL";
}

export function buildTechnicalSnapshot(market) {
  const momentum = calculateMomentum(market);

  return {
    symbol: market?.symbol ?? null,

    trend: classifyTrend(
      market?.trend
    ),

    momentum,

    rsi: {
      value: finite(market?.rsi),
      state: classifyRSI(market?.rsi),
    },

    volumeRatio:
      finite(market?.volumeRatio),

    riskReward:
      finite(market?.riskReward),
  };
}
