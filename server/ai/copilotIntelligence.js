const MIN_PATTERN_SAMPLE = 5;
const CALIBRATION_MIN_SAMPLE = 10;
const STRONG_SAMPLE = 30;
const MAX_INTELLIGENCE_ADJUSTMENT = 6;

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

function bucket(value, ranges) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "UNKNOWN";
  return ranges.find(r => n >= r.min && n < r.max)?.name ?? "UNKNOWN";
}

export function engineScoreBucket(value) {
  return bucket(value, [
    { name: "<60", min: -Infinity, max: 60 },
    { name: "60-69", min: 60, max: 70 },
    { name: "70-79", min: 70, max: 80 },
    { name: "80-89", min: 80, max: 90 },
    { name: "90+", min: 90, max: Infinity },
  ]);
}

export function confidenceBucket(value) {
  return bucket(value, [
    { name: "<70", min: -Infinity, max: 70 },
    { name: "70-79", min: 70, max: 80 },
    { name: "80-89", min: 80, max: 90 },
    { name: "90+", min: 90, max: Infinity },
  ]);
}

export function rsiBucket(value) {
  return bucket(value, [
    { name: "<30", min: -Infinity, max: 30 },
    { name: "30-39", min: 30, max: 40 },
    { name: "40-49", min: 40, max: 50 },
    { name: "50-59", min: 50, max: 60 },
    { name: "60-69", min: 60, max: 70 },
    { name: "70+", min: 70, max: Infinity },
  ]);
}

export function volumeBucket(value) {
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
  if (["SELL", "SHORT", "BEARISH", "DOWN"].includes(v)) return "SELL";
  return "BUY";
}

function trend(value) {
  const v = normalize(value);
  if (v.includes("DOWN") || v.includes("BEAR")) return "DOWN";
  if (v.includes("UP") || v.includes("BULL")) return "UP";
  return v || "UNKNOWN";
}

function momentum(value) {
  const v = normalize(value);
  if (v.includes("DOWN") || v.includes("BEAR")) return "BEARISH";
  if (v.includes("UP") || v.includes("BULL")) return "BULLISH";
  return v || "UNKNOWN";
}

function outcome(record) {
  const value = normalize(record?.result);
  if (value === "WIN") return 1;
  if (value === "LOSS") return 0;
  return null;
}

function summarize(records) {
  const usable = records.map(outcome).filter(v => v !== null);
  const wins = usable.reduce((sum, v) => sum + v, 0);
  const pnl = records.reduce((sum, r) => sum + num(r?.pnlPercent), 0);
  return {
    sampleSize: usable.length,
    wins,
    losses: usable.length - wins,
    winRate: usable.length ? round((wins / usable.length) * 100) : 0,
    averageReturnPct: records.length ? round(pnl / records.length) : 0,
  };
}

function calibrationForBucket(records) {
  const usable = records.filter(r => outcome(r) !== null);
  if (!usable.length) return null;

  const predicted = usable.reduce((sum, r) => sum + num(r.confidence, 50) / 100, 0) / usable.length;
  const actual = usable.reduce((sum, r) => sum + outcome(r), 0) / usable.length;

  const brier = usable.reduce((sum, r) => {
    const p = num(r.confidence, 50) / 100;
    return sum + ((p - outcome(r)) ** 2);
  }, 0) / usable.length;

  return {
    sampleSize: usable.length,
    predictedConfidence: round(predicted * 100),
    actualWinRate: round(actual * 100),
    calibrationError: round((actual - predicted) * 100),
    brierScore: round(brier, 4),
  };
}

export function getConfidenceCalibration(records = []) {
  const safe = Array.isArray(records) ? records : [];
  const buckets = ["<70", "70-79", "80-89", "90+"].map(name => {
    const rows = safe.filter(r => confidenceBucket(r.confidence) === name);
    const result = calibrationForBucket(rows);
    return {
      bucket: name,
      ...(result ?? {
        sampleSize: 0,
        predictedConfidence: 0,
        actualWinRate: 0,
        calibrationError: 0,
        brierScore: null,
      }),
      reliable: (result?.sampleSize ?? 0) >= CALIBRATION_MIN_SAMPLE,
    };
  });

  const overall = calibrationForBucket(safe);

  return {
    overall: overall ?? {
      sampleSize: 0,
      predictedConfidence: 0,
      actualWinRate: 0,
      calibrationError: 0,
      brierScore: null,
    },
    buckets,
    policy: {
      minimumSamples: CALIBRATION_MIN_SAMPLE,
      mode: "ADVISORY_ONLY",
      hardEngineGatesRemainActive: true,
    },
  };
}

