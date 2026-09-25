import test from "node:test";
import assert from "node:assert/strict";
import {
  getConfidenceCalibration,
  discoverPatterns,
  calculateIntelligence,
} from "../server/ai/copilotIntelligence.js";

function record(i, result, confidence, overrides = {}) {
  return {
    id: String(i),
    symbol: "BTC_USDT",
    direction: "BUY",
    result,
    pnlPercent: result === "WIN" ? 1.2 : -0.7,
    engineScore: 84,
    confidence,
    rsi: 54,
    volumeRatio: 1.2,
    trend: "UP",
    momentum: "BULLISH",
    ...overrides,
  };
}

test("confidence calibration measures predicted versus realized win rate", () => {
  const records = Array.from({ length: 20 }, (_, i) =>
    record(i, i < 15 ? "WIN" : "LOSS", 80),
  );

  const calibration = getConfidenceCalibration(records);

  assert.equal(calibration.overall.sampleSize, 20);
  assert.equal(calibration.overall.predictedConfidence, 80);
  assert.equal(calibration.overall.actualWinRate, 75);
  assert.equal(calibration.overall.calibrationError, -5);
  assert.ok(calibration.overall.brierScore >= 0);
});

test("pattern discovery finds repeated high-confluence outcomes", () => {
  const records = Array.from({ length: 30 }, (_, i) =>
    record(i, i < 24 ? "WIN" : "LOSS", 86),
  );

  const candidate = record("candidate", "UNKNOWN", 86);
  const patterns = discoverPatterns(records, candidate);

  assert.equal(patterns.candidateMatch.sampleSize, 30);
  assert.equal(patterns.candidateMatch.winRate, 80);
  assert.ok(patterns.topPatterns.length > 0);
});

test("intelligence adjustment is bounded and advisory", () => {
  const records = Array.from({ length: 40 }, (_, i) =>
    record(i, i < 32 ? "WIN" : "LOSS", 86),
  );

  const result = calculateIntelligence(
    records,
    record("candidate", "UNKNOWN", 86),
    86,
  );

  assert.ok(result.adjustment <= 6);
  assert.ok(result.adjustment >= -6);
  assert.ok(result.calibratedConfidence <= 100);
  assert.equal(result.policy.mode, "ADVISORY_ONLY");
});
