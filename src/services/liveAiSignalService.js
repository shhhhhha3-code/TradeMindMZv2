import { apiUrl } from "./apiBase.js";

async function readJson(response, label) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${label}: invalid JSON response (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `${label}: request failed (${response.status})`);
  }
  return data;
}

function normalizeMarketType(value) {
  return String(value || "PERP").toUpperCase() === "SPOT" ? "SPOT" : "PERP";
}

function normalizeRecommended(candidate, ai) {
  if (!candidate) return null;
  const rawDirection = String(candidate?.direction || "").toUpperCase();
  return {
    ...candidate,
    direction:
      rawDirection === "LONG"
        ? "BUY"
        : rawDirection === "SHORT"
          ? "SELL"
          : rawDirection,
    aiConfidence: Number.isFinite(Number(ai?.confidence)) ? Number(ai.confidence) : null,
    aiDecision: ai?.decision || null,
    aiProvider: ai?.provider || null,
    holdTimeMinMinutes: Number.isFinite(Number(ai?.holdTimeMinMinutes)) ? Number(ai.holdTimeMinMinutes) : 0,
    holdTimeMaxMinutes: Number.isFinite(Number(ai?.holdTimeMaxMinutes)) ? Number(ai.holdTimeMaxMinutes) : 0,
    holdTimeReason: ai?.holdTimeReason || "",
    tradeExplanation: ai?.tradeExplanation || null,
  };
}

function buildSignalResponse(snapshot, fallbackProvider = "groq") {
  const candidates = Array.isArray(snapshot?.candidates)
    ? snapshot.candidates.slice(0, 5)
    : Array.isArray(snapshot?.engineTop5)
      ? snapshot.engineTop5.slice(0, 5)
      : [];
  const ai = snapshot?.aiDecision || null;
  const actionableDecision = snapshot?.finalDecision || ai?.decision || "NO_TRADE";
  const selectedCandidate =
    actionableDecision === "TRADE"
      ? candidates.find(candidate =>
          candidate?.symbol === ai?.symbol ||
          String(candidate?.symbol || "").toUpperCase().replace(/[_-]?USDT.*$/, "") ===
          String(ai?.symbol || "").toUpperCase().replace(/[_-]?USDT.*$/, "")
        ) || null
      : null;
  const recommended = normalizeRecommended(selectedCandidate, ai);
  return {
    ...snapshot,
    success: true,
    provider: ai?.provider || snapshot?.provider || fallbackProvider,
    candidates,
    recommended,
    verdict: actionableDecision === "TRADE" ? "RECOMMENDED" : "NO_TRADE",
    summary: ai?.reason || "Live market analysis completed.",
    tradeQuality: snapshot?.tradeQuality || null,
    whyNoTrade: snapshot?.whyNoTrade || null,
    marketRegime: snapshot?.marketRegime || null,
    tradeExplanation: ai?.tradeExplanation || null,
    recommendation: {
      verdict: actionableDecision === "TRADE" ? "RECOMMENDED" : "NO_TRADE",
      recommended,
      summary: ai?.reason || "Live market analysis completed.",
    },
    updatedAt: snapshot?.updatedAt || snapshot?.persistedAt || null,
    persistedAt: snapshot?.persistedAt || null,
  };
}

export async function fetchLiveAiSignal(options = {}) {
  const maxMarkets = Number(options.maxMarkets) > 0 ? Number(options.maxMarkets) : 25;
  const interval = options.interval || "15M";
  const marketType = normalizeMarketType(options.marketType);
  const force = options.force === true ? "&force=1" : "";

  const response = await fetch(
    apiUrl(
      `/api/ai/live-scan?limit=100&maxMarkets=${maxMarkets}&interval=${encodeURIComponent(interval)}&marketType=${marketType}&leverage=3${force}`
    ),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  const scanner = await readJson(response, "Pionex market scan");
  const result = buildSignalResponse(scanner, options.preferredProvider || "groq");
  if (!Array.isArray(result.candidates) || result.candidates.length === 0) {
    throw new Error("Pionex scanner returned no candidates.");
  }
  return {
    ...result,
    marketType,
    contractType: scanner?.contractType || (marketType === "SPOT" ? "SPOT" : "USDT-M PERPETUAL"),
    leverage: Number(scanner?.leverage) || (marketType === "SPOT" ? 1 : 3),
    cached: scanner?.cached === true,
    nextAnalysisAt: scanner?.nextAnalysisAt || null,
    serverSide: true,
  };
}

export async function fetchLiveAiTop5(options = {}) {
  return fetchLiveAiSignal(options);
}

export async function fetchLatestAiSignal(options = {}) {
  const interval = options.interval || "15M";
  const maxMarkets = Number(options.maxMarkets) > 0 ? Number(options.maxMarkets) : 25;
  const marketType = normalizeMarketType(options.marketType);

  const latestLeverage = marketType === "SPOT" ? 1 : 3;

  const response = await fetch(
    apiUrl(
      `/api/ai/latest?interval=${encodeURIComponent(interval)}&marketType=${marketType}&leverage=${latestLeverage}&maxMarkets=${maxMarkets}`
    ),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  const data = await readJson(response, "Latest AI snapshot");
  if (!data?.available || !data?.snapshot || data?.stale === true || data?.snapshot?.stale === true) {
    return null;
  }

  const result = buildSignalResponse(data.snapshot, options.preferredProvider || "groq");
  return {
    ...result,
    marketType,
    contractType: data.snapshot?.contractType || (marketType === "SPOT" ? "SPOT" : "USDT-M PERPETUAL"),
    leverage: Number(data.snapshot?.leverage) || (marketType === "SPOT" ? 1 : 3),
    nextAnalysisAt: data.snapshot?.nextAnalysisAt || null,
    cached: true,
    serverSide: true,
  };
}
