import test from "node:test";
import assert from "node:assert/strict";
import {
  createPaperTrade,
  evaluatePaperTrade,
  resetPaperTrades,
} from "../../server/paper/paperTrading.js";
import {
  getPaperLearningWindows,
  resetPaperLearning,
  syncPaperLearning,
} from "../../server/paper/paperLearning.js";

test("paper learning exposes completed trades in 24h/7d/30d windows", async () => {
  resetPaperTrades();
  resetPaperLearning();

  const trade = createPaperTrade({
    candidate: {
      symbol: "TEST_USDT_PERP",
      direction: "BUY",
      entry: 100,
      stopLoss: 98,
      takeProfit: 104,
      engineScore: 86,
      confidence: 90,
      riskReward: 2,
      rsi: 55,
      volumeRatio: 1.1,
      regime: "TRENDING",
    },
  });

  const closed = evaluatePaperTrade(
    trade,
    104,
    Date.now(),
  );

  // Persist the evaluated trade through the normal learning sync path.
  // The paper trade file is updated by the evaluator/monitor in production;
  // this test writes the same closed representation explicitly.
  const original = getPaperTrades();
  original[0] = closed;
  const fs = await import("node:fs");
  fs.writeFileSync(PAPER_TRADES_FILE, JSON.stringify(original, null, 2), "utf8");

  const synced = syncPaperLearning();
  assert.equal(synced.added, 1);

  const windows = getPaperLearningWindows();
  assert.equal(windows.windows["24h"].trades, 1);
  assert.equal(windows.windows["7d"].trades, 1);
  assert.equal(windows.windows["30d"].trades, 1);
  assert.equal(windows.windows["24h"].wins, 1);

  resetPaperLearning();
  resetPaperTrades();
});
