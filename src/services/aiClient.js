import {
  assertAIAccess,
} from "../ai/aiGateway";

const AI_SERVER_URL =
  import.meta.env.VITE_AI_SERVER_URL ||
  "";

export async function requestAIAnalysis({
  symbol,
  price,
  marketData = {},
  historicalEvidence = {},
}) {
  const access = assertAIAccess();

  /*
   * HARD FRONTEND GATE
   *
   * If AI is disabled locally, no request is
   * sent to the AI server.
   */
  if (!access.allowed) {
    return {
      success: false,
      status: "AI_DISABLED",
      signal: null,
      providers: [],
      error: access.reason,
    };
  }

  const response = await fetch(
    `${AI_SERVER_URL}/api/ai/analyze`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol,
        price,
        marketData,
        historicalEvidence,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `AI server request failed: ${response.status}`
    );
  }

  return response.json();
}
