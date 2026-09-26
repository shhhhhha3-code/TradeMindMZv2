import test from "node:test";
import assert from "node:assert/strict";
import { PARAMETER_BOUNDS, validateParameterProposal } from "../../server/ai/parameterOptimizer.js";

test("Build 5 parameter bounds reject unsafe large changes", () => {
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

test("Build 5 parameter bounds expose governed ranges", () => {
  assert.deepEqual(PARAMETER_BOUNDS.minimumScore, { min: 70, max: 85, step: 1 });
  assert.deepEqual(PARAMETER_BOUNDS.minimumRiskReward, { min: 1.8, max: 3, step: 0.05 });
});

test("Build 5 validates a bounded proposal", () => {
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
  assert.equal(result.normalized.minimumScore, 76);
  assert.equal(result.normalized.minimumRiskReward, 2.05);
});
