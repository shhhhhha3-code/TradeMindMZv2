import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL =
  process.env.TEST_BASE_URL ||
  "http://127.0.0.1:3001";

async function getJson(path) {
  const response = await fetch(
    `${BASE_URL}${path}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  const text = await response.text();

  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `${path} returned non-JSON response: ${text.slice(0, 300)}`,
    );
  }

  return {
    response,
    body,
  };
}

test("health endpoint is online", async () => {
  const { response, body } =
    await getJson("/api/health");

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.equal(body?.status, "ONLINE");
  assert.equal(body?.pionex, "READ_ONLY");
  assert.equal(body?.trading, false);
});

test("paper trades endpoint returns JSON", async () => {
  const { response, body } =
    await getJson("/api/paper/trades");

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.ok(Array.isArray(body?.trades));
});

test("paper learning endpoint returns JSON", async () => {
  const { response, body } =
    await getJson("/api/paper/learning");

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.ok(
    Number.isFinite(
      Number(body?.totalRecords),
    ),
  );
});

test("adaptive learning V4 is available", async () => {
  const { response, body } =
    await getJson(
      "/api/paper/learning/adaptive-v4",
    );

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.equal(
    body?.policy?.mode,
    "OBSERVE_ONLY",
  );
  assert.equal(
    body?.policy?.automaticSignalOverride,
    false,
  );
  assert.equal(
    body?.policy?.automaticTradeExecution,
    false,
  );
});

test("adaptive learning V5 is available", async () => {
  const { response, body } =
    await getJson(
      "/api/paper/learning/adaptive-v5",
    );

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.ok(body?.feedback);
  assert.equal(
    body?.policy?.mode,
    "OBSERVE_ONLY",
  );
});

test("confidence calibration V6 is available", async () => {
  const { response, body } =
    await getJson(
      "/api/paper/learning/confidence-v6",
    );

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.ok(
    body?.confidenceCalibration,
  );
  assert.equal(
    body?.policy?.mode,
    "OBSERVE_ONLY",
  );
});

test("pattern intelligence is available", async () => {
  const { response, body } =
    await getJson(
      "/api/paper/learning/patterns",
    );

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.ok(
    "strongestPatterns" in body,
  );
  assert.ok(
    "warningPatterns" in body,
  );
});

test("diagnostics endpoint is available", async () => {
  const { response, body } =
    await getJson("/api/diagnostics");

  assert.equal(response.status, 200);
  assert.equal(body?.success, true);
  assert.ok(
    Array.isArray(body?.checks),
  );

  for (const check of body.checks) {
    assert.ok(
      ["OK", "CONFIGURED"].includes(
        check?.status,
      ),
      `Diagnostic check failed: ${check?.name}`,
    );
  }
});

test("Pionex route remains read-only", async () => {
  const { response, body } =
    await getJson(
      "/api/pionex/live-positions",
    );

  assert.equal(response.status, 200);
  assert.equal(body?.source, "PIONEX");
});

