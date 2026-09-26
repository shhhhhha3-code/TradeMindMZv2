import test from "node:test";
import assert from "node:assert/strict";

import {
  runTradeMindEngine,
} from "../../engine/index.js";

import {
  calculateEngineScore,
} from "../../engine/scoringEngine.js";

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
      score: 66,
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


test("Build 1 scoring is direction-symmetric for equivalent bullish and bearish setups", () => {
  const common = {
    price: 100,
    rsi: 55,
    volumeRatio: 1.2,
    riskReward: 2.5,
    change24h: 2,
    ema9: 102,
    ema21: 100,
    macd: 1.5,
    atrPct: 2,
  };

  const buyScore = calculateEngineScore({
    ...common,
    direction: "BUY",
  });

  const sellScore = calculateEngineScore({
    ...common,
    direction: "SELL",
    change24h: -2,
    ema9: 98,
    ema21: 100,
    macd: -1.5,
  });

  assert.equal(buyScore, sellScore);
});

test("Build 1 blocks candidates with missing critical market data", () => {
  const result = runTradeMindEngine([
    {
      symbol: "MISSINGUSDT",
      score: 95,
      confidence: 95,
      price: 100,
      direction: "BUY",
      rsi: null,
      volumeRatio: 1.2,
      riskReward: 2.5,
    },
  ]);

  assert.equal(
    result.decision,
    "NO_TRADE"
  );
  assert.ok(
    result.recommendation.reasons.includes(
      "INSUFFICIENT_MARKET_DATA"
    )
  );
});

test("Build 1 exposes regime and technical quality fields", () => {
  const result = runTradeMindEngine([
    {
      symbol: "REGIMEUSDT",
      price: 100,
      direction: "BUY",
      rsi: 55,
      volumeRatio: 1.3,
      riskReward: 2.8,
      change24h: 2,
      ema9: 103,
      ema21: 100,
      macd: 1.2,
      atr: 1.8,
      atrPct: 1.8,
    },
  ]);

  const candidate = result.top5[0];

  assert.equal(candidate.regime, "TRENDING");
  assert.equal(candidate.ema9, 103);
  assert.equal(candidate.macd, 1.2);
  assert.equal(candidate.atrPct, 1.8);
  assert.equal(candidate.dataQuality.status, "GOOD");
});
