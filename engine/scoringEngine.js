function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function directionOf(market) {
  const direction = String(
    market?.direction ??
    market?.trend ??
    ""
  ).toUpperCase();

  if (
    direction === "BUY" ||
    direction === "LONG" ||
    direction.includes("BULL") ||
    direction === "UP"
  ) return "BUY";

  if (
    direction === "SELL" ||
    direction === "SHORT" ||
    direction.includes("BEAR") ||
    direction === "DOWN"
  ) return "SELL";

  return "NEUTRAL";
}

function alignedSign(direction, value) {
  if (value === null || direction === "NEUTRAL") return null;
  return direction === "BUY" ? value : -value;
}

function scoreFromThresholds(value, thresholds) {
  if (value === null) return null;
  for (const threshold of thresholds) {
    if (threshold.when(value)) return threshold.score;
  }
  return 0;
}

/**
 * Build 1 deterministic foundation.
 *
 * When the scanner provides EMA/MACD/ATR data, the score is driven by the
 * technical snapshot instead of trusting an upstream score. Legacy callers
 * without the richer snapshot retain their existing score as a compatibility
 * fallback.
 *
 * Component weights sum to 100:
 * trend 20, momentum 15, RSI 10, volume 10, MACD 15, volatility 10, RR 20.
 */
export function calculateEngineScore(market) {
  const existingScore = finite(market?.score);
  const direction = directionOf(market);

  const rsi = finite(market?.rsi);
  const volumeRatio = finite(market?.volumeRatio);
  const rr = finite(market?.riskReward);
  const change = finite(market?.change24h);
  const ema9 = finite(market?.ema9 ?? market?.indicators?.ema9);
  const ema21 = finite(market?.ema21 ?? market?.indicators?.ema21);
  const macd = finite(market?.macd ?? market?.indicators?.macd);
  const atrPct = finite(market?.atrPct ?? market?.indicators?.atrPct);
  const mtf = market?.multiTimeframe ?? null;

  const hasRichTechnicalData =
    ema9 !== null ||
    ema21 !== null ||
    macd !== null ||
    atrPct !== null;

  if (!hasRichTechnicalData && existingScore !== null) {
    return Math.round(clamp(existingScore));
  }

  let total = 0;

  // Trend structure: 20
  if (ema9 !== null && ema21 !== null && direction !== "NEUTRAL") {
    const spreadPct =
      Math.abs(ema9 - ema21) /
      Math.max(Math.abs(ema21), 1) *
      100;

    const aligned =
      direction === "BUY"
        ? ema9 > ema21
        : ema9 < ema21;

    total += aligned
      ? Math.min(20, 12 + spreadPct * 1.5)
      : 3;
  } else {
    const trend = String(market?.trend ?? "").toUpperCase();
    const aligned =
      (direction === "BUY" &&
        (trend.includes("BULL") || trend === "UP")) ||
      (direction === "SELL" &&
        (trend.includes("BEAR") || trend === "DOWN"));

    total += direction === "NEUTRAL" ? 8 : aligned ? 16 : 4;
  }

  // Directional 24h momentum: 15
  const alignedMomentum = alignedSign(direction, change);
  if (alignedMomentum !== null) {
    total += scoreFromThresholds(alignedMomentum, [
      { when: v => v >= 3, score: 15 },
      { when: v => v >= 1, score: 12 },
      { when: v => v >= 0, score: 8 },
      { when: v => v >= -1, score: 4 },
      { when: () => true, score: 0 },
    ]);
  } else {
    total += 7;
  }

  // RSI quality: 10
  if (rsi !== null) {
    total += scoreFromThresholds(rsi, [
      { when: v => v >= 45 && v <= 60, score: 10 },
      { when: v => v >= 35 && v <= 70, score: 8 },
      { when: v => v > 70 && v < 78, score: 4 },
      { when: v => v > 22 && v < 35, score: 4 },
      { when: () => true, score: 0 },
    ]);
  }

  // Volume confirmation: 10
  if (volumeRatio !== null) {
    total += scoreFromThresholds(volumeRatio, [
      { when: v => v >= 1.5, score: 10 },
      { when: v => v >= 1.1, score: 8 },
      { when: v => v >= 0.8, score: 6 },
      { when: v => v >= 0.6, score: 3 },
      { when: () => true, score: 0 },
    ]);
  }

  // MACD directional confirmation: 15
  if (macd !== null) {
    const alignedMacd = alignedSign(direction, macd);
    total +=
      alignedMacd === null
        ? 7
        : alignedMacd > 0
          ? 15
          : alignedMacd === 0
            ? 7
            : 0;
  }

  // Volatility quality: 10
  if (atrPct !== null) {
    total += scoreFromThresholds(atrPct, [
      { when: v => v >= 0.5 && v <= 3.5, score: 10 },
      { when: v => v > 3.5 && v <= 5, score: 7 },
      { when: v => v > 0.35 && v < 0.5, score: 5 },
      { when: v => v >= 0.2, score: 3 },
      { when: () => true, score: 0 },
    ]);
  }

  // Risk/reward quality: 20
  if (rr !== null) {
    total += scoreFromThresholds(rr, [
      { when: v => v >= 3, score: 20 },
      { when: v => v >= 2.5, score: 17 },
      { when: v => v >= 2.2, score: 14 },
      { when: v => v >= 2, score: 11 },
      { when: v => v >= 1.5, score: 6 },
      { when: () => true, score: 0 },
    ]);
  }

  /*
   * Build 2: multi-timeframe confirmation becomes a bounded 15% component.
   * The base deterministic score keeps 85% weight, while 15% comes from
   * 15M/60M/4H alignment. This avoids allowing one timeframe to dominate.
   */
  if (mtf?.enabled && mtf.status !== "INSUFFICIENT") {
    const mtfScore = finite(mtf.score, 0);
    total =
      total * 0.85 +
      clamp(mtfScore) * 0.15;
  }

  return Math.round(clamp(total));
}

