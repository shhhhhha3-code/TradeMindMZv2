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

function bucket(value, ranges) {
  const n = num(value);

  for (const range of ranges) {
    if (n >= range.min && n < range.max) {
      return range.name;
    }
  }

  return ranges[ranges.length - 1]?.name || "UNKNOWN";
}

function rsiBucket(value) {
  return bucket(value, [
    { name: "<30", min: -Infinity, max: 30 },
    { name: "30-39", min: 30, max: 40 },
    { name: "40-49", min: 40, max: 50 },
    { name: "50-59", min: 50, max: 60 },
    { name: "60-69", min: 60, max: 70 },
    { name: "70+", min: 70, max: Infinity },
  ]);
}

function volumeBucket(value) {
  return bucket(value, [
    { name: "<0.8", min: -Infinity, max: 0.8 },
    { name: "0.8-1.0", min: 0.8, max: 1.0 },
    { name: "1.0-1.2", min: 1.0, max: 1.2 },
    { name: "1.2-1.5", min: 1.2, max: 1.5 },
    { name: "1.5+", min: 1.5, max: Infinity },
  ]);
}

function scoreBucket(value) {
  return bucket(value, [
    { name: "<60", min: -Infinity, max: 60 },
    { name: "60-69", min: 60, max: 70 },
    { name: "70-79", min: 70, max: 80 },
    { name: "80-89", min: 80, max: 90 },
    { name: "90+", min: 90, max: Infinity },
  ]);
}

function confidenceBucket(value) {
  return bucket(value, [
    { name: "<70", min: -Infinity, max: 70 },
    { name: "70-79", min: 70, max: 80 },
    { name: "80-89", min: 80, max: 90 },
    { name: "90+", min: 90, max: Infinity },
  ]);
}

function momentumKey(value) {
  const text = normalize(value);

  if (text.includes("STRONG")) return "STRONG";
  if (text.includes("WEAK")) return "WEAK";
  if (text.includes("BULL")) return "BULLISH";
  if (text.includes("BEAR")) return "BEARISH";

  return text || "UNKNOWN";
}

function trendKey(value) {
  const text = normalize(value);

  if (text.includes("STRONG")) return "STRONG";
  if (text.includes("WEAK")) return "WEAK";
  if (text.includes("UP") || text.includes("BULL")) return "UP";
  if (text.includes("DOWN") || text.includes("BEAR")) return "DOWN";

  return text || "UNKNOWN";
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

  const wins = records.filter(r => r.result === "WIN");
  const losses = records.filter(r => r.result === "LOSS");
  const flats = records.filter(r => r.result === "FLAT");

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

function reliability(total) {
  if (total >= 30) return "STRONG";
  if (total >= 15) return "MEDIUM";
  if (total >= 5) return "EARLY";
  return "INSUFFICIENT";
}

function makeGroups(records, keyFn) {
  const map = new Map();

  for (const record of records) {
    const key = keyFn(record);

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

function comboKey(record) {
  return [
    normalize(record.direction),
    rsiBucket(record.rsi),
    volumeBucket(record.volumeRatio),
    scoreBucket(record.engineScore),
    confidenceBucket(record.confidence),
    trendKey(record.trend),
    momentumKey(record.momentum),
  ].join(" | ");
}

function scorePattern(summary) {
  if (!summary.total) return 0;

  const reliabilityWeight =
    summary.total >= 30
      ? 1
      : summary.total >= 15
        ? 0.75
        : summary.total >= 5
          ? 0.4
          : 0;

  if (!reliabilityWeight) return 0;

  const winComponent =
    ((summary.winRate - 50) / 10) * reliabilityWeight;

  const pnlComponent =
    Math.max(-10, Math.min(10, summary.avgPnlPercent * 2));

  return round(winComponent + pnlComponent);
}

function enrich(groups) {
  return groups
    .map(group => ({
      ...group,
      intelligenceScore: scorePattern(group),
    }))
    .sort((a, b) => b.intelligenceScore - a.intelligenceScore);
}

export function getAdaptiveLearningV4() {
  const learning = getPaperLearning({
    limit: 5000,
  });

  const records = Array.isArray(learning.history)
    ? learning.history
    : [];

  const combinations = enrich(
    makeGroups(records, comboKey),
  );

  const reliableCombinations = combinations.filter(
    item => item.total >= 5,
  );

  const strongestCombinations = reliableCombinations
    .filter(item => item.winRate >= 55 && item.avgPnlPercent > 0)
    .slice(0, 10);

  const warningCombinations = reliableCombinations
    .filter(item => item.winRate < 45 || item.avgPnlPercent < 0)
    .sort((a, b) => a.intelligenceScore - b.intelligenceScore)
    .slice(0, 10);

  const newest = records.length
    ? records
        .slice()
        .sort(
          (a, b) =>
            new Date(
              b.recordedAt || b.evaluatedAt || 0,
            ).getTime() -
            new Date(
              a.recordedAt || a.evaluatedAt || 0,
            ).getTime(),
        )[0]
    : null;

  return {
    success: true,

    generatedAt: new Date().toISOString(),

    sampleSize: records.length,

    reliability: reliability(records.length),

    combinations,

    strongestCombinations,

    warningCombinations,

    latestSample: newest
      ? {
          symbol: newest.symbol,
          direction: newest.direction,
          result: newest.result,
          pnlPercent: round(newest.pnlPercent),
          engineScore: round(newest.engineScore),
          confidence: round(newest.confidence),
          rsi: round(newest.rsi),
          volumeRatio: round(newest.volumeRatio),
          trend: newest.trend,
          momentum: newest.momentum,
          aiProvider: newest.aiProvider,
          risk: newest.risk,
          recordedAt: newest.recordedAt,
        }
      : null,

    policy: {
      mode: "OBSERVE_ONLY",
      automaticSignalOverride: false,
      automaticTradeExecution: false,
      minimumSamples: 30,
      minimumPatternSamples: 5,
    },
  };
}
