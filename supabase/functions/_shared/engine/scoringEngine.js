function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
}

export function calculateEngineScore(market) {
  const existingScore = finite(
    market?.score
  );

  const rsi = finite(
    market?.rsi
  );

  const volumeRatio = finite(
    market?.volumeRatio
  );

  const rr = finite(
    market?.riskReward
  );

  const change = finite(
    market?.change24h
  );

  let score = 0;

  /*
   * The score is intentionally deterministic.
   * AI is NOT responsible for this base score.
   */

  if (existingScore !== null) {
    score += Math.min(
      Math.max(existingScore, 0),
      100
    ) * 0.45;
  } else {
    score += 45;
  }

  /*
   * Direction-aware momentum.
   *
   * BUY:
   *   positive 24h momentum = bonus
   *   negative 24h momentum = penalty
   *
   * SELL:
   *   negative 24h momentum = bonus
   *   positive 24h momentum = penalty
   */
  if (change !== null) {
    const direction =
      String(
        market?.direction ??
        market?.trend ??
        ""
      ).toUpperCase();

    const alignedMomentum =
      direction === "BUY"
        ? change
        : direction === "SELL"
          ? -change
          : 0;

    const momentumScore =
      direction === "BUY" ||
      direction === "SELL"
        ? Math.max(
            -10,
            Math.min(
              20,
              alignedMomentum * 4
            )
          )
        : 0;

    score += momentumScore;
  }

  if (
    rsi !== null &&
    rsi >= 35 &&
    rsi <= 70
  ) {
    score += 12;
  }

  if (
    volumeRatio !== null &&
    volumeRatio >= 0.8
  ) {
    score += 8;
  }

  if (
    rr !== null &&
    rr >= 2
  ) {
    score += 15;
  }

  return Math.round(
    Math.min(
      Math.max(score, 0),
      100
    )
  );
}

export function scoreMarket(market) {
  return {
    ...market,

    engineScore:
      calculateEngineScore(market),
  };
}

export function scoreMarkets(markets = []) {
  return markets
    .map(scoreMarket)
    .sort(
      (a, b) =>
        b.engineScore -
        a.engineScore
    );
}
