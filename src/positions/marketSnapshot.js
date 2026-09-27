const DEFAULT_MARKET_TYPE = "PERP";

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeMarketType(value, symbol = "") {
  const explicit = String(value || "").trim().toUpperCase();
  if (explicit === "SPOT" || explicit === "PERP") return explicit;

  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  return normalizedSymbol.endsWith("_PERP") || normalizedSymbol.includes(".PERP/")
    ? "PERP"
    : DEFAULT_MARKET_TYPE;
}

export function normalizeDirection(value) {
  const direction = String(value || "").trim().toUpperCase();
  if (direction === "LONG") return "BUY";
  if (direction === "SHORT") return "SELL";
  return direction;
}

export function calculateRiskReward(entry, stopLoss, takeProfit, direction) {
  const entryPrice = finite(entry);
  const stop = finite(stopLoss);
  const target = finite(takeProfit);
  const side = normalizeDirection(direction);

  if (
    entryPrice === null ||
    stop === null ||
    target === null ||
    entryPrice <= 0
  ) {
    return null;
  }

  const risk =
    side === "SELL"
      ? stop - entryPrice
      : entryPrice - stop;

  const reward =
    side === "SELL"
      ? entryPrice - target
      : target - entryPrice;

  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

export function findSnapshotCandidate(snapshot, symbol) {
  const wanted = String(symbol || "").trim().toUpperCase();
  if (!wanted) return null;

  const candidates = Array.isArray(snapshot?.candidates)
    ? snapshot.candidates
    : Array.isArray(snapshot?.engineTop5)
      ? snapshot.engineTop5
      : [];

  return candidates.find(
    candidate =>
      String(candidate?.symbol || "").trim().toUpperCase() === wanted
  ) || null;
}

export function buildAuthoritativeMarketSnapshot({
  position = {},
  candidate = null,
  snapshot = null,
} = {}) {
  const marketType = normalizeMarketType(
    snapshot?.marketType || candidate?.marketType || position?.marketType,
    position?.symbol
  );

  const direction =
    normalizeDirection(
      candidate?.direction ||
      position?.direction ||
      position?.side
    );

  const engineScore = finite(
    candidate?.engineScore ??
    candidate?.score ??
    position?.engineScore
  );

  const confidence = finite(
    candidate?.confidence ??
    candidate?.marketConfidence ??
    position?.marketConfidence
  );

  const riskReward = finite(
    candidate?.riskReward ??
    candidate?.risk?.riskReward
  ) ?? calculateRiskReward(
    candidate?.entry ?? position?.entryPrice,
    candidate?.stopLoss ?? position?.stopLoss,
    candidate?.takeProfit ?? position?.takeProfit,
    direction
  );

  const rsi = finite(
    candidate?.rsi ??
    candidate?.rsi14 ??
    candidate?.indicators?.rsi14 ??
    position?.rsi
  );

  const volumeRatio = finite(
    candidate?.volumeRatio ??
    candidate?.indicators?.volumeRatio ??
    position?.volumeRatio
  );

  const riskLevel = String(
    candidate?.risk?.level ??
    candidate?.riskLevel ??
    position?.riskLevel ??
    position?.risk?.level ??
    "UNKNOWN"
  ).toUpperCase();

  const decision = String(
    candidate?.decision ??
    snapshot?.engineDecision ??
    "UNKNOWN"
  ).toUpperCase();

  const updatedAt =
    snapshot?.updatedAt ||
    snapshot?.persistedAt ||
    candidate?.updatedAt ||
    position?.marketUpdatedAt ||
    null;

  const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
  const ageSeconds = Number.isFinite(updatedMs)
    ? Math.max(0, Math.floor((Date.now() - updatedMs) / 1000))
    : null;

  return {
    symbol: String(candidate?.symbol || position?.symbol || "").toUpperCase(),
    marketType,
    contractType:
      snapshot?.contractType ||
      (marketType === "SPOT" ? "SPOT" : "USDT-M PERPETUAL"),
    direction,
    engineScore,
    confidence,
    riskReward,
    rsi,
    volumeRatio,
    riskLevel,
    decision,
    decisionReasons: Array.isArray(candidate?.reasons)
      ? candidate.reasons
      : [],
    entry: finite(candidate?.entry ?? position?.entryPrice),
    stopLoss: finite(candidate?.stopLoss ?? position?.stopLoss),
    takeProfit: finite(candidate?.takeProfit ?? position?.takeProfit),
    updatedAt,
    ageSeconds,
    snapshotId:
      snapshot?.snapshotId ||
      snapshot?.id ||
      snapshot?.persistedAt ||
      snapshot?.updatedAt ||
      null,
    source: "TRADEMIND_ENGINE_SNAPSHOT",
  };
}
