import test from "node:test";
import assert from "node:assert/strict";
import { PARAMETER_BOUNDS, validateParameterProposal } from "../../server/ai/parameterOptimizer.js";

test("Build 5.1 keeps governed parameter bounds", () => {
  assert.equal(PARAMETER_BOUNDS.minimumScore.min, 70);
  assert.equal(PARAMETER_BOUNDS.minimumScore.max, 85);
  assert.equal(PARAMETER_BOUNDS.minimumRiskReward.min, 1.8);
  assert.equal(PARAMETER_BOUNDS.minimumRiskReward.max, 3);
});

test("Build 5.1 rejects unsafe proposal changes", () => {
  const result = validateParameterProposal({
    minimumScore: 50,
    minimumConfidence: 60,
    minimumRiskReward: 1,
    minimumRsi: 10,
    maximumRsi: 90,
    minimumVolumeRatio: 0.2,
    highRiskMinimumScore: 70,
    highRiskMinimumConfidence: 70,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((x) => x.startsWith("CHANGE_TOO_LARGE_")));
});

test("Build 5.3 exposes performance guardrails", async () => {
  const mod = await import("../../server/ai/parameterOptimizer.js");
  const status = mod.getParameterOptimizerStatus();
  assert.equal(status.policy.minProfitFactor, 1);
  assert.equal(status.policy.maxDrawdownPct, 15);
  assert.equal(status.policy.minHoldoutEligibleSamples, 5);
  assert.equal(status.policy.maxEligibleTradeCountDropPct, 50);
});

test("Build 5.2 exposes regime-aware validation policy", async () => {
  const mod = await import("../../server/ai/parameterOptimizer.js");
  const status = mod.getParameterOptimizerStatus();
  assert.equal(status.policy.rollingWindows, 3);
  assert.equal(status.policy.minRegimeSamples, 10);
  assert.equal(status.policy.automaticPromotion, false);
});

test("Build 5.1 accepts a bounded proposal", () => {
  const result = validateParameterProposal({
    minimumScore: 76,
    minimumConfidence: 81,
    minimumRiskReward: 2.05,
    minimumRsi: 34,
    maximumRsi: 71,
    minimumVolumeRatio: 0.85,
    highRiskMinimumScore: 86,
    highRiskMinimumConfidence: 91,
  });
  assert.equal(result.valid, true);
});
