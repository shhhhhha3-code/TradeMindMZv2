import test from "node:test";
import assert from "node:assert/strict";

import {
  runTradeMindEngine,
} from "../../engine/index.js";

function market({
  symbol,
  score,
  confidence = 85,
  change24h = 1,
  rsi = 55,
  volumeRatio = 1,
  riskReward = 2.5,
  direction = "BUY",
} = {}) {
  return {
    symbol,
    score,
    confidence,
    change24h,
    rsi,
    volumeRatio,
    riskReward,
    direction,
    price: 100,
  };
}

test("TradeMind Engine ranks candidates by engineScore across the full input set", () => {
  const markets = [
    market({ symbol: "AAAUSDT", score: 70 }),
    market({ symbol: "BBBUSDT", score: 72 }),
    market({ symbol: "CCCUSDT", score: 74 }),
    market({ symbol: "DDDUSDT", score: 76 }),
    market({ symbol: "EEEUSDT", score: 78 }),
    market({
      symbol: "ZZZUSDT",
      score: 95,
      change24h: -2,
      direction: "BUY",
    }),
  ];

  const result = runTradeMindEngine(markets, { limit: 5 });

  assert.equal(result.scanned, 6);
  assert.equal(result.top5.length, 5);
  assert.equal(result.top5[0].symbol, "EEEUSDT");
  assert.ok(!result.top5.some((candidate) => candidate.symbol === "AAAUSDT"));
  assert.ok(!result.top5.some((candidate) => candidate.symbol === "ZZZUSDT"));
});

test("TradeMind Engine returns a TRADE decision for a fully qualifying candidate", () => {
  const result = runTradeMindEngine([
    market({
      symbol: "TRADEUSDT",
      score: 90,
      confidence: 90,
      change24h: 1.5,
      rsi: 60,
      volumeRatio: 1.2,
      riskReward: 2.5,
    }),
  ]);

  assert.equal(result.decision, "TRADE");
  assert.equal(result.recommendation.symbol, "TRADEUSDT");
  assert.deepEqual(result.recommendation.reasons, []);
});

test("TradeMind Engine exposes WATCH when score is in the watch range", () => {
  const result = runTradeMindEngine([
    market({
      symbol: "WATCHUSDT",
      score: 65,
      confidence: null,
      change24h: 0,
      rsi: 55,
      volumeRatio: 1,
      riskReward: 2,
    }),
  ]);

  assert.equal(result.decision, "WATCH");
  assert.equal(result.recommendation.symbol, "WATCHUSDT");
  assert.ok(
    result.recommendation.reasons.includes(
      "ENGINE_SCORE_BELOW_MINIMUM"
    )
  );
});

test("TradeMind Engine returns INSUFFICIENT_DATA for an empty market set", () => {
  const result = runTradeMindEngine([]);

  assert.equal(result.scanned, 0);
  assert.equal(result.top5.length, 0);
  assert.equal(result.decision, "INSUFFICIENT_DATA");
  assert.equal(result.recommendation, null);
});