function signature(record) {
  return [
    direction(record.direction),
    engineScoreBucket(record.engineScore),
    confidenceBucket(record.confidence),
    rsiBucket(record.rsi),
    volumeBucket(record.volumeRatio),
    trend(record.trend),
    momentum(record.momentum),
  ].join("|");
}

function candidateSignature(candidate) {
  return [
    direction(candidate?.direction ?? candidate?.trend),
    engineScoreBucket(candidate?.engineScore),
    confidenceBucket(candidate?.confidence),
    rsiBucket(candidate?.rsi),
    volumeBucket(candidate?.volumeRatio),
    trend(candidate?.trend),
    momentum(candidate?.momentum),
  ].join("|");
}

function patternSummary(rows, signatureValue) {
  const summary = summarize(rows);
  return {
    signature: signatureValue,
    ...summary,
    reliability:
      rows.length >= STRONG_SAMPLE
        ? "STRONG"
        : rows.length >= 15
          ? "MEDIUM"
          : rows.length >= MIN_PATTERN_SAMPLE
            ? "EARLY"
            : "INSUFFICIENT",
  };
}

export function discoverPatterns(records = [], candidate = null, limit = 8) {
  const safe = Array.isArray(records) ? records : [];
  const groups = new Map();

  for (const record of safe) {
    const key = signature(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const patterns = [...groups.entries()]
    .filter(([, rows]) => rows.length >= MIN_PATTERN_SAMPLE)
    .map(([key, rows]) => patternSummary(rows, key))
    .sort((a, b) =>
      (b.winRate - a.winRate) ||
      (b.averageReturnPct - a.averageReturnPct) ||
      (b.sampleSize - a.sampleSize)
    )
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)));

  const matching = candidate
    ? safe.filter(r => signature(r) === candidateSignature(candidate))
    : [];

  return {
    candidateMatch: candidate && matching.length >= MIN_PATTERN_SAMPLE
      ? patternSummary(matching, candidateSignature(candidate))
      : null,
    topPatterns: patterns,
    totalPatterns: groups.size,
  };
}

export function calculateIntelligence(records = [], candidate = null, rawConfidence = 0) {
  const safe = Array.isArray(records) ? records : [];
  const calibration = getConfidenceCalibration(safe);
  const patterns = discoverPatterns(safe, candidate);

  let calibrationAdjustment = 0;
  if (calibration.overall.sampleSize >= CALIBRATION_MIN_SAMPLE) {
    calibrationAdjustment = Math.max(
      -4,
      Math.min(4, calibration.overall.calibrationError / 2),
    );
  }

  let patternAdjustment = 0;
  const match = patterns.candidateMatch;
  if (match && match.sampleSize >= MIN_PATTERN_SAMPLE) {
    patternAdjustment = Math.max(
      -4,
      Math.min(4, (match.winRate - 50) / 12.5),
    );
  }

  const adjustment = round(
    Math.max(
      -MAX_INTELLIGENCE_ADJUSTMENT,
      Math.min(
        MAX_INTELLIGENCE_ADJUSTMENT,
        calibrationAdjustment + patternAdjustment,
      ),
    ),
  );

  const calibratedConfidence = Math.max(
    0,
    Math.min(100, num(rawConfidence) + adjustment),
  );

  return {
    available: safe.length >= CALIBRATION_MIN_SAMPLE,
    rawConfidence: round(rawConfidence),
    calibratedConfidence: round(calibratedConfidence),
    adjustment,
    calibrationAdjustment: round(calibrationAdjustment),
    patternAdjustment: round(patternAdjustment),
    calibration,
    patterns,
    policy: {
      mode: "ADVISORY_ONLY",
      minimumCalibrationSamples: CALIBRATION_MIN_SAMPLE,
      minimumPatternSamples: MIN_PATTERN_SAMPLE,
      strongSamples: STRONG_SAMPLE,
      maxAdjustment: MAX_INTELLIGENCE_ADJUSTMENT,
      hardEngineGatesRemainActive: true,
      liveTrading: false,
    },
  };
}

export function getCopilotIntelligence(records = [], limit = 8) {
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    sampleSize: Array.isArray(records) ? records.length : 0,
    calibration: getConfidenceCalibration(records),
    patterns: discoverPatterns(records, null, limit),
    policy: {
      mode: "ADVISORY_ONLY",
      hardEngineGatesRemainActive: true,
      liveTrading: false,
    },
  };
}
