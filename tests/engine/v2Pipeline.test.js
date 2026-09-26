import test from "node:test";
import assert from "node:assert/strict";

import {
  runTradeMindEngineV2,
} from "../../engine/v2Pipeline.js";

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

test("Engine V2 ranks the full candidate set without scanner preselection", () => {
  const markets = [
    market({ symbol: "AUSDT", score: 70 }),
    market({ symbol: "BUSDT", score: 72 }),
    market({ symbol: "CUSDT", score: 74 }),
    market({ symbol: "DUSDT", score: 76 }),
    market({ symbol: "EUSDT", score: 78 }),
    market({ symbol: "ZUSDT", score: 95, change24h: -2 }),
  ];

  const result = runTradeMindEngineV2(markets, { limit: 5 });

  assert.equal(result.pipeline.rankingAuthority, "TradeMindMZ Engine");
  assert.equal(result.pipeline.inputCandidates, 6);
  assert.equal(result.pipeline.finalLimit, 5);
  assert.equal(result.pipeline.scannerPreselection, false);
  assert.equal(result.top5.length, 5);
  assert.equal(result.top5[0].symbol, "EUSDT");
});

test("Engine V2 preserves the read-only safety boundary", () => {
  const result = runTradeMindEngineV2([
    market({ symbol: "SAFEUSDT", score: 90 }),
  ]);

  assert.equal(result.safety.readOnly, true);
  assert.equal(result.safety.automaticTrading, false);
  assert.equal(result.engine, "TradeMindMZ Engine V3 Multi-Timeframe");
});
