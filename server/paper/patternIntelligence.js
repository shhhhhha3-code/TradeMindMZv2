import { getPaperLearning } from "./paperLearning.js";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
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
      avgPnlPercent: 0
    };
  }

  const wins = records.filter(r => r.result === "WIN");
  const losses = records.filter(r => r.result === "LOSS");
  const flats = records.filter(r => r.result === "FLAT");

  const totalPnl = records.reduce(
    (sum, r) => sum + num(r.pnlPercent),
    0
  );

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    winRate: round((wins.length / total) * 100),
    totalPnlPercent: round(totalPnl),
    avgPnlPercent: round(totalPnl / total)
  };
}

function reliability(total) {
  if (total >= 30) return "STRONG";
  if (total >= 15) return "MEDIUM";
  if (total >= 5) return "EARLY";
  return "INSUFFICIENT";
}

function groupBy(records, key) {
  const groups = new Map();

  for (const record of records) {
    const value = String(record[key] || "UNKNOWN");

    if (!groups.has(value)) {
      groups.set(value, []);
    }

    groups.get(value).push(record);
  }

  return [...groups.entries()]
    .map(([name, bucket]) => ({
      name,
      ...summarize(bucket),
      reliability: reliability(bucket.length)
    }))
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }

      return b.totalPnlPercent - a.totalPnlPercent;
    });
}

function engineBucket(score) {
  const value = num(score);

  if (value < 60) return "<60";
  if (value < 70) return "60-69";
  if (value < 80) return "70-79";
  if (value < 90) return "80-89";
  return "90+";
}

function confidenceBucket(confidence) {
  const value = num(confidence);

  if (value < 70) return "<70";
  if (value < 80) return "70-79";
  if (value < 90) return "80-89";
  return "90+";
}

function makeBucketGroups(records, selector) {
  const buckets = new Map();

  for (const record of records) {
    const key = selector(record);

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }

    buckets.get(key).push(record);
  }

  return [...buckets.entries()]
    .map(([name, bucket]) => ({
      name,
      ...summarize(bucket),
      reliability: reliability(bucket.length)
    }))
    .sort((a, b) => b.totalPnlPercent - a.totalPnlPercent);
}

function intelligenceScore(summary) {
  if (!summary.total) return 0;

  const reliabilityMultiplier =
    summary.total >= 30
      ? 1
      : summary.total >= 15
        ? 0.75
        : summary.total >= 5
          ? 0.4
          : 0;

  const winComponent =
    summary.winRate * reliabilityMultiplier;

  const pnlComponent =
    Math.max(
      -20,
      Math.min(
        20,
        summary.avgPnlPercent * 5
      )
    );

  return round(
    winComponent + pnlComponent
  );
}

function enrich(groups) {
  return groups
    .map(group => ({
      ...group,
      intelligenceScore:
        intelligenceScore(group)
    }))
    .sort(
      (a, b) =>
        b.intelligenceScore -
        a.intelligenceScore
    );
}

export function getPatternIntelligence() {
  const learning = getPaperLearning({
    limit: 500
  });

  const records = Array.isArray(learning.history)
    ? learning.history
    : [];

  const bySymbol = enrich(
    groupBy(records, "symbol")
  );

  const byDirection = enrich(
    groupBy(records, "direction")
  );

  const byAIProvider = enrich(
    groupBy(records, "aiProvider")
  );

  const byRisk = enrich(
    groupBy(records, "risk")
  );

  const byEngineScore = enrich(
    makeBucketGroups(
      records,
      record => engineBucket(record.engineScore)
    )
  );

  const byConfidence = enrich(
    makeBucketGroups(
      records,
      record =>
        confidenceBucket(record.confidence)
    )
  );

  const allGroups = [
    ...bySymbol,
    ...byDirection,
    ...byAIProvider,
    ...byRisk,
    ...byEngineScore,
    ...byConfidence
  ];

  const strongestPatterns = allGroups
    .filter(item => item.total >= 5)
    .slice(0, 10);

  const warningPatterns = allGroups
    .filter(
      item =>
        item.total >= 5 &&
        (
          item.winRate < 45 ||
          item.avgPnlPercent < 0
        )
    )
    .sort(
      (a, b) =>
        a.intelligenceScore -
        b.intelligenceScore
    )
    .slice(0, 10);

  const latest =
    records.length
      ? records
          .slice()
          .sort(
            (a, b) =>
              new Date(
                b.recordedAt ||
                  b.evaluatedAt ||
                  0
              ).getTime() -
              new Date(
                a.recordedAt ||
                  a.evaluatedAt ||
                  0
              ).getTime()
          )[0]
      : null;

  return {
    success: true,

    generatedAt:
      new Date().toISOString(),

    sampleSize:
      records.length,

    reliability:
      reliability(records.length),

    overall:
      learning.overall,

    bySymbol,
    byDirection,
    byAIProvider,
    byRisk,
    byEngineScore,
    byConfidence,

    strongestPatterns,
    warningPatterns,

    latestPattern: latest
      ? {
          symbol: latest.symbol,
          direction: latest.direction,
          result: latest.result,
          pnlPercent: round(latest.pnlPercent),
          engineScore: round(latest.engineScore),
          confidence: round(latest.confidence),
          aiProvider: latest.aiProvider,
          risk: latest.risk,
          recordedAt: latest.recordedAt
        }
      : null,

    learningPolicy: {
      mode: "OBSERVE_ONLY",
      automaticSignalOverride: false,
      minimumSamples: 30
    }
  };
}
