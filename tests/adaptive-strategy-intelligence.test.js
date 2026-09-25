import test from "node:test";
import assert from "node:assert/strict";
import { calculateAdaptiveStrategy } from "../server/ai/adaptiveStrategyIntelligence.js";

function row(i, result, overrides = {}) {
  return {
    symbol: "BTC_USDT",
    direction: "BUY",
    regime: "BULLISH",
    risk: "LOW",
    confidence: 86,
    factor_pass_count: 6,
    strategy_signature: "BULLISH|LOW|BUY|80-89|6+",
    outcome_status: result,
    outcome_return_pct: result === "WIN" ? 1.5 : -0.8,
    ...overrides,
    id: i,
  };
}

test("adaptive strategy stays neutral with insufficient evidence", () => {
  const records = Array.from({ length: 7 }, (_, i) => row(i, "WIN"));
  const result = calculateAdaptiveStrategy(records, {
    symbol: "BTC_USDT",
    direction: "BUY",
    regime: "BULLISH",
    risk: "LOW",
    confidence: 86,
    factorPassCount: 6,
  });
  assert.equal(result.adjustment, 0);
});

test("adaptive strategy detects a repeated high-confluence setup", () => {
  const records = Array.from({ length: 30 }, (_, i) =>
    row(i, i < 24 ? "WIN" : "LOSS"),
  );
  const result = calculateAdaptiveStrategy(records, {
    symbol: "BTC_USDT",
    direction: "BUY",
    regime: "BULLISH",
    risk: "LOW",
    confidence: 86,
    factorPassCount: 6,
  });
  assert.equal(result.scopedProfile.sampleSize, 30);
  assert.ok(result.scopedProfile.posteriorWinRate > 65);
  assert.ok(result.adjustment > 0);
  assert.ok(result.adjustment <= 5);
});

test("adaptive strategy never exceeds advisory bounds", () => {
  const records = Array.from({ length: 200 }, (_, i) => row(i, "WIN"));
  const result = calculateAdaptiveStrategy(records, {
    symbol: "BTC_USDT",
    direction: "BUY",
    regime: "BULLISH",
    risk: "LOW",
    confidence: 86,
    factorPassCount: 6,
  });
  assert.ok(result.adjustment <= 5);
  assert.ok(result.adjustment >= -5);
  assert.equal(result.policy.mode, "ADVISORY_ONLY");
});
