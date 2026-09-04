/**
 * TradeMindMZ V2 — Historical Learning Engine
 *
 * Analyses historical candles/signals.
 *
 * IMPORTANT:
 * - No live trading.
 * - No Pionex orders.
 * - No external AI calls.
 * - No API keys.
 *
 * Purpose:
 * Give the AI measurable historical evidence.
 */

export function evaluateHistoricalSignal({
  entry,
  stopLoss,
  takeProfit,
  futurePrice,
}) {
  const e = Number(entry);
  const sl = Number(stopLoss);
  const tp = Number(takeProfit);
  const future = Number(futurePrice);

  if (
    !Number.isFinite(e) ||
    !Number.isFinite(sl) ||
    !Number.isFinite(tp) ||
    !Number.isFinite(future) ||
    e <= 0
  ) {
    return {
      result: "INVALID",
      returnPercent: null,
      riskReward: null,
    };
  }

  const risk = Math.abs(e - sl);
  const reward = Math.abs(tp - e);

  const riskReward =
    risk > 0 ? reward / risk : null;

  const returnPercent =
    ((future - e) / e) * 100;

  let result = "NEUTRAL";

  if (future >= tp) {
    result = "WIN";
  } else if (future <= sl) {
    result = "LOSS";
  }

  return {
    result,
    returnPercent,
    riskReward,
  };
}

export function calculateHistoricalPerformance(results = []) {
  const valid = results.filter(
    (item) =>
      item &&
      item.result &&
      item.result !== "INVALID"
  );

  if (!valid.length) {
    return {
      samples: 0,
      wins: 0,
      losses: 0,
      neutral: 0,
      winRate: 0,
      averageReturn: 0,
      averageRiskReward: 0,
    };
  }

  const wins = valid.filter(
    (item) => item.result === "WIN"
  ).length;

  const losses = valid.filter(
    (item) => item.result === "LOSS"
  ).length;

  const neutral = valid.filter(
    (item) => item.result === "NEUTRAL"
  ).length;

  const returns = valid
    .map((item) => Number(item.returnPercent))
    .filter(Number.isFinite);

  const riskRewards = valid
    .map((item) => Number(item.riskReward))
    .filter(Number.isFinite);

  const average = (values) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) /
        values.length
      : 0;

  return {
    samples: valid.length,
    wins,
    losses,
    neutral,

    winRate:
      valid.length > 0
        ? (wins / valid.length) * 100
        : 0,

    averageReturn: average(returns),

    averageRiskReward: average(riskRewards),
  };
}

/**
 * Calculate a historical confidence score.
 *
 * This is NOT the AI confidence.
 * It is an objective historical score that the AI
 * can use as evidence.
 */
export function calculateHistoricalScore(performance = {}) {
  const winRate = Number(performance.winRate) || 0;
  const averageReturn =
    Number(performance.averageReturn) || 0;
  const samples = Number(performance.samples) || 0;

  if (!samples) {
    return 0;
  }

  const winComponent = Math.min(
    60,
    winRate * 0.6
  );

  const returnComponent = Math.max(
    -20,
    Math.min(20, averageReturn * 2)
  );

  const sampleComponent =
    Math.min(20, samples / 10);

  return Math.max(
    0,
    Math.min(
      100,
      winComponent +
        returnComponent +
        sampleComponent
    )
  );
}

/**
 * Build a compact historical-learning profile
 * for one trading pair.
 */
export function buildLearningProfile({
  symbol,
  timeframe = "1h",
  results = [],
}) {
  const performance =
    calculateHistoricalPerformance(results);

  const historicalScore =
    calculateHistoricalScore(performance);

  return {
    symbol: symbol || null,
    timeframe,

    historicalScore,

    performance: {
      samples: performance.samples,
      wins: performance.wins,
      losses: performance.losses,
      neutral: performance.neutral,
      winRate: performance.winRate,
      averageReturn: performance.averageReturn,
      averageRiskReward:
        performance.averageRiskReward,
    },

    generatedAt:
      new Date().toISOString(),
  };
}

/**
 * Rank learning profiles.
 *
 * Historical performance is evidence,
 * not a trading instruction.
 */
export function rankLearningProfiles(
  profiles = []
) {
  return [...profiles]
    .filter(Boolean)
    .sort(
      (a, b) =>
        (Number(b.historicalScore) || 0) -
        (Number(a.historicalScore) || 0)
    );
}

/**
 * Build a compact historical-performance summary.
 *
 * This is evidence for the AI layer only.
 * It does not place trades.
 */
export function buildHistoricalLearningSummary(candles = []) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return {
      available: false,
      samples: 0,
      wins: 0,
      losses: 0,
      flats: 0,
      winRate: 0,
      averageReturn: 0,
      evidence: [],
    };
  }

  const evidence = [];

  for (let i = 0; i < candles.length - 1; i += 1) {
    const entry = Number(candles[i]?.close);
    const futurePrice = Number(candles[i + 1]?.close);

    if (
      !Number.isFinite(entry) ||
      !Number.isFinite(futurePrice) ||
      entry <= 0
    ) {
      continue;
    }

    const returnPercent =
      ((futurePrice - entry) / entry) * 100;

    evidence.push({
      timestamp:
        candles[i + 1]?.timestamp ||
        candles[i + 1]?.candle_time ||
        null,

      entry,

      futurePrice,

      returnPercent,

      result:
        returnPercent > 0
          ? "WIN"
          : returnPercent < 0
            ? "LOSS"
            : "FLAT",
    });
  }

  if (!evidence.length) {
    return {
      available: false,
      samples: 0,
      wins: 0,
      losses: 0,
      flats: 0,
      winRate: 0,
      averageReturn: 0,
      evidence: [],
    };
  }

  const wins = evidence.filter(
    (item) => item.result === "WIN"
  ).length;

  const losses = evidence.filter(
    (item) => item.result === "LOSS"
  ).length;

  const flats = evidence.filter(
    (item) => item.result === "FLAT"
  ).length;

  const averageReturn =
    evidence.reduce(
      (sum, item) => sum + item.returnPercent,
      0
    ) / evidence.length;

  const decisiveSamples = wins + losses;

  const winRate =
    decisiveSamples > 0
      ? (wins / decisiveSamples) * 100
      : 0;

  return {
    available: true,
    samples: evidence.length,
    wins,
    losses,
    flats,
    winRate,
    averageReturn,
    evidence,
  };
}
