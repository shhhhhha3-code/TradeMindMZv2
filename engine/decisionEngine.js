import { getTradeCriteria } from "../server/ai/tradeCriteria.js";

export const ENGINE_DECISIONS = {
  TRADE: "TRADE",
  WATCH: "WATCH",
  NO_TRADE: "NO_TRADE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
};

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function evaluateCandidate(candidate) {
  if (!candidate) {
    return {
      decision: ENGINE_DECISIONS.INSUFFICIENT_DATA,
      reasons: ["NO_CANDIDATE"],
    };
  }

  const reasons = [];
  const criteria = getTradeCriteria();

  const score = finite(candidate.engineScore ?? candidate.score);
  const confidence = finite(candidate.confidence);
  const rr = finite(candidate.riskReward ?? candidate.risk?.riskReward);
  const rsi = finite(candidate.rsi ?? candidate.rsi14 ?? candidate.indicators?.rsi14);
  const volumeRatio = finite(candidate.volumeRatio ?? candidate.indicators?.volumeRatio);
  const riskLevel = String(candidate.risk?.level ?? candidate.riskLevel ?? "").toUpperCase();

  if (candidate.dataQuality?.status === "INSUFFICIENT") {
    reasons.push("INSUFFICIENT_MARKET_DATA");
  }
  if (candidate.multiTimeframe?.status === "INSUFFICIENT") {
    reasons.push("INSUFFICIENT_MTF_CONFIRMATION");
  }
  if (candidate.multiTimeframe?.alignment === "CONFLICTING") {
    reasons.push("HIGHER_TIMEFRAME_CONFLICT");
  }

  if (score === null) reasons.push("MISSING_ENGINE_SCORE");
  else if (score < criteria.minimumScore) reasons.push("ENGINE_SCORE_BELOW_MINIMUM");

  if (confidence === null) reasons.push("MISSING_CONFIDENCE");
  else if (confidence < criteria.minimumConfidence) reasons.push("CONFIDENCE_BELOW_MINIMUM");

  if (rr === null) reasons.push("MISSING_RISK_REWARD");
  else if (rr < criteria.minimumRiskReward) reasons.push("RISK_REWARD_BELOW_MINIMUM");

  if (rsi === null) reasons.push("MISSING_RSI");
  else if (rsi < criteria.minimumRsi || rsi > criteria.maximumRsi) reasons.push("RSI_OUTSIDE_TRADE_RANGE");

  if (volumeRatio === null) reasons.push("MISSING_VOLUME_RATIO");
  else if (volumeRatio < criteria.minimumVolumeRatio) reasons.push("VOLUME_BELOW_MINIMUM");

  if (riskLevel === "HIGH") reasons.push("HIGH_RISK");

  const blockingDataReasons = new Set([
    "INSUFFICIENT_MARKET_DATA",
    "INSUFFICIENT_MTF_CONFIRMATION",
    "HIGHER_TIMEFRAME_CONFLICT",
    "MISSING_ENGINE_SCORE",
    "MISSING_CONFIDENCE",
    "MISSING_RISK_REWARD",
    "MISSING_RSI",
    "MISSING_VOLUME_RATIO",
  ]);

  if (!reasons.length) {
    return {
      decision: ENGINE_DECISIONS.TRADE,
      reasons: [],
    };
  }

  const canWatch =
    score !== null &&
    score >= criteria.minimumScore - 10 &&
    score < criteria.minimumScore &&
    !reasons.some((reason) => blockingDataReasons.has(reason)) &&
    !reasons.includes("HIGH_RISK");

  if (canWatch) {
    return {
      decision: ENGINE_DECISIONS.WATCH,
      reasons,
    };
  }

  return {
    decision: ENGINE_DECISIONS.NO_TRADE,
    reasons,
  };
}

export function evaluateCandidates(candidates = []) {
  const evaluated = candidates.map((candidate) => ({
    ...candidate,
    ...evaluateCandidate(candidate),
  }));

  const trade = evaluated.find(
    (candidate) =>
      candidate.decision === ENGINE_DECISIONS.TRADE
  );

  return {
    candidates: evaluated,
    recommendation:
      trade ??
      evaluated[0] ??
      null,
    decision:
      trade
        ? ENGINE_DECISIONS.TRADE
        : evaluated.length
          ? evaluated[0].decision
          : ENGINE_DECISIONS.INSUFFICIENT_DATA,
  };
}
