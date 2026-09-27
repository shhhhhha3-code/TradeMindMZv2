import test from "node:test";
import assert from "node:assert/strict";
import {
  recordSignalCandidates,
  updateMarketBehavior,
  getMarketBehaviorRecords,
  resetMarketBehavior,
} from "../../server/paper/marketBehaviorLearning.js";

test("Build 5.6 does not fabricate an early checkpoint from a late observation", () => {
  resetMarketBehavior();
  const now = Date.now();

  recordSignalCandidates([{
    symbol: "TEST_USDT_PERP",
    marketType: "PERP",
    direction: "BUY",
    entry: 100,
    stopLoss: 98,
    takeProfit: 104,
    engineScore: 80,
    confidence: 85,
    riskReward: 2,
    rsi: 55,
    volumeRatio: 1,
    regime: "TRENDING",
    multiTimeframe: { alignment: "ALIGNED", confirmation: "STRONG" },
  }], {}, now);

  updateMarketBehavior({
    prices: { TEST_USDT_PERP: 103 },
    at: now + 3 * 60_000,
  });

  const record = getMarketBehaviorRecords()[0];
  assert.deepEqual(record.checkpoints.map(item => item.minutes), [3]);
  assert.equal(record.observations.length, 1);
  assert.equal(record.checkpoints[0].returnPct, 3);

  resetMarketBehavior();
});

test("Build 5.6 records market type in behavior journal", () => {
  resetMarketBehavior();
  const now = Date.now();

  recordSignalCandidates([{
    symbol: "TEST_USDT",
    marketType: "SPOT",
    direction: "BUY",
    entry: 100,
    engineScore: 80,
    confidence: 85,
    riskReward: 2,
    rsi: 55,
    volumeRatio: 1,
    regime: "RANGING",
  }], {}, now);

  assert.equal(getMarketBehaviorRecords()[0].marketType, "SPOT");
  resetMarketBehavior();
});
