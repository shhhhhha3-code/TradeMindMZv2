import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCandidate, ENGINE_DECISIONS } from "../../engine/decisionEngine.js";

const base = {
  engineScore: 75,
  confidence: 80,
  riskReward: 2,
  rsi: 55,
  volumeRatio: 1,
  risk: { level: "LOW" },
  dataQuality: { status: "GOOD" },
  multiTimeframe: { status: "GOOD", alignment: "ALIGNED" },
};

test("Build 5.6 accepts an exact minimum Engine score", () => {
  const result = evaluateCandidate(base);
  assert.equal(result.decision, ENGINE_DECISIONS.TRADE);
  assert.deepEqual(result.reasons, []);
});

test("Build 5.6 never trades when Engine score is missing", () => {
  const result = evaluateCandidate({ ...base, engineScore: undefined });
  assert.equal(result.decision, ENGINE_DECISIONS.NO_TRADE);
  assert.ok(result.reasons.includes("MISSING_ENGINE_SCORE"));
});

test("Build 5.6 never trades when critical technical data is missing", () => {
  const result = evaluateCandidate({ ...base, rsi: undefined });
  assert.equal(result.decision, ENGINE_DECISIONS.NO_TRADE);
  assert.ok(result.reasons.includes("MISSING_RSI"));
});

test("Build 5.6 keeps HIGH risk blocked", () => {
  const result = evaluateCandidate({
    ...base,
    risk: { level: "HIGH" },
    engineScore: 95,
    confidence: 99,
  });
  assert.equal(result.decision, ENGINE_DECISIONS.NO_TRADE);
  assert.ok(result.reasons.includes("HIGH_RISK"));
});
