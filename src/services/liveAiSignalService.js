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

  const marketType =
    String(options.marketType || "PERP").toUpperCase() === "SPOT"
      ? "SPOT"
      : "PERP";

  const response = await fetch(
    apiUrl(
      `/api/ai/latest?interval=${encodeURIComponent(interval)}&marketType=${marketType}&leverage=2&maxMarkets=${maxMarkets}`
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

  const actionableDecision =
    snapshot?.finalDecision ||
    ai?.decision ||
    "NO_TRADE";

  const selectedCandidate =
    actionableDecision === "TRADE"
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
        tradeExplanation:
          ai?.tradeExplanation || null,
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
      actionableDecision === "TRADE"
        ? "RECOMMENDED"
        : "NO_TRADE",
    summary:
      ai?.reason ||
      "Latest server market analysis loaded.",

    tradeQuality:
      snapshot?.tradeQuality || null,

    whyNoTrade:
      snapshot?.whyNoTrade || null,

    marketRegime:
      snapshot?.marketRegime || null,

    tradeExplanation:
      ai?.tradeExplanation || null,
    recommendation: {
      verdict:
        actionableDecision === "TRADE"
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
