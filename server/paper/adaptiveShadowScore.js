import {
  getPaperLearning,
} from "./paperLearning.js";

function num(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

function round(
  value,
  digits = 2
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      (num(value) + Number.EPSILON) *
        factor
    ) / factor
  );
}

function reliabilityWeight(total) {
  if (total >= 30) return 1;
  if (total >= 15) return 0.75;
  if (total >= 5) return 0.4;

  return 0;
}

function stats(records) {
  if (!records.length) {
    return {
      total: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgPnl: 0,
    };
  }

  const wins =
    records.filter(
      (record) =>
        record.result === "WIN"
    );

  const losses =
    records.filter(
      (record) =>
        record.result === "LOSS"
    );

  const pnl =
    records.reduce(
      (sum, record) =>
        sum +
        num(record.pnlPercent),
      0
    );

  return {
    total:
      records.length,

    wins:
      wins.length,

    losses:
      losses.length,

    winRate:
      (wins.length /
        records.length) *
      100,

    avgPnl:
      pnl /
      records.length
  };
}

function adjustment(
  summary,
  maxPoints
) {
  if (
    !summary.total
  ) {
    return 0;
  }

  const weight =
    reliabilityWeight(
      summary.total
    );

  if (!weight) {
    return 0;
  }

  const winEdge =
    (summary.winRate - 50) /
    10;

  const pnlEdge =
    Math.max(
      -2,
      Math.min(
        2,
        summary.avgPnl
      )
    );

  return Math.max(
    -maxPoints,
    Math.min(
      maxPoints,
      (
        winEdge +
        pnlEdge
      ) *
      weight
    )
  );
}

function recordsFor(
  records,
  field,
  value
) {
  return records.filter(
    (record) =>
      String(
        record?.[field] || ""
      ).toUpperCase() ===
      String(value || "")
        .toUpperCase()
  );
}

export function calculateAdaptiveShadowScore(
  signal = {}
) {
  const learning =
    getPaperLearning({
      limit: 500
    });

  const records =
    Array.isArray(
      learning.history
    )
      ? learning.history
      : [];

  const symbol =
    signal.symbol || null;

  const direction =
    signal.direction || null;

  const aiProvider =
    signal.aiProvider ||
    signal.provider ||
    null;

  const risk =
    signal.risk ||
    signal.riskLevel ||
    null;

  const symbolSummary =
    stats(
      recordsFor(
        records,
        "symbol",
        symbol
      )
    );

  const directionSummary =
    stats(
      recordsFor(
        records,
        "direction",
        direction
      )
    );

  const aiSummary =
    stats(
      recordsFor(
        records,
        "aiProvider",
        aiProvider
      )
    );

  const riskSummary =
    stats(
      recordsFor(
        records,
        "risk",
        risk
      )
    );

  const overall =
    stats(records);

  const components = {
    symbol:
      round(
        adjustment(
          symbolSummary,
          4
        )
      ),

    direction:
      round(
        adjustment(
          directionSummary,
          3
        )
      ),

    aiProvider:
      round(
        adjustment(
          aiSummary,
          3
        )
      ),

    risk:
      round(
        adjustment(
          riskSummary,
          2
        )
      )
  };

  const rawAdjustment =
    Object.values(
      components
    ).reduce(
      (sum, value) =>
        sum + num(value),
      0
    );

  const boundedAdjustment =
    Math.max(
      -10,
      Math.min(
        10,
        rawAdjustment
      )
    );

  const engineScore =
    num(
      signal.engineScore ??
      signal.score
    );

  const shadowScore =
    engineScore
      ? round(
          Math.max(
            0,
            Math.min(
              100,
              engineScore +
                boundedAdjustment
            )
          )
        )
      : null;

  const sampleSize =
    records.length;

  let confidence =
    "INSUFFICIENT";

  if (sampleSize >= 30) {
    confidence = "STRONG";
  } else if (
    sampleSize >= 15
  ) {
    confidence = "MEDIUM";
  } else if (
    sampleSize >= 5
  ) {
    confidence = "EARLY";
  }

  return {
    success: true,

    mode:
      "OBSERVE_ONLY",

    automaticOverride:
      false,

    sampleSize,

    reliability:
      confidence,

    engineScore:
      engineScore || null,

    shadowAdjustment:
      round(
        boundedAdjustment
      ),

    shadowScore,

    components,

    evidence: {
      overall:
        {
          ...overall,
          winRate:
            round(
              overall.winRate
            ),
          avgPnl:
            round(
              overall.avgPnl
            )
        },

      symbol:
        symbolSummary.total
          ? {
              ...symbolSummary,
              winRate:
                round(
                  symbolSummary.winRate
                ),
              avgPnl:
                round(
                  symbolSummary.avgPnl
                )
            }
          : null,

      direction:
        directionSummary.total
          ? {
              ...directionSummary,
              winRate:
                round(
                  directionSummary.winRate
                ),
              avgPnl:
                round(
                  directionSummary.avgPnl
                )
            }
          : null,

      aiProvider:
        aiSummary.total
          ? {
              ...aiSummary,
              winRate:
                round(
                  aiSummary.winRate
                ),
              avgPnl:
                round(
                  aiSummary.avgPnl
                )
            }
          : null,

      risk:
        riskSummary.total
          ? {
              ...riskSummary,
              winRate:
                round(
                  riskSummary.winRate
                ),
              avgPnl:
                round(
                  riskSummary.avgPnl
                )
            }
          : null
    },

    policy: {
      minimumSamples:
        30,

      maxAdjustment:
        10,

      automaticSignalOverride:
        false,

      automaticTradeExecution:
        false
    }
  };
}

export function getAdaptiveShadowSummary() {
  const learning =
    getPaperLearning({
      limit: 500
    });

  const records =
    Array.isArray(
      learning.history
    )
      ? learning.history
      : [];

  return {
    success: true,

    mode:
      "OBSERVE_ONLY",

    sampleSize:
      records.length,

    reliability:
      reliabilityWeight(
        records.length
      ),

    automaticOverride:
      false,

    automaticExecution:
      false
  };
}
