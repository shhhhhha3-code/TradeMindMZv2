import test from "node:test";
import assert from "node:assert/strict";
import { getTradeCriteria, evaluateTradeCandidate } from "../../server/ai/tradeCriteria.js";

test("Build 5.6 uses the authoritative 75/80/2 default criteria", () => {
  const criteria = getTradeCriteria();
  assert.equal(criteria.minimumScore, 75);
  assert.equal(criteria.minimumConfidence, 80);
  assert.equal(criteria.minimumRiskReward, 2);
  assert.equal(criteria.minimumRsi, 35);
  assert.equal(criteria.maximumRsi, 70);
  assert.equal(criteria.minimumVolumeRatio, 0.8);
});

test("Build 5.6 criteria evaluator reads engineScore and blocks HIGH risk", () => {
  const result = evaluateTradeCandidate({
    engineScore: 75,
    confidence: 80,
    riskReward: 2,
    rsi: 55,
    volumeRatio: 1,
    entry: 100,
    stopLoss: 98,
    takeProfit: 104,
    direction: "BUY",
    risk: { level: "LOW" },
  });

  assert.equal(result.passed, true);

  const blocked = evaluateTradeCandidate({
    engineScore: 95,
    confidence: 99,
    riskReward: 3,
    rsi: 55,
    volumeRatio: 1.2,
    entry: 100,
    stopLoss: 98,
    takeProfit: 106,
    direction: "BUY",
    risk: { level: "HIGH" },
  });

  assert.equal(blocked.passed, false);
  assert.ok(blocked.failedChecks.some((check) => check.key === "highRisk"));
});
