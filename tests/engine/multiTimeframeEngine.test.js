import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMultiTimeframeSnapshot,
} from "../../engine/multiTimeframeEngine.js";

function timeframe({
  direction = "BUY",
  rsi = 55,
  macd = 1,
  ema9 = 102,
  ema21 = 100,
  atrPct = 1.5,
} = {}) {
  return {
    direction,
    rsi,
    macd,
    ema9,
    ema21,
    atrPct,
  };
}

test("Build 2 marks aligned 15M/60M/4H confirmation as strong", () => {
  const result = buildMultiTimeframeSnapshot({
    direction: "BUY",
    timeframes: {
      "15M": timeframe(),
      "60M": timeframe({ ema9: 104, ema21: 100 }),
      "4H": timeframe({ ema9: 108, ema21: 100 }),
    },
  });

  assert.equal(result.status, "GOOD");
  assert.equal(result.confirmation, "STRONG");
  assert.equal(result.alignment, "ALIGNED");
  assert.equal(result.confirmedTimeframes, 3);
  assert.equal(result.score, 100);
});

test("Build 2 detects higher-timeframe conflict", () => {
  const result = buildMultiTimeframeSnapshot({
    direction: "BUY",
    timeframes: {
      "15M": timeframe(),
      "60M": timeframe({ direction: "SELL", ema9: 98, ema21: 100, macd: -1 }),
      "4H": timeframe({ direction: "SELL", ema9: 97, ema21: 100, macd: -2 }),
    },
  });

  assert.equal(result.status, "GOOD");
  assert.equal(result.alignment, "CONFLICTING");
  assert.equal(result.confirmation, "CONFLICTING");
  assert.ok(result.score < 50);
});

test("Build 2 requires at least two quality timeframes", () => {
  const result = buildMultiTimeframeSnapshot({
    direction: "BUY",
    timeframes: {
      "15M": timeframe(),
      "60M": null,
      "4H": {
        direction: "BUY",
        rsi: null,
        macd: 1,
        ema9: 102,
        ema21: 100,
        atrPct: 1.5,
      },
    },
  });

  assert.equal(result.status, "INSUFFICIENT");
  assert.equal(result.confirmedTimeframes, 1);
});
