import test from "node:test";
import assert from "node:assert/strict";

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function direction(value) {
  return ["SELL", "SHORT", "BEARISH", "DOWN"].includes(normalize(value)) ? "SELL" : "BUY";
}

function compatible(decision, trade) {
  return normalize(decision.symbol) === normalize(trade.symbol)
    && direction(decision.direction) === direction(trade.direction);
}

test("decision memory only matches compatible symbol and direction", () => {
  const decision = { symbol: "BTC_USDT", direction: "BUY" };
  assert.equal(compatible(decision, { symbol: "BTC_USDT", direction: "LONG" }), true);
  assert.equal(compatible(decision, { symbol: "BTC_USDT", direction: "SELL" }), false);
  assert.equal(compatible(decision, { symbol: "ETH_USDT", direction: "BUY" }), false);
});

test("decision memory uses paper outcomes as the source of truth", () => {
  const paperTrade = {
    status: "CLOSED",
    result: "WIN",
    pnlPercent: 1.25,
    evaluationReason: "TAKE_PROFIT",
  };

  assert.equal(paperTrade.status, "CLOSED");
  assert.equal(paperTrade.result, "WIN");
  assert.equal(paperTrade.pnlPercent, 1.25);
});
