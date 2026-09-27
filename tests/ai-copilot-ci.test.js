import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL =
  process.env.TEST_BASE_URL ||
  "http://127.0.0.1:3001";

async function getJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `${path} returned non-JSON response: ${text.slice(0, 300)}`,
    );
  }

  return { response, body };
}

test("health exposes the AI Copilot", async () => {
  const { response, body } = await getJson("/api/health");

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.equal(body?.status, "ONLINE");
  assert.equal(body?.copilot, true);
  assert.equal(body?.pionex, "READ_ONLY");
  assert.equal(body?.trading, false);
});

test("Copilot handles an empty market set safely", async () => {
  const { response, body } = await getJson("/api/ai/copilot", {
    method: "POST",
    body: JSON.stringify({
      markets: [],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.equal(body?.action, "NO_TRADE");
  assert.equal(body?.execution, "READ_ONLY");
  assert.equal(body?.symbol, null);
  assert.equal(body?.ai?.decision, "NO_TRADE");
});

test("Copilot position review detects a supplied stop threat", async () => {
  const { response, body } = await getJson("/api/ai/copilot", {
    method: "POST",
    body: JSON.stringify({
      markets: [],
      position: {
        symbol: "BTC_USDT",
        side: "LONG",
        entryPrice: 100,
        currentPrice: 95,
        stopLoss: 95,
      },
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.equal(body?.execution, "READ_ONLY");
  assert.equal(body?.positionReview?.stopThreat, true);
  assert.equal(body?.positionReview?.action, "PROTECT");
});
