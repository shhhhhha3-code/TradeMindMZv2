import {
  assertAIAccess,
} from "../ai/aiGateway";

const AI_SERVER_URL =
  import.meta.env.VITE_AI_SERVER_URL ||
  "";

export async function requestPositionAnalysis({
  position,
  marketData = {},
  historicalData = [],
}) {
  const access = assertAIAccess();

  /*
   * HARD AI GATE
   *
   * When AI is disabled, no server request is made.
   */
  if (!access.allowed) {
    return {
      success: false,
      status: "AI_DISABLED",
      recommendation: "HOLD",
      confidence: 0,
      providers: [],
      reason: access.reason,
    };
  }

  try {
    const response = await fetch(
      `${AI_SERVER_URL}/api/positions/analyze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          position,
          marketData,
          historicalData,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        status: "AI_ERROR",
        recommendation: "HOLD",
        confidence: 0,
        providers: [],
        reason:
          data?.error ||
          "Position AI request failed.",
      };
    }

    return {
      success: true,
      status: data.status || "ANALYZED",
      recommendation:
        data.recommendation || "HOLD",
      confidence:
        Number(data.confidence) || 0,
      reasoning:
        data.reasoning || "",
      risk:
        data.risk || null,
      providers:
        data.providers || access.providers,
      analyzedAt:
        data.analyzedAt ||
        new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      status: "AI_ERROR",
      recommendation: "HOLD",
      confidence: 0,
      providers: [],
      reason:
        error?.message ||
        "Unable to reach AI server.",
    };
  }
}
