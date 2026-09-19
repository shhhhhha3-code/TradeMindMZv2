import { apiUrl } from "./apiBase.js";
async function readJson(
  response,
  label
) {
  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      `${label}: invalid JSON response (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `${label}: request failed (${response.status})`
    );
  }

  return data;
}

export async function fetchLiveAiSignal(
  options = {}
) {
  const maxMarkets =
    Number(
      options.maxMarkets
    ) > 0
      ? Number(options.maxMarkets)
      : 25;

  const scannerResponse =
    await fetch(
      apiUrl(`/api/pionex/market-scan?limit=100&maxMarkets=${maxMarkets}`),
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

  const scanner =
    await readJson(
      scannerResponse,
      "Pionex market scan"
    );

  const candidates =
    Array.isArray(
      scanner?.candidates
    )
      ? scanner.candidates
      : [];

  const topCandidates =
    candidates
      .slice(0, 5);

  if (
    topCandidates.length === 0
  ) {
    throw new Error(
      "Pionex scanner returned no candidates."
    );
  }

  const ai = scanner?.aiDecision || null;

  /*
   * Only expose a candidate as the actionable recommendation
   * when the Decision Layer explicitly returned TRADE.
   *
   * On NO_TRADE/WATCH we keep the TOP 5 candidates available,
   * but never render one of them as a long/short recommendation.
   * This prevents engine confidence/score values from being
   * mistaken for an AI-approved trade.
   */
  const selectedCandidate =
    ai?.decision === "TRADE"
      ? topCandidates.find(
          candidate =>
            candidate?.symbol === ai?.symbol
        ) || null
      : null;

  const approvedRecommendation = selectedCandidate
    ? {
        ...selectedCandidate,
        aiConfidence:
          Number.isFinite(Number(ai?.confidence))
            ? Number(ai.confidence)
            : null,
        aiDecision:
          ai?.decision || null,
        aiProvider:
          ai?.provider || null,
      }
    : null;

  const recommendation = {
    verdict:
      ai?.decision === "TRADE"
        ? "RECOMMENDED"
        : "NO_TRADE",

    recommended:
      selectedCandidate,

    summary:
      ai?.reason ||
      "Live market analysis completed."
  };

  return {
    success: true,

    provider:
      ai?.provider ||
      options.preferredProvider ||
      "groq",

    candidates:
      topCandidates,

    recommendation,

    comparison:
      [],

    verdict:
      recommendation.verdict,

    recommended:
      recommendation.recommended,

    summary:
      recommendation.summary,

    scannedAt:
      new Date().toISOString()
  };
}

export async function fetchLiveAiTop5(
  options = {}
) {
  return fetchLiveAiSignal(
    options
  );
}
