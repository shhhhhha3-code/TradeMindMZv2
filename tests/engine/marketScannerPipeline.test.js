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

test("Engine can rank a candidate outside the scanner's preselected TOP 5", () => {
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

test("Current scanner pipeline sends only its preselected topFive into the Engine", async () => {
  const source = await readFile(scannerPath, "utf8");

  const topFiveDeclaration = source.indexOf("const topFive =");
  const engineCall = source.indexOf(
    "runTradeMindEngine(\n    topFive"
  );

  assert.ok(
    topFiveDeclaration >= 0,
    "Expected scanner TOP 5 declaration"
  );
  assert.ok(
    engineCall >= 0,
    "Expected scanner to pass topFive into TradeMind Engine"
  );
  assert.ok(
    topFiveDeclaration < engineCall,
    "Expected scanner to select TOP 5 before calling the Engine"
  );
});
