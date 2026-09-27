import { getPaperLearning } from "../paper/paperLearning.js";

const MIN_GROUP_SAMPLE = 5;
const STRONG_GROUP_SAMPLE = 30;
const MAX_ADJUSTMENT = 10;
const PRIOR_STRENGTH = 10;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function bucket(value, ranges, fallback = "UNKNOWN") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  for (const range of ranges) {
    if (n >= range.min && n < range.max) return range.name;
  }
  return ranges[ranges.length - 1]?.name ?? fallback;
}

function engineBucket(value) {
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

function direction(value) {
  const v = normalize(value);
  if (v === "SELL" || v === "SHORT" || v === "BEARISH" || v === "DOWN") return "SELL";
  return "BUY";
}

function trendKey(value) {
  const v = normalize(value);
  if (v.includes("DOWN") || v.includes("BEAR")) return "DOWN";
  if (v.includes("UP") || v.includes("BULL")) return "UP";
  if (v.includes("STRONG")) return "STRONG";
  if (v.includes("WEAK")) return "WEAK";
  return v || "UNKNOWN";
}

function momentumKey(value) {
  const v = normalize(value);
  if (v.includes("BEAR") || v.includes("DOWN")) return "BEARISH";
  if (v.includes("BULL") || v.includes("UP")) return "BULLISH";
  if (v.includes("STRONG")) return "STRONG";
  if (v.includes("WEAK")) return "WEAK";
  return v || "UNKNOWN";
}

function summarize(records) {
  const total = records.length;
  const wins = records.filter(r => normalize(r.result) === "WIN").length;
  const losses = records.filter(r => normalize(r.result) === "LOSS").length;
  const pnl = records.reduce((sum, r) => sum + num(r.pnlPercent), 0);

  return {
    sampleSize: total,
    wins,
    losses,
    flats: Math.max(0, total - wins - losses),
    winRate: total ? round((wins / total) * 100) : 0,
    averageReturnPct: total ? round(pnl / total) : 0,
    totalReturnPct: round(pnl),
  };
}

function reliability(sampleSize) {
  if (sampleSize >= STRONG_GROUP_SAMPLE) return "STRONG";
  if (sampleSize >= 15) return "MEDIUM";
  if (sampleSize >= MIN_GROUP_SAMPLE) return "EARLY";
  return "INSUFFICIENT";
}

function posteriorWinRate(records) {
  const wins = records.filter(r => normalize(r.result) === "WIN").length;
  return ((wins + PRIOR_STRENGTH * 0.5) / (records.length + PRIOR_STRENGTH)) * 100;
}

function evidenceAdjustment(records) {
  if (records.length < MIN_GROUP_SAMPLE) return 0;

  const posterior = posteriorWinRate(records);
  const sampleWeight = Math.min(1, records.length / STRONG_GROUP_SAMPLE);
  const edge = (posterior - 50) / 5;
  const pnlEdge = Math.max(-2, Math.min(2, summarize(records).averageReturnPct * 2));

  return round(Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, (edge + pnlEdge) * sampleWeight)));
}

function matches(record, candidate) {
  return normalize(record.symbol) === normalize(candidate?.symbol)
    && direction(record.direction) === direction(candidate?.direction ?? candidate?.trend);
}

function makeEvidenceGroup(name, records) {
  const summary = summarize(records);
  return {
    name,
    ...summary,
    posteriorWinRate: round(posteriorWinRate(records)),
    adjustment: evidenceAdjustment(records),
    reliability: reliability(records.length),
  };
}

function buildGroups(records, candidate) {
  const matching = records.filter(r => matches(r, candidate));

  const groups = [];

  const add = (name, rows) => {
    if (rows.length >= MIN_GROUP_SAMPLE) {
      groups.push(makeEvidenceGroup(name, rows));
    }
  };

  add("symbol_direction", matching);

  add("engine_score", matching.filter(r =>
    engineBucket(r.engineScore) === engineBucket(candidate.engineScore)
  ));

  add("confidence", matching.filter(r =>
    confidenceBucket(r.confidence) === confidenceBucket(candidate.confidence)
  ));

  add("rsi", matching.filter(r =>
    rsiBucket(r.rsi) === rsiBucket(candidate.rsi)
  ));

  add("volume", matching.filter(r =>
    volumeBucket(r.volumeRatio) === volumeBucket(candidate.volumeRatio)
  ));

  const candidateTrend = trendKey(candidate.trend);
  if (candidateTrend !== "UNKNOWN") {
    add("trend", matching.filter(r => trendKey(r.trend) === candidateTrend));
  }

  const candidateMomentum = momentumKey(candidate.momentum);
  if (candidateMomentum !== "UNKNOWN") {
    add("momentum", matching.filter(r => momentumKey(r.momentum) === candidateMomentum));
  }

  const composite = matching.filter(r =>
    engineBucket(r.engineScore) === engineBucket(candidate.engineScore)
    && confidenceBucket(r.confidence) === confidenceBucket(candidate.confidence)
    && rsiBucket(r.rsi) === rsiBucket(candidate.rsi)
    && volumeBucket(r.volumeRatio) === volumeBucket(candidate.volumeRatio)
  );

  add("multi_factor", composite);

  return groups;
}

export function calculateCopilotEvidence(candidate, records = []) {
  const safeRecords = Array.isArray(records) ? records : [];
  if (!candidate) {
    return {
      available: false,
      sampleSize: 0,
      reliability: "INSUFFICIENT",
      historicalWinRate: 0,
      averageReturnPct: 0,
      adjustment: 0,
      groups: [],
      policy: policy(),
    };
  }

  const matching = safeRecords.filter(r => matches(r, candidate));
  const groups = buildGroups(safeRecords, candidate);

  if (!matching.length) {
    return {
      available: false,
      sampleSize: 0,
      reliability: "INSUFFICIENT",
      historicalWinRate: 0,
      averageReturnPct: 0,
      adjustment: 0,
      groups,
      policy: policy(),
    };
  }

  const base = makeEvidenceGroup("symbol_direction", matching);
  const usable = groups.filter(g => g.name !== "symbol_direction" || g.sampleSize >= MIN_GROUP_SAMPLE);
  const weighted = usable.length
    ? usable.reduce((sum, g) => sum + g.adjustment * Math.min(1, g.sampleSize / STRONG_GROUP_SAMPLE), 0)
      / usable.reduce((sum, g) => sum + Math.min(1, g.sampleSize / STRONG_GROUP_SAMPLE), 0)
    : 0;

  const adjustment = round(Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, weighted)));

  return {
    available: matching.length >= MIN_GROUP_SAMPLE,
    sampleSize: matching.length,
    reliability: reliability(matching.length),
    historicalWinRate: base.winRate,
    posteriorWinRate: base.posteriorWinRate,
    averageReturnPct: base.averageReturnPct,
    adjustment,
    groups,
    policy: policy(),
  };
}

function policy() {
  return {
    mode: "ADVISORY_ONLY",
    minimumSamples: MIN_GROUP_SAMPLE,
    strongEvidenceSamples: STRONG_GROUP_SAMPLE,
    priorStrength: PRIOR_STRENGTH,
    maxAdjustment: MAX_ADJUSTMENT,
    hardEngineGatesRemainActive: true,
    liveTrading: false,
  };
}

export function getCopilotEvidence({ limit = 5000, candidate = null } = {}) {
  const learning = getPaperLearning({ limit });
  const records = Array.isArray(learning.history) ? learning.history : [];

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    sampleSize: records.length,
    candidate: candidate ? calculateCopilotEvidence(candidate, records) : null,
    overall: learning.overall,
    policy: policy(),
  };
}
