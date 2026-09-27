import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRiskReward,
  findSnapshotCandidate,
  buildAuthoritativeMarketSnapshot,
  normalizeMarketType,
} from "../../src/positions/marketSnapshot.js";

test("normalizes market type and preserves explicit SPOT/PERP", () => {
  assert.equal(normalizeMarketType("SPOT", "BTCUSDT"), "SPOT");
  assert.equal(normalizeMarketType("PERP", "BTCUSDT"), "PERP");
  assert.equal(normalizeMarketType(null, "TAOUSDT_PERP"), "PERP");
});

test("calculates directional risk/reward consistently", () => {
  assert.equal(calculateRiskReward(100, 95, 110, "BUY"), 2);
  assert.equal(calculateRiskReward(100, 105, 90, "SELL"), 2);
  assert.equal(calculateRiskReward(100, 105, 110, "SELL"), null);
});

test("selects the candidate from the same snapshot", () => {
  const snapshot = {
    marketType: "PERP",
    updatedAt: "2026-09-27T08:00:00.000Z",
    candidates: [
      { symbol: "BTCUSDT_PERP", engineScore: 82 },
      { symbol: "TAOUSDT_PERP", engineScore: 78 },
    ],
  };

  assert.equal(
    findSnapshotCandidate(snapshot, "TAOUSDT_PERP")?.engineScore,
    78
  );
});

test("authoritative position snapshot prefers current Engine candidate values", () => {
  const snapshot = {
    marketType: "PERP",
    contractType: "USDT-M PERPETUAL",
    updatedAt: "2026-09-27T08:00:00.000Z",
    snapshotId: "snapshot-1",
    candidates: [
      {
        symbol: "TAOUSDT_PERP",
        direction: "BUY",
        engineScore: 78,
        confidence: 98,
        riskReward: 2.4,
        rsi: 63.1,
        volumeRatio: 0.86,
        risk: { level: "MEDIUM" },
        decision: "TRADE",
      },
    ],
  };

  const result = buildAuthoritativeMarketSnapshot({
    position: {
      symbol: "TAOUSDT_PERP",
      side: "LONG",
      engineScore: 74,
      marketConfidence: 85,
      marketRiskReward: 1,
    },
    candidate: snapshot.candidates[0],
    snapshot,
  });

  assert.equal(result.engineScore, 78);
  assert.equal(result.confidence, 98);
  assert.equal(result.riskReward, 2.4);
  assert.equal(result.rsi, 63.1);
  assert.equal(result.volumeRatio, 0.86);
  assert.equal(result.marketType, "PERP");
  assert.equal(result.decision, "TRADE");
  assert.equal(result.snapshotId, "snapshot-1");
});
