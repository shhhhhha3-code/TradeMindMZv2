import test from "node:test";
import assert from "node:assert/strict";

import {
  getAdaptiveLearningV7,
  getAdaptiveLearningPolicy,
} from "../../server/paper/adaptiveLearningV7.js";

test("Build 3 starts in safe shadow mode", () => {
  const policy = getAdaptiveLearningPolicy();

  assert.equal(policy.version, "V7");
  assert.equal(policy.mode, "SHADOW");
  assert.equal(policy.minimumSamples, 50);
  assert.equal(policy.minimumGroupSamples, 20);
  assert.equal(policy.maxTotalAdjustment, 5);
  assert.equal(policy.automaticSignalOverride, false);
  assert.equal(policy.automaticTradeExecution, false);
});

test("Build 3 does not adapt before minimum learning sample", () => {
  const result = getAdaptiveLearningV7({
    symbol: "TESTUSDT",
    direction: "BUY",
    engineScore: 82,
    risk: "LOW",
    regime: "TRENDING",
    multiTimeframe: {
      confirmation: "STRONG",
    },
  });

  assert.equal(result.mode, "SHADOW");
  assert.equal(result.shadowAdjustment, 0);
  assert.equal(result.shadowScore, 82);
  assert.equal(result.eligibleForPromotion, false);
  assert.equal(
    result.reason,
    "MINIMUM_LEARNING_SAMPLE_NOT_REACHED"
  );
});
