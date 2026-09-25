const MIN_SAMPLE = 8;
const STRONG_SAMPLE = 30;
const MAX_ADJUSTMENT = 5;
const PRIOR_STRENGTH = 12;

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function confidenceBucket(value) {
  const n = num(value, 0);
  if (n < 70) return "<70";
  if (n < 80) return "70-79";
  if (n < 90) return "80-89";
  return "90+";
}

function factorPassBucket(value) {
  const n = num(value, 0);
  if (n <= 3) return "0-3";
  if (n <= 5) return "4-5";
  return "6+";
}

function posterior(records) {
  const wins = records.filter(r => normalize(r.outcome_status) === "WIN").length;
  return ((wins + PRIOR_STRENGTH * 0.5) / (records.length + PRIOR_STRENGTH)) * 100;
}

function averageReturn(records) {
  return records.length
    ? records.reduce((sum, r) => sum + num(r.outcome_return_pct), 0) / records.length
    : 0;
}

function group(records, selector) {
  const map = new Map();
  for (const record of records) {
    const key = String(selector(record) ?? "UNKNOWN");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return [...map.entries()]
    .filter(([, rows]) => rows.length >= MIN_SAMPLE)
    .map(([key, rows]) => ({
      key,
      sampleSize: rows.length,
      winRate: round((rows.filter(r => normalize(r.outcome_status) === "WIN").length / rows.length) * 100),
      posteriorWinRate: round(posterior(rows)),
      averageReturnPct: round(averageReturn(rows)),
      reliability: rows.length >= STRONG_SAMPLE ? "STRONG" : "EARLY",
    }))
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

function selectRows(records, candidate) {
  const symbol = normalize(candidate?.symbol);
  const regime = normalize(candidate?.regime);
  const risk = normalize(candidate?.risk?.level ?? candidate?.risk);
  const direction = normalize(candidate?.direction);

  return records.filter(row => {
    if (symbol && normalize(row.symbol) !== symbol) return false;
    if (regime && normalize(row.regime) !== regime) return false;
    if (risk && normalize(row.risk) !== risk) return false;
    if (direction && normalize(row.direction) !== direction) return false;
    return true;
  });
}

function weightedAdjustment(groups) {
  const usable = groups.filter(g => g.sampleSize >= MIN_SAMPLE);
  if (!usable.length) return 0;

  let numerator = 0;
  let denominator = 0;

  for (const g of usable) {
    const weight = Math.min(1, g.sampleSize / STRONG_SAMPLE);
    const edge = (g.posteriorWinRate - 50) / 10;
    const pnl = Math.max(-1.5, Math.min(1.5, g.averageReturnPct * 1.5));
    numerator += (edge + pnl) * weight;
    denominator += weight;
  }

  return denominator
    ? round(Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, numerator / denominator)))
    : 0;
}

function profile(name, rows) {
  const wins = rows.filter(r => normalize(r.outcome_status) === "WIN").length;
  return {
    name,
    sampleSize: rows.length,
    winRate: rows.length ? round((wins / rows.length) * 100) : 0,
    posteriorWinRate: round(posterior(rows)),
    averageReturnPct: round(averageReturn(rows)),
    reliability: rows.length >= STRONG_SAMPLE ? "STRONG" : rows.length >= MIN_SAMPLE ? "EARLY" : "INSUFFICIENT",
  };
}

export function calculateAdaptiveStrategy(records = [], candidate = {}) {
  const safe = Array.isArray(records)
    ? records.filter(r => ["WIN", "LOSS", "FLAT"].includes(normalize(r.outcome_status)))
    : [];

  const scoped = selectRows(safe, candidate);

  const regime = normalize(candidate.regime) || "UNKNOWN";
  const risk = normalize(candidate.risk?.level ?? candidate.risk) || "UNKNOWN";
  const symbol = normalize(candidate.symbol) || "UNKNOWN";
  const direction = normalize(candidate.direction) || "UNKNOWN";
  const confidence = confidenceBucket(candidate.confidence);
  const factorPasses = factorPassBucket(candidate.factorPassCount);

  const groups = [
    { type: "regime", rows: safe.filter(r => normalize(r.regime) === regime) },
    { type: "risk", rows: safe.filter(r => normalize(r.risk) === risk) },
    { type: "symbol", rows: safe.filter(r => normalize(r.symbol) === symbol) },
    { type: "direction", rows: safe.filter(r => normalize(r.direction) === direction) },
    { type: "confidence", rows: safe.filter(r => confidenceBucket(r.confidence) === confidence) },
    { type: "factor_passes", rows: safe.filter(r => factorPassBucket(r.factor_pass_count) === factorPasses) },
    { type: "regime_risk", rows: safe.filter(r => normalize(r.regime) === regime && normalize(r.risk) === risk) },
    { type: "regime_direction", rows: safe.filter(r => normalize(r.regime) === regime && normalize(r.direction) === direction) },
  ].map(g => ({ type: g.type, profile: profile(g.type, g.rows) }))
   .filter(g => g.profile.sampleSize >= MIN_SAMPLE);

  const adjustment = weightedAdjustment(groups.map(g => g.profile));

  return {
    available: scoped.length >= MIN_SAMPLE || groups.length > 0,
    sampleSize: scoped.length,
    scopedProfile: profile("candidate_scope", scoped),
    adjustment,
    groups,
    topRegimes: group(safe, r => r.regime).slice(0, 8),
    topRiskProfiles: group(safe, r => r.risk).slice(0, 8),
    topStrategies: group(safe, r => r.strategy_signature).slice(0, 10),
    policy: {
      mode: "ADVISORY_ONLY",
      minimumSamples: MIN_SAMPLE,
      strongSamples: STRONG_SAMPLE,
      priorStrength: PRIOR_STRENGTH,
      maxAdjustment: MAX_ADJUSTMENT,
      hardEngineGatesRemainActive: true,
      liveTrading: false,
    },
  };
}

export function getAdaptiveStrategySummary(records = [], limit = 10) {
  const safe = Array.isArray(records)
    ? records.filter(r => ["WIN", "LOSS", "FLAT"].includes(normalize(r.outcome_status)))
    : [];

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    sampleSize: safe.length,
    topRegimes: group(safe, r => r.regime).slice(0, 8),
    topRiskProfiles: group(safe, r => r.risk).slice(0, 8),
    topStrategies: group(safe, r => r.strategy_signature).slice(0, Math.min(20, Number(limit) || 10)),
    policy: {
      mode: "ADVISORY_ONLY",
      minimumSamples: MIN_SAMPLE,
      hardEngineGatesRemainActive: true,
      liveTrading: false,
    },
  };
}
