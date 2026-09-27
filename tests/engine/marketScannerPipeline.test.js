import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { runTradeMindEngine } from "../../engine/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const scannerPath = resolve(
  here,
  "../../server/pionex/marketScanner.js"
);

test("Engine can rank a candidate outside the scanner's former preselected TOP 5", () => {
  const markets = Array.from({ length: 6 }, (_, index) => ({
    symbol: `MARKET${index + 1}USDT`,
    score: 70 + index,
    confidence: 85,
    change24h: 1,
    rsi: 55,
    volumeRatio: 1,
    riskReward: 2.5,
    direction: "BUY",
    price: 100,
  }));

  const engineResult = runTradeMindEngine(markets, { limit: 5 });

  assert.equal(engineResult.scanned, 6);
  assert.equal(engineResult.top5.length, 5);
  assert.equal(engineResult.top5[0].symbol, "MARKET6USDT");
});

test("Current scanner pipeline sends the full candidate set into Engine V2", async () => {
  const source = await readFile(scannerPath, "utf8");

  assert.ok(
    source.includes('runTradeMindEngineV2'),
    "Expected scanner to use TradeMind Engine V2"
  );
  assert.ok(
    source.includes("runTradeMindEngineV2(\n    candidates"),
    "Expected scanner to pass the full candidates array into Engine V2"
  );
  assert.equal(
    source.includes("const topFive ="),
    false,
    "Scanner must not preselect a final TOP 5 before Engine V2"
  );
  assert.equal(
    source.includes("runTradeMindEngine(\n    topFive"),
    false,
    "Scanner must not pass a scanner-selected TOP 5 into the Engine"
  );
});