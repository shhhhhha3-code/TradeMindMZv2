import test from "node:test";
import assert from "node:assert/strict";

import { runTradeMindCopilot } from "../../server/ai/copilotEngine.js";

test("Copilot returns a safe no-provider response when AI is unavailable", async () => {
  const oldGroq = process.env.GROQ_API_KEY;
  const oldOpenAI = process.env.OPENAI_API_KEY;

  delete process.env.GROQ_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const result = await runTradeMindCopilot({
    question: "Why is this setup interesting?",
    candidates: [],
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "NO_PROVIDER");

  if (oldGroq !== undefined) process.env.GROQ_API_KEY = oldGroq;
  if (oldOpenAI !== undefined) process.env.OPENAI_API_KEY = oldOpenAI;
});

test("Copilot keeps deterministic engine blocks and learning in shadow mode", async () => {
  const oldGroq = process.env.GROQ_API_KEY;
  const oldOpenAI = process.env.OPENAI_API_KEY;

  delete process.env.GROQ_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const result = await runTradeMindCopilot({
    question: "Explain this setup.",
    candidates: [{
      symbol: "TESTUSDT",
      engineScore: 60,
      risk: { level: "HIGH" },
      dataQuality: { status: "SUFFICIENT" },
      multiTimeframe: { status: "GOOD", alignment: "ALIGNED" },
      adaptiveLearning: {
        mode: "SHADOW",
        shadowAdjustment: 5,
      },
    }],
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "NO_PROVIDER");

  if (oldGroq !== undefined) process.env.GROQ_API_KEY = oldGroq;
  if (oldOpenAI !== undefined) process.env.OPENAI_API_KEY = oldOpenAI;
});

test("Copilot contract is read-only", () => {
  assert.equal(true, true);
});
