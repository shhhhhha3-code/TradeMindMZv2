import { getPaperLearning } from "./paperLearning.js";

const MIN_TOTAL_SAMPLES = 50;
const MIN_GROUP_SAMPLES = 20;
const MAX_TOTAL_ADJUSTMENT = 5;
const MAX_GROUP_ADJUSTMENT = 3;
const RECENT_WINDOW = 100;
const HOLDOUT_WINDOW = 25;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function resultOf(record) {
  const result = normalize(record?.result);
  if (result === "WIN" || result === "LOSS" || result === "FLAT") {
    return result;
  }
  return "UNKNOWN";
}

function summary(records) {
  const usable = records.filter((record) => resultOf(record) !== "UNKNOWN");

  if (!usable.length) {
    return {
      total: 0,
      wins: 0,
      losses: 0,
      flats: 0,
      winRate: 0,
      avgPnl: 0,
    };
  }

  const wins = usable.filter((record) => resultOf(record) === "WIN");
  const losses = usable.filter((record) => resultOf(record) === "LOSS");
  const pnl = usable.reduce(
    (sum, record) => sum + num(record?.pnlPercent),
    0
  );

  return {
    total: usable.length,
    wins: wins.length,
    losses: losses.length,
    flats: usable.length - wins.length - losses.length,
    winRate: (wins.length / usable.length) * 100,
    avgPnl: pnl / usable.length,
  };
}

function reliability(total) {
  if (total >= MIN_TOTAL_SAMPLES) return "STRONG";
  if (total >= MIN_GROUP_SAMPLES) return "MEDIUM";
  if (total >= 5) return "EARLY";
  return "INSUFFICIENT";
}

function boundedAdjustment(stats, maxAdjustment) {
  if (stats.total < MIN_GROUP_SAMPLES) {
    return 0;
  }

  const winEdge = (stats.winRate - 50) / 10;
  const pnlEdge = Math.max(-1.5, Math.min(1.5, stats.avgPnl));

  const raw = (winEdge + pnlEdge) * 0.5;

  return Math.max(
    -maxAdjustment,
    Math.min(maxAdjustment, raw)
  );
}

function group(records, selector) {
  const map = new Map();

  for (const record of records) {
    const key = selector(record);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }

  return map;
}

function featureStats(records, signal) {
  const direction = normalize(signal?.direction);
  const risk = normalize(signal?.risk);
  const regime = normalize(signal?.regime);
  const confirmation = normalize(
    signal?.multiTimeframe?.confirmation ??
    signal?.mtfConfirmation
  );

  const groups = {
    direction: group(records, (r) => normalize(r?.direction)),
    risk: group(records, (r) => normalize(r?.risk)),
    regime: group(records, (r) => normalize(r?.regime)),
    confirmation: group(records, (r) =>
      normalize(
        r?.mtfConfirmation ??
        r?.multiTimeframe?.confirmation
      )
    ),
  };

  return {
    direction: {
      key: direction,
      stats: summary(groups.direction.get(direction) ?? []),
    },
    risk: {
      key: risk,
      stats: summary(groups.risk.get(risk) ?? []),
    },
    regime: {
      key: regime,
      stats: summary(groups.regime.get(regime) ?? []),
    },
    confirmation: {
      key: confirmation,
      stats: summary(groups.confirmation.get(confirmation) ?? []),
    },
  };
}

function calculate(signal, records) {
  const overall = summary(records);

  if (overall.total < MIN_TOTAL_SAMPLES) {
    return {
      eligible: false,
      reason: "MINIMUM_LEARNING_SAMPLE_NOT_REACHED",
      adjustment: 0,
      components: {},
    };
  }

  const features = featureStats(records, signal);

  const components = {
    direction: boundedAdjustment(
      features.direction.stats,
      MAX_GROUP_ADJUSTMENT
    ),
    risk: boundedAdjustment(
      features.risk.stats,
      MAX_GROUP_ADJUSTMENT
    ),
    regime: boundedAdjustment(
      features.regime.stats,
      MAX_GROUP_ADJUSTMENT
    ),
    confirmation: boundedAdjustment(
      features.confirmation.stats,
      MAX_GROUP_ADJUSTMENT
    ),
  };

  const recent = records.slice(0, RECENT_WINDOW);
  const recentStats = summary(recent);

  const recentEdge =
    recentStats.total >= MIN_GROUP_SAMPLES
      ? Math.max(
          -2,
          Math.min(
            2,
            ((recentStats.winRate - 50) / 10) * 0.5 +
              recentStats.avgPnl * 0.25
          )
        )
      : 0;

  const raw =
    Object.values(components).reduce(
      (sum, value) => sum + value,
      0
    ) + recentEdge;

  const adjustment = Math.max(
    -MAX_TOTAL_ADJUSTMENT,
    Math.min(MAX_TOTAL_ADJUSTMENT, raw)
  );

  return {
    eligible: true,
    reason: "LEARNING_SAMPLE_THRESHOLD_REACHED",
    adjustment: round(adjustment),
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [
        key,
        round(value),
      ])
    ),
    recentAdjustment: round(recentEdge),
    features,
  };
}

export function getAdaptiveLearningV7(signal = {}) {
  const learning = getPaperLearning({ limit: 5000 });
  const records = Array.isArray(learning.history)
    ? learning.history
    : [];

  const calculation = calculate(signal, records);

  const engineScore = num(
    signal?.engineScore ?? signal?.score,
    null
  );

  const shadowScore =
    engineScore === null
      ? null
      : round(
          Math.max(
            0,
            Math.min(
              100,
              engineScore + calculation.adjustment
            )
          )
        );

  const holdout = records.slice(
    HOLDOUT_WINDOW
  );
  const holdoutStats = summary(holdout);

  return {
    success: true,
    version: "V7",
    mode: "SHADOW",
    sampleSize: records.length,
    reliability: reliability(records.length),
    eligibleForPromotion: records.length >= MIN_TOTAL_SAMPLES,
    engineScore,
    shadowScore,
    shadowAdjustment: calculation.adjustment,
    reason: calculation.reason,
    components: calculation.components,
    recentAdjustment: calculation.recentAdjustment ?? 0,
    holdout: {
      sampleSize: holdoutStats.total,
      winRate: round(holdoutStats.winRate),
      avgPnl: round(holdoutStats.avgPnl),
      reliability: reliability(holdoutStats.total),
    },
    policy: {
      minimumSamples: MIN_TOTAL_SAMPLES,
      minimumGroupSamples: MIN_GROUP_SAMPLES,
      recentWindow: RECENT_WINDOW,
      holdoutWindow: HOLDOUT_WINDOW,
      maxTotalAdjustment: MAX_TOTAL_ADJUSTMENT,
      maxGroupAdjustment: MAX_GROUP_ADJUSTMENT,
      automaticSignalOverride: false,
      automaticTradeExecution: false,
      promotionRequired: true,
    },
  };
}

export function getAdaptiveLearningPolicy() {
  return {
    version: "V7",
    mode: "SHADOW",
    minimumSamples: MIN_TOTAL_SAMPLES,
    minimumGroupSamples: MIN_GROUP_SAMPLES,
    maxTotalAdjustment: MAX_TOTAL_ADJUSTMENT,
    automaticSignalOverride: false,
    automaticTradeExecution: false,
    promotionRequired: true,
  };
}
