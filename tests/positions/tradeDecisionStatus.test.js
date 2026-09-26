import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEntryEligibility,
  getPositionStatus,
  buildPositionDecisionSummary,
} from "../../src/positions/tradeDecisionStatus.js";

test("Build 5.4 marks low RR as entry-ineligible without forcing position exit", () => {
  const entry = evaluateEntryEligibility({
    engineScore: 78,
    confidence: 96,
    riskReward: 1,
    rsi: 66,
    volumeRatio: 0.92,
    riskLevel: "MEDIUM",
  });

  assert.equal(entry.status, "NOT_ELIGIBLE");
  assert.deepEqual(entry.failedChecks.map(item => item.key), ["riskReward"]);

  const position = getPositionStatus({
    recommendation: "HOLD",
    riskLevel: "MEDIUM",
    confidence: 70,
    analyzedAt: new Date().toISOString(),
  });

  assert.equal(position.key, "HOLD");
  assert.equal(position.label, "HOLD");
});

test("Build 5.4 exposes reduce-risk as a position action", () => {
  const position = getPositionStatus({
    recommendation: "REDUCE_RISK",
    riskLevel: "HIGH",
    confidence: 58,
    analyzedAt: new Date().toISOString(),
  });

  assert.equal(position.key, "REDUCE_RISK");
  assert.equal(position.label, "REDUCE RISK");
});

test("Build 5.4 summary keeps entry eligibility and position status separate", () => {
  const summary = buildPositionDecisionSummary({
    analysis: {
      recommendation: "HOLD",
      riskLevel: "MEDIUM",
      confidence: 70,
      analyzedAt: new Date().toISOString(),
    },
    market: {
      engineScore: 78,
      confidence: 96,
      riskReward: 1,
      rsi: 66,
      volumeRatio: 0.92,
      riskLevel: "MEDIUM",
    },
  });

  assert.equal(summary.positionStatus.key, "HOLD");
  assert.equal(summary.entryStatus.status, "NOT_ELIGIBLE");
  assert.equal(summary.riskAction, "HOLD");
});
