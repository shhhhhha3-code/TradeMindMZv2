import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKET_BEHAVIOR_POLICY,
  recordSignalCandidates,
  updateMarketBehavior,
  getMarketBehaviorRecords,
  resetMarketBehavior,
} from "../../server/paper/marketBehaviorLearning.js";

test("market behavior records signal path with MAE/MFE checkpoints", () => {
  resetMarketBehavior();
  const now = Date.now();

  const created = recordSignalCandidates([{
    symbol: "TEST_USDT_PERP",
    direction: "BUY",
    entry: 100,
    stopLoss: 98,
    takeProfit: 104,
    engineScore: 86,
    confidence: 90,
    riskReward: 2,
    rsi: 55,
    volumeRatio: 1.2,
    regime: "TRENDING",
    multiTimeframe: { alignment: "ALIGNED", confirmation: "STRONG" },
  }], {}, now);

  assert.equal(created.added, 1);
  assert.equal(getMarketBehaviorRecords().length, 1);

  updateMarketBehavior({
    prices: { TEST_USDT_PERP: 99 },
    at: now + 3 * 60_000,
  });

  updateMarketBehavior({
    prices: { TEST_USDT_PERP: 103 },
    at: now + 15 * 60_000,
  });

  const record = getMarketBehaviorRecords()[0];
  assert.deepEqual(
    record.checkpoints.map((item) => item.minutes),
    [3, 15]
  );
  assert.equal(record.maxAdversePct, -1);
  assert.equal(record.maxFavorablePct, 3);

  updateMarketBehavior({
    prices: { TEST_USDT_PERP: 102 },
    at: now + MARKET_BEHAVIOR_POLICY.horizonMinutes * 60_000,
  });

  const closed = getMarketBehaviorRecords()[0];
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.outcome, "FAVORABLE");
  assert.equal(closed.finalReturnPct, 2);

  resetMarketBehavior();
});

test("market behavior avoids duplicate active signals and respects direction", () => {
  resetMarketBehavior();
  const now = Date.now();

  const candidate = {
    symbol: "TEST_USDT_PERP",
    direction: "SELL",
    entry: 100,
    engineScore: 84,
    confidence: 88,
    regime: "RANGING",
  };

  assert.equal(recordSignalCandidates([candidate], {}, now).added, 1);
  assert.equal(recordSignalCandidates([candidate], {}, now + 60_000).added, 0);

  updateMarketBehavior({
    prices: { TEST_USDT_PERP: 98 },
    at: now + 5 * 60_000,
  });

  const record = getMarketBehaviorRecords()[0];
  assert.equal(record.maxFavorablePct, 2);

  resetMarketBehavior();
});
