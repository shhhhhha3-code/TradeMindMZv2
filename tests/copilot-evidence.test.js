import test from "node:test";
import assert from "node:assert/strict";
import { calculateCopilotEvidence } from "../server/ai/copilotEvidence.js";

function record(i, result, pnl, overrides = {}) {
  return {
    symbol: "BTC_USDT",
    direction: "BUY",
    result,
    pnlPercent: pnl,
    engineScore: 84,
    confidence: 86,
    rsi: 54,
    volumeRatio: 1.2,
    trend: "UP",
    momentum: "BULLISH",
    ...overrides,
    id: String(i),
  };
}

test("Copilot evidence stays neutral with insufficient history", () => {
  const candidate = record("candidate", "UNKNOWN", 0);
  const records = [
    record(1, "WIN", 1),
    record(2, "LOSS", -1),
    record(3, "WIN", 2),
  ];

  const evidence = calculateCopilotEvidence(candidate, records);

  assert.equal(evidence.available, false);
  assert.equal(evidence.adjustment, 0);
  assert.equal(evidence.reliability, "INSUFFICIENT");
});

test("Copilot evidence detects positive historical edge with shrinkage", () => {
  const candidate = record("candidate", "UNKNOWN", 0);
  const records = Array.from({ length: 30 }, (_, i) =>
    i < 24 ? record(i, "WIN", 1.2) : record(i, "LOSS", -0.6)
  );

  const evidence = calculateCopilotEvidence(candidate, records);

  assert.equal(evidence.available, true);
  assert.equal(evidence.sampleSize, 30);
  assert.ok(evidence.historicalWinRate > 70);
  assert.ok(evidence.adjustment > 0);
  assert.ok(evidence.adjustment <= 10);
});

test("Copilot evidence is isolated by symbol and direction", () => {
  const candidate = record("candidate", "UNKNOWN", 0);
  const records = Array.from({ length: 20 }, (_, i) =>
    i < 18 ? record(i, "WIN", 1) : record(i, "LOSS", -1)
  );
  records.push(...Array.from({ length: 40 }, (_, i) =>
    record(`eth-${i}`, i < 2 ? "WIN" : "LOSS", i < 2 ? 1 : -1, { symbol: "ETH_USDT" })
  ));

  const evidence = calculateCopilotEvidence(candidate, records);

  assert.equal(evidence.sampleSize, 20);
  assert.ok(evidence.adjustment > 0);
});
