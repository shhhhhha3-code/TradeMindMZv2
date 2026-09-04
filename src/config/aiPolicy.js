import {
  getAISettings,
  getEnabledProviders,
} from "../ai/aiSettings";

import {
  getAICostControl,
} from "./aiCostControl";

export function getAIAnalysisPolicy() {
  const ai = getAISettings();
  const cost = getAICostControl();

  return {
    enabled: ai.ai === true,

    providers: getEnabledProviders(),

    historicalLearning:
      ai.learning === true,

    maxCallsPerHour:
      cost.maxCallsPerHour,

    maxCallsPerDay:
      cost.maxCallsPerDay,

    cacheMinutes:
      cost.cacheMinutes,

    recommendedThreshold:
      cost.requireRecommendedThreshold,

    canAnalyze:
      ai.ai === true &&
      getEnabledProviders().length > 0,
  };
}

/**
 * Expensive AI analysis should only happen
 * when the signal has enough potential.
 */
export function shouldRunDeepAnalysis(score) {
  const policy = getAIAnalysisPolicy();

  if (!policy.canAnalyze) {
    return false;
  }

  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) {
    return false;
  }

  return (
    numericScore >=
    policy.recommendedThreshold
  );
}
