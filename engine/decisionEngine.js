import { getTradeCriteria } from "../server/ai/tradeCriteria.js";

export const ENGINE_DECISIONS = {
  TRADE: "TRADE",
  WATCH: "WATCH",
  NO_TRADE: "NO_TRADE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
};

export function evaluateCandidate(candidate) {
  if (!candidate) return { decision: ENGINE_DECISIONS.INSUFFICIENT_DATA, reasons: ["NO_CANDIDATE"] };

  const reasons = [];
  const criteria = getTradeCriteria();

  if (candidate.dataQuality?.status === "INSUFFICIENT") reasons.push("INSUFFICIENT_MARKET_DATA");
  if (candidate.multiTimeframe?.status === "INSUFFICIENT") reasons.push("INSUFFICIENT_MTF_CONFIRMATION");
  if (candidate.multiTimeframe?.alignment === "CONFLICTING") reasons.push("HIGHER_TIMEFRAME_CONFLICT");

  if (candidate.engineScore < criteria.minimumScore) reasons.push("ENGINE_SCORE_BELOW_MINIMUM");
  if (candidate.confidence !== null && candidate.confidence < criteria.minimumConfidence) reasons.push("CONFIDENCE_BELOW_MINIMUM");
  if (candidate.riskReward !== null && candidate.riskReward < criteria.minimumRiskReward) reasons.push("RISK_REWARD_BELOW_MINIMUM");
  if (candidate.rsi !== null && (candidate.rsi < criteria.minimumRsi || candidate.rsi > criteria.maximumRsi)) reasons.push("RSI_OUTSIDE_TRADE_RANGE");
  if (candidate.volumeRatio !== null && candidate.volumeRatio < criteria.minimumVolumeRatio) reasons.push("VOLUME_BELOW_MINIMUM");
  if (candidate.risk?.level === "HIGH") reasons.push("HIGH_RISK");

  if (!reasons.length) return { decision: ENGINE_DECISIONS.TRADE, reasons: [] };

  if (
    candidate.engineScore >= criteria.minimumScore - 10 &&
    candidate.engineScore < criteria.minimumScore &&
    !reasons.includes("INSUFFICIENT_MARKET_DATA") &&
    !reasons.includes("INSUFFICIENT_MTF_CONFIRMATION") &&
    !reasons.includes("HIGHER_TIMEFRAME_CONFLICT")
  ) {
    return { decision: ENGINE_DECISIONS.WATCH, reasons };
  }

  return { decision: ENGINE_DECISIONS.NO_TRADE, reasons };
}

export function evaluateCandidates(candidates = []) {
  const evaluated = candidates.map((candidate) => ({ ...candidate, ...evaluateCandidate(candidate) }));
  const trade = evaluated.find((candidate) => candidate.decision === ENGINE_DECISIONS.TRADE);
  return {
    candidates: evaluated,
    recommendation: trade ?? evaluated[0] ?? null,
    decision: trade ? ENGINE_DECISIONS.TRADE : evaluated.length ? evaluated[0].decision : ENGINE_DECISIONS.INSUFFICIENT_DATA,
  };
}
