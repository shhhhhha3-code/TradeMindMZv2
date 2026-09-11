import { getPaperLearning } from "./paperLearning.js";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function reliability(total) {
  if (total >= 30) return "STRONG";
  if (total >= 15) return "MEDIUM";
  if (total >= 5) return "EARLY";
  return "INSUFFICIENT";
}

function summarize(records) {
  const total = records.length;

  if (!total) {
    return {
      total: 0,
      wins: 0,
      losses: 0,
      flats: 0,
      winRate: 0,
      totalPnlPercent: 0,
      avgPnlPercent: 0,
    };
  }

  const wins = records.filter(
    record => record.result === "WIN",
  );

  const losses = records.filter(
    record => record.result === "LOSS",
  );

  const flats = records.filter(
    record => record.result === "FLAT",
  );

  const totalPnl = records.reduce(
    (sum, record) => sum + num(record.pnlPercent),
    0,
  );

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    winRate: round((wins.length / total) * 100),
    totalPnlPercent: round(totalPnl),
    avgPnlPercent: round(totalPnl / total),
  };
}

function groupBy(records, selector) {
  const map = new Map();

  for (const record of records) {
    const key = selector(record);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(record);
  }

  return [...map.entries()]
    .map(([name, bucketRecords]) => ({
      name,
      ...summarize(bucketRecords),
      reliability: reliability(bucketRecords.length),
    }))
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }

      return b.totalPnlPercent - a.totalPnlPercent;
    });
}

function rsiZone(value) {
  const n = num(value);

  if (n <= 0) return "UNKNOWN";
  if (n < 30) return "OVERSOLD";
  if (n < 45) return "LOW";
  if (n < 55) return "NEUTRAL";
  if (n < 70) return "HIGH";
  return "OVERBOUGHT";
}

function volumeZone(value) {
  const n = num(value);

  if (n <= 0) return "UNKNOWN";
  if (n < 0.8) return "LOW";
  if (n < 1.0) return "NORMAL_LOW";
  if (n < 1.2) return "NORMAL";
  if (n < 1.5) return "HIGH";
  return "VERY_HIGH";
}

function scoreZone(value) {
  const n = num(value);

  if (n < 60) return "<60";
  if (n < 70) return "60-69";
  if (n < 80) return "70-79";
  if (n < 90) return "80-89";
  return "90+";
}

function confidenceZone(value) {
  const n = num(value);

  if (n < 70) return "<70";
  if (n < 80) return "70-79";
  if (n < 90) return "80-89";
  return "90+";
}

function directionTrendAlignment(record) {
  const direction = normalize(record.direction);
  const trend = normalize(record.trend);

  if (!direction || !trend || trend === "UNKNOWN") {
    return "UNKNOWN";
  }

  const bullishTrend =
    trend.includes("UP") ||
    trend.includes("BULL") ||
    trend.includes("STRONG_UP");

  const bearishTrend =
    trend.includes("DOWN") ||
    trend.includes("BEAR") ||
    trend.includes("STRONG_DOWN");

  if (direction === "BUY") {
    if (bullishTrend) return "ALIGNED";
    if (bearishTrend) return "CONTRARY";
  }

  if (direction === "SELL") {
    if (bearishTrend) return "ALIGNED";
    if (bullishTrend) return "CONTRARY";
  }

  return "UNKNOWN";
}

function directionMomentumAlignment(record) {
  const direction = normalize(record.direction);
  const momentum = normalize(record.momentum);

  if (!direction || !momentum || momentum === "UNKNOWN") {
    return "UNKNOWN";
  }

  const bullish =
    momentum.includes("BULL") ||
    momentum.includes("UP");

  const bearish =
    momentum.includes("BEAR") ||
    momentum.includes("DOWN");

  if (direction === "BUY") {
    if (bullish) return "ALIGNED";
    if (bearish) return "CONTRARY";
  }

  if (direction === "SELL") {
    if (bearish) return "ALIGNED";
    if (bullish) return "CONTRARY";
  }

  return "UNKNOWN";
}

