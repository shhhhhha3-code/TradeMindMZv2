const DEFAULT_CRITERIA = {
  minimumScore: 75,
  minimumConfidence: 80,
  minimumRiskReward: 2,
  minimumRsi: 35,
  maximumRsi: 70,
  minimumVolumeRatio: 0.8,
};

export const ENGINE_DECISIONS = {
  TRADE: "TRADE",
  WATCH: "WATCH",
  NO_TRADE: "NO_TRADE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
};

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function criteria() {
  const configured = globalThis.__tradeMindCriteria || {};
  const minimumRsi = finite(configured.minimumRsi) ?? DEFAULT_CRITERIA.minimumRsi;
  const maximumRsi = Math.max(
    minimumRsi,
    finite(configured.maximumRsi) ?? DEFAULT_CRITERIA.maximumRsi
  );

  return {
    minimumScore: Math.max(70, Math.min(85, Math.round(finite(configured.minimumScore) ?? DEFAULT_CRITERIA.minimumScore))),
    minimumConfidence: Math.max(75, Math.min(90, Math.round(finite(configured.minimumConfidence) ?? DEFAULT_CRITERIA.minimumConfidence))),
    minimumRiskReward: Math.max(1.8, Math.min(3, finite(configured.minimumRiskReward) ?? DEFAULT_CRITERIA.minimumRiskReward)),
    minimumRsi,
    maximumRsi,
    minimumVolumeRatio: Math.max(0.6, Math.min(1.2, finite(configured.minimumVolumeRatio) ?? DEFAULT_CRITERIA.minimumVolumeRatio)),
  };
}

export function evaluateCandidate(candidate) {
  if (!candidate) {
    return {
      decision: ENGINE_DECISIONS.INSUFFICIENT_DATA,
      reasons: ["NO_CANDIDATE"],
    };
  }

  const c = criteria();
  const reasons = [];

  const score = finite(candidate.engineScore ?? candidate.score);
  const confidence = finite(candidate.confidence);
  const rr = finite(candidate.riskReward);
  const rsi = finite(candidate.rsi ?? candidate.indicators?.rsi14);
  const volume = finite(candidate.volumeRatio ?? candidate.indicators?.volumeRatio);
  const risk = String(candidate.risk?.level ?? candidate.riskLevel ?? "").toUpperCase();

  if (candidate.dataQuality?.status === "INSUFFICIENT") reasons.push("INSUFFICIENT_MARKET_DATA");
  if (score === null) reasons.push("MISSING_ENGINE_SCORE");
  else if (score < c.minimumScore) reasons.push("ENGINE_SCORE_BELOW_MINIMUM");

  if (confidence === null) reasons.push("MISSING_CONFIDENCE");
  else if (confidence < c.minimumConfidence) reasons.push("CONFIDENCE_BELOW_MINIMUM");

  if (rr === null) reasons.push("MISSING_RISK_REWARD");
  else if (rr < c.minimumRiskReward) reasons.push("RISK_REWARD_BELOW_MINIMUM");

  if (rsi === null) reasons.push("MISSING_RSI");
  else if (rsi < c.minimumRsi || rsi > c.maximumRsi) reasons.push("RSI_OUTSIDE_TRADE_RANGE");

  if (volume === null) reasons.push("MISSING_VOLUME_RATIO");
  else if (volume < c.minimumVolumeRatio) reasons.push("VOLUME_BELOW_MINIMUM");

  if (risk === "HIGH") reasons.push("HIGH_RISK");

  const blocking = new Set([
    "INSUFFICIENT_MARKET_DATA",
    "MISSING_ENGINE_SCORE",
    "MISSING_CONFIDENCE",
    "MISSING_RISK_REWARD",
    "MISSING_RSI",
    "MISSING_VOLUME_RATIO",
    "HIGH_RISK",
  ]);

  if (!reasons.length) {
    return {
      decision: ENGINE_DECISIONS.TRADE,
      reasons: [],
    };
  }

  const canWatch =
    score !== null &&
    score >= c.minimumScore - 10 &&
    score < c.minimumScore &&
    !reasons.some((reason) => blocking.has(reason));

  return canWatch
    ? { decision: ENGINE_DECISIONS.WATCH, reasons }
    : { decision: ENGINE_DECISIONS.NO_TRADE, reasons };
}

export function evaluateCandidates(candidates = []) {
  const evaluated = candidates.map((candidate) => ({
    ...candidate,
    ...evaluateCandidate(candidate),
  }));

  const trade = evaluated.find(
    (candidate) => candidate.decision === ENGINE_DECISIONS.TRADE
  );

  return {
    candidates: evaluated,
    recommendation: trade ?? evaluated[0] ?? null,
    decision: trade
      ? ENGINE_DECISIONS.TRADE
      : evaluated.length
        ? evaluated[0].decision
        : ENGINE_DECISIONS.INSUFFICIENT_DATA,
  };
}
