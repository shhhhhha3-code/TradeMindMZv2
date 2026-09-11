import { getPaperLearning } from "./paperLearning.js";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
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
    (sum, record) =>
      sum + num(record.pnlPercent),
    0,
  );

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    winRate: round(
      (wins.length / total) * 100,
    ),
    totalPnlPercent: round(totalPnl),
    avgPnlPercent: round(
      totalPnl / total,
    ),
  };
}

function confidenceBucket(value) {
  const n = num(value);

  if (n < 50) return "<50";
  if (n < 60) return "50-59";
  if (n < 70) return "60-69";
  if (n < 80) return "70-79";
  if (n < 90) return "80-89";
  return "90-100";
}

function aiConfidenceBucket(value) {
  const n = num(value);

  if (n < 50) return "<50";
  if (n < 60) return "50-59";
  if (n < 70) return "60-69";
  if (n < 80) return "70-79";
  if (n < 90) return "80-89";
  return "90-100";
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
      reliability:
        reliability(bucketRecords.length),
    }))
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }

      return b.totalPnlPercent -
        a.totalPnlPercent;
    });
}

function calibrationScore(group) {
  if (!group.total) {
    return 0;
  }

  const weight =
    group.total >= 30
      ? 1
      : group.total >= 15
        ? 0.75
        : group.total >= 5
          ? 0.4
          : 0;

  if (!weight) {
    return 0;
  }

  const winEdge =
    ((group.winRate - 50) / 10) *
    weight;

  const pnlEdge =
    Math.max(
      -10,
      Math.min(
        10,
        group.avgPnlPercent * 2,
      ),
    );

  return round(
    winEdge + pnlEdge,
  );
}

function enrich(groups) {
  return groups
    .map(group => ({
      ...group,
      calibrationScore:
        calibrationScore(group),
    }))
    .sort(
      (a, b) =>
        b.calibrationScore -
        a.calibrationScore,
    );
}

function confidenceGap(expected, actual) {
  return round(
    actual - expected,
  );
}

export function getConfidenceCalibrationV6() {
  const learning = getPaperLearning({
    limit: 5000,
  });

  const records =
    Array.isArray(learning.history)
      ? learning.history
      : [];

  const confidenceGroups = enrich(
    groupBy(
      records,
      record =>
        confidenceBucket(
          record.confidence,
        ),
    ),
  );

  const aiConfidenceGroups = enrich(
    groupBy(
      records,
      record =>
        aiConfidenceBucket(
          record.aiConfidence,
        ),
    ),
  );

  const providerGroups = enrich(
    groupBy(
      records,
      record =>
        String(
          record.aiProvider ||
            "UNKNOWN",
        ).toUpperCase(),
    ),
  );

  const highConfidenceRecords =
    records.filter(
      record =>
        num(record.confidence) >= 90,
    );

  const highConfidenceSummary =
    summarize(
      highConfidenceRecords,
    );

  const aiHighConfidenceRecords =
    records.filter(
      record =>
        num(record.aiConfidence) >= 90,
    );

  const aiHighConfidenceSummary =
    summarize(
      aiHighConfidenceRecords,
    );

  const overall =
    summarize(records);

  const confidenceCalibration = {
    expectedConfidence: 0,
    actualWinRate: overall.winRate,
    gap: 0,
    interpretation:
      "INSUFFICIENT_DATA",
  };

  if (records.length >= 5) {
    const expectedAverage =
      records.reduce(
        (sum, record) =>
          sum + num(record.confidence),
        0,
      ) / records.length;

    const actualWinRate =
      overall.winRate;

    const gap =
      confidenceGap(
        expectedAverage,
        actualWinRate,
      );

    let interpretation =
      "UNDER_REVIEW";

    if (Math.abs(gap) <= 10) {
      interpretation =
        "WELL_CALIBRATED";
    } else if (gap > 10) {
      interpretation =
        "OVERCONFIDENT";
    } else if (gap < -10) {
      interpretation =
        "UNDERCONFIDENT";
    }

    confidenceCalibration.expectedConfidence =
      round(expectedAverage);

    confidenceCalibration.actualWinRate =
      actualWinRate;

    confidenceCalibration.gap =
      gap;

    confidenceCalibration.interpretation =
      interpretation;
  }

  const strongestConfidenceBands =
    confidenceGroups
      .filter(
        group =>
          group.total >= 5 &&
          group.winRate >= 55 &&
          group.avgPnlPercent > 0,
      )
      .slice(0, 10);

  const weakestConfidenceBands =
    confidenceGroups
      .filter(
        group =>
          group.total >= 5 &&
          (
            group.winRate < 45 ||
            group.avgPnlPercent < 0
          ),
      )
      .sort(
        (a, b) =>
          a.calibrationScore -
          b.calibrationScore,
      )
      .slice(0, 10);

  return {
    success: true,

    generatedAt:
      new Date().toISOString(),

    sampleSize:
      records.length,

    reliability:
      reliability(records.length),

    overall,

    confidenceGroups,

    aiConfidenceGroups,

    providerGroups,

    confidenceCalibration,

    highConfidence: {
      engineConfidence:
        highConfidenceSummary,
      aiConfidence:
        aiHighConfidenceSummary,
    },

    strongestConfidenceBands,

    weakestConfidenceBands,

    policy: {
      mode: "OBSERVE_ONLY",
      automaticSignalOverride: false,
      automaticTradeExecution: false,
      minimumSamples: 30,
      minimumCalibrationSamples: 5,
      maxAdjustment: 10,
    },
  };
}