function feedbackScore(summary) {
  if (!summary.total) return 0;

  const weight =
    summary.total >= 30
      ? 1
      : summary.total >= 15
        ? 0.75
        : summary.total >= 5
          ? 0.4
          : 0;

  if (!weight) {
    return 0;
  }

  const winEdge =
    ((summary.winRate - 50) / 10) * weight;

  const pnlEdge =
    Math.max(
      -10,
      Math.min(
        10,
        summary.avgPnlPercent * 2,
      ),
    );

  return round(winEdge + pnlEdge);
}

function enrich(groups) {
  return groups
    .map(group => ({
      ...group,
      feedbackScore: feedbackScore(group),
    }))
    .sort(
      (a, b) =>
        b.feedbackScore - a.feedbackScore,
    );
}

function latest(records) {
  if (!records.length) {
    return null;
  }

  return records
    .slice()
    .sort(
      (a, b) =>
        new Date(
          b.recordedAt ||
            b.evaluatedAt ||
            0,
        ).getTime() -
        new Date(
          a.recordedAt ||
            a.evaluatedAt ||
            0,
        ).getTime(),
    )[0];
}

export function getAdaptiveLearningV5() {
  const learning = getPaperLearning({
    limit: 5000,
  });

  const records = Array.isArray(learning.history)
    ? learning.history
    : [];

  const feedback = {
    direction: enrich(
      groupBy(
        records,
        record =>
          normalize(record.direction) ||
          "UNKNOWN",
      ),
    ),

    rsiZone: enrich(
      groupBy(
        records,
        record => rsiZone(record.rsi),
      ),
    ),

    volumeZone: enrich(
      groupBy(
        records,
        record =>
          volumeZone(record.volumeRatio),
      ),
    ),

    engineScoreZone: enrich(
      groupBy(
        records,
        record =>
          scoreZone(record.engineScore),
      ),
    ),

    confidenceZone: enrich(
      groupBy(
        records,
        record =>
          confidenceZone(record.confidence),
      ),
    ),

    trendAlignment: enrich(
      groupBy(
        records,
        record =>
          directionTrendAlignment(record),
      ),
    ),

    momentumAlignment: enrich(
      groupBy(
        records,
        record =>
          directionMomentumAlignment(record),
      ),
    ),
  };

  const allGroups = Object.values(feedback)
    .flat();

  const strongestSignals = allGroups
    .filter(
      item =>
        item.total >= 5 &&
        item.winRate >= 55 &&
        item.avgPnlPercent > 0,
    )
    .sort(
      (a, b) =>
        b.feedbackScore -
        a.feedbackScore,
    )
    .slice(0, 10);

  const warningSignals = allGroups
    .filter(
      item =>
        item.total >= 5 &&
        (
          item.winRate < 45 ||
          item.avgPnlPercent < 0
        ),
    )
    .sort(
      (a, b) =>
        a.feedbackScore -
        b.feedbackScore,
    )
    .slice(0, 10);

  const newest = latest(records);

  const resultDistribution = summarize(records);

  return {
    success: true,

    generatedAt:
      new Date().toISOString(),

    sampleSize:
      records.length,

    reliability:
      reliability(records.length),

    overall:
      resultDistribution,

    feedback,

    strongestSignals,

    warningSignals,

    latestTrade: newest
      ? {
          symbol: newest.symbol,
          direction: newest.direction,
          result: newest.result,
          pnlPercent:
            round(newest.pnlPercent),
          engineScore:
            round(newest.engineScore),
          confidence:
            round(newest.confidence),
          rsi:
            round(newest.rsi),
          volumeRatio:
            round(newest.volumeRatio),
          trend:
            newest.trend,
          momentum:
            newest.momentum,
          aiProvider:
            newest.aiProvider,
          risk:
            newest.risk,
          evaluationReason:
            newest.evaluationReason,
          recordedAt:
            newest.recordedAt,
        }
      : null,

    policy: {
      mode: "OBSERVE_ONLY",
      automaticSignalOverride: false,
      automaticTradeExecution: false,
      minimumSamples: 30,
      minimumFeedbackSamples: 5,
      maxAdjustment: 10,
    },
  };
}
