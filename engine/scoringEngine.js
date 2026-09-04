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

  if (change !== null) {
    const momentumScore = Math.min(
      Math.abs(change) * 8,
      20
    );

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