export function calculateDirectionalConfidence(market) {
  const direction = directionOf(market);
  if (direction === "NEUTRAL") return 50;

  const ema9 = finite(market?.ema9 ?? market?.indicators?.ema9);
  const ema21 = finite(market?.ema21 ?? market?.indicators?.ema21);
  const macd = finite(market?.macd ?? market?.indicators?.macd);
  const change = finite(market?.change24h);
  const rsi = finite(market?.rsi);
  const volumeRatio = finite(market?.volumeRatio);

  let confidence = 45;

  if (ema9 !== null && ema21 !== null) {
    confidence +=
      (direction === "BUY" && ema9 > ema21) ||
      (direction === "SELL" && ema9 < ema21)
        ? 18
        : -10;
  }

  if (macd !== null) {
    confidence +=
      (direction === "BUY" && macd > 0) ||
      (direction === "SELL" && macd < 0)
        ? 12
        : -8;
  }

  if (change !== null) {
    const aligned = alignedSign(direction, change);
    confidence += aligned > 0 ? 10 : aligned < 0 ? -6 : 2;
  }

  if (rsi !== null) {
    confidence += rsi >= 35 && rsi <= 70 ? 6 : -4;
  }

  if (volumeRatio !== null) {
    confidence += volumeRatio >= 0.8 ? 5 : -5;
  }

  return Math.round(clamp(confidence));
}

export function scoreMarket(market) {
  const engineScore = calculateEngineScore(market);
  const calculatedConfidence =
    calculateDirectionalConfidence(market);

  const hasRichTechnicalData =
    finite(market?.ema9 ?? market?.indicators?.ema9) !== null ||
    finite(market?.ema21 ?? market?.indicators?.ema21) !== null ||
    finite(market?.macd ?? market?.indicators?.macd) !== null ||
    finite(market?.atrPct ?? market?.indicators?.atrPct) !== null;

  return {
    ...market,
    engineScore,
    confidence: hasRichTechnicalData
      ? calculatedConfidence
      : (
          market?.confidence !== null &&
          market?.confidence !== undefined &&
          Number.isFinite(Number(market.confidence))
            ? clamp(Number(market.confidence))
            : calculatedConfidence
        ),
  };
}

export function scoreMarkets(markets = []) {
  return markets
    .map(scoreMarket)
    .sort((a, b) => b.engineScore - a.engineScore);
}
