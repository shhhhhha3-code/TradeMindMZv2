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
    Number(options.maxMarkets) > 0
      ? Number(options.maxMarkets)
      : 25;

  const interval =
    options.interval || "15M";

  const force =
    options.force === true ? "&force=1" : "";

  const scannerResponse =
    await fetch(
      apiUrl(`/api/ai/live-scan?limit=100&maxMarkets=${maxMarkets}&interval=${encodeURIComponent(interval)}&marketType=PERP&leverage=2${force}`),
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
            candidate?.symbol === ai?.symbol ||
            String(candidate?.symbol || "")
              .toUpperCase()
              .replace(/[_-]?USDT.*$/, "") ===
              String(ai?.symbol || "")
                .toUpperCase()
                .replace(/[_-]?USDT.*$/, "")
        ) || null
      : null;

  const approvedRecommendation = selectedCandidate
    ? {
        ...selectedCandidate,
        direction:
          String(selectedCandidate?.direction || "").toUpperCase() === "LONG"
            ? "BUY"
            : String(selectedCandidate?.direction || "").toUpperCase() === "SHORT"
              ? "SELL"
              : String(selectedCandidate?.direction || "").toUpperCase(),
        aiConfidence:
          Number.isFinite(Number(ai?.confidence))
            ? Number(ai.confidence)
            : null,
        aiDecision:
          ai?.decision || null,
        aiProvider:
          ai?.provider || null,
        holdTimeMinMinutes:
          Number.isFinite(Number(ai?.holdTimeMinMinutes))
            ? Number(ai.holdTimeMinMinutes)
            : 0,
        holdTimeMaxMinutes:
          Number.isFinite(Number(ai?.holdTimeMaxMinutes))
            ? Number(ai.holdTimeMaxMinutes)
            : 0,
        holdTimeReason:
          ai?.holdTimeReason || "",
      }
    : null;

  const recommendation = {
    verdict:
      ai?.decision === "TRADE"
        ? "RECOMMENDED"
        : "NO_TRADE",

    recommended:
      approvedRecommendation,

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

    marketType:
      scanner?.marketType || "PERP",

    contractType:
      scanner?.contractType || "USDT-M PERPETUAL",

    leverage:
      Number(scanner?.leverage) || 2,

    cached:
      scanner?.cached === true,

    nextAnalysisAt:
      scanner?.nextAnalysisAt || null,

    verdict:
      recommendation.verdict,

    recommended:
      recommendation.recommended,

    summary:
      recommendation.summary,

    scannedAt:
      scanner?.updatedAt ||
      new Date().toISOString(),

    updatedAt:
      scanner?.updatedAt ||
      new Date().toISOString(),

    persistedAt:
      scanner?.persistedAt ||
      null
  };
}

export async function fetchLiveAiTop5(
  options = {}
) {
  return fetchLiveAiSignal(
    options
  );
}

export async function fetchLatestAiSignal(
  options = {}
) {
  const interval = options.interval || "15M";
  const maxMarkets =
    Number(options.maxMarkets) > 0
      ? Number(options.maxMarkets)
      : 25;

  const response = await fetch(
    apiUrl(
      `/api/ai/latest?interval=${encodeURIComponent(interval)}&marketType=PERP&leverage=2&maxMarkets=${maxMarkets}`
    ),
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    }
  );

  const data = await readJson(
    response,
    "Latest AI snapshot"
  );

  if (!data?.available || !data?.snapshot) {
    return null;
  }

  const snapshot = data.snapshot;
  const candidates = Array.isArray(snapshot?.candidates)
    ? snapshot.candidates.slice(0, 5)
    : Array.isArray(snapshot?.engineTop5)
      ? snapshot.engineTop5.slice(0, 5)
      : [];

  const ai = snapshot?.aiDecision || null;

  const selectedCandidate =
    ai?.decision === "TRADE"
      ? candidates.find(candidate =>
          candidate?.symbol === ai?.symbol ||
          String(candidate?.symbol || "")
            .toUpperCase()
            .replace(/[_-]?USDT.*$/, "") ===
          String(ai?.symbol || "")
            .toUpperCase()
            .replace(/[_-]?USDT.*$/, "")
        ) || null
      : null;

  const recommended = selectedCandidate
    ? {
        ...selectedCandidate,
        direction:
          String(selectedCandidate?.direction || "").toUpperCase() === "LONG"
            ? "BUY"
            : String(selectedCandidate?.direction || "").toUpperCase() === "SHORT"
              ? "SELL"
              : String(selectedCandidate?.direction || "").toUpperCase(),
        aiConfidence:
          Number.isFinite(Number(ai?.confidence))
            ? Number(ai.confidence)
            : null,
        aiDecision: ai?.decision || null,
        aiProvider: ai?.provider || null,
        holdTimeMinMinutes:
          Number.isFinite(Number(ai?.holdTimeMinMinutes))
            ? Number(ai.holdTimeMinMinutes)
            : 0,
        holdTimeMaxMinutes:
          Number.isFinite(Number(ai?.holdTimeMaxMinutes))
            ? Number(ai.holdTimeMaxMinutes)
            : 0,
        holdTimeReason:
          ai?.holdTimeReason || "",
      }
    : null;

  return {
    ...snapshot,
    success: true,
    provider:
      ai?.provider ||
      snapshot?.provider ||
      "groq",
    candidates,
    recommended,
    verdict:
      ai?.decision === "TRADE"
        ? "RECOMMENDED"
        : "NO_TRADE",
    summary:
      ai?.reason ||
      "Latest server market analysis loaded.",
    recommendation: {
      verdict:
        ai?.decision === "TRADE"
          ? "RECOMMENDED"
          : "NO_TRADE",
      recommended,
      summary:
        ai?.reason ||
        "Latest server market analysis loaded."
    },
    updatedAt:
      snapshot?.updatedAt ||
      snapshot?.persistedAt ||
      data?.snapshot?.persistedAt ||
      null,
    persistedAt:
      snapshot?.persistedAt ||
      null,
    cached: true,
    serverSide: true,
  };
}
