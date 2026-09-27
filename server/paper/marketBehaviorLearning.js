import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "market-behavior.json");

export const MARKET_BEHAVIOR_POLICY = Object.freeze({
  maxRecords: 10000,
  maxActiveSignals: 200,
  signalCooldownMinutes: 15,
  checkpointsMinutes: [1, 3, 5, 15, 30, 60],
  checkpointToleranceMinutes: 0.75,
  maxObservationsPerSignal: 180,
  horizonMinutes: 60,
  outcomeFlatThresholdPct: 0.05,
});

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function readRecords() {
  try {
    ensureStorage();
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records) {
  ensureStorage();
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(records.slice(-MARKET_BEHAVIOR_POLICY.maxRecords), null, 2),
    "utf8",
  );
}

function directionOf(value) {
  const direction = String(value || "").toUpperCase();
  return direction === "SELL" || direction === "SHORT" ? "SELL" : "BUY";
}

function directionalReturn(direction, entry, price) {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(price)) return null;
  const raw = ((price - entry) / entry) * 100;
  return directionOf(direction) === "SELL" ? -raw : raw;
}

function outcomeFor(returnPct) {
  if (returnPct === null) return "UNKNOWN";
  if (returnPct > MARKET_BEHAVIOR_POLICY.outcomeFlatThresholdPct) return "FAVORABLE";
  if (returnPct < -MARKET_BEHAVIOR_POLICY.outcomeFlatThresholdPct) return "ADVERSE";
  return "FLAT";
}

function rMultiple(signal, returnPct) {
  const entry = finite(signal.entry);
  const stop = finite(signal.stopLoss);
  if (entry === null || stop === null || returnPct === null) return null;
  const riskPct = Math.abs((stop - entry) / entry) * 100;
  return riskPct > 0 ? returnPct / riskPct : null;
}

function checkpointFor(signal, elapsedMinutes, price, at) {
  const returnPct = directionalReturn(signal.direction, signal.entry, price);
  return {
    minutes: elapsedMinutes,
    at: new Date(at).toISOString(),
    price,
    returnPct,
    rMultiple: rMultiple(signal, returnPct),
  };
}

function signalFingerprint(candidate) {
  return [
    candidate?.symbol || "",
    String(candidate?.marketType || "PERP").toUpperCase(),
    directionOf(candidate?.direction),
    String(candidate?.regime || "UNKNOWN"),
    String(candidate?.multiTimeframe?.alignment || "UNKNOWN"),
  ].join("|");
}

function observationFor(price, at) {
  return {
    at: new Date(at).toISOString(),
    price,
  };
}

function findCheckpointObservation(signal, checkpointMinutes) {
  const targetAt =
    Date.parse(signal.createdAt || "") +
    checkpointMinutes * 60_000;

  const tolerance =
    MARKET_BEHAVIOR_POLICY.checkpointToleranceMinutes * 60_000;

  const observations = Array.isArray(signal.observations)
    ? signal.observations
    : [];

  let best = null;
  let bestDistance = Infinity;

  for (const observation of observations) {
    const observedAt = Date.parse(observation?.at || "");
    const price = finite(observation?.price);

    if (!Number.isFinite(observedAt) || price === null) continue;

    const distance = Math.abs(observedAt - targetAt);
    if (distance <= tolerance && distance < bestDistance) {
      best = {
        at: observedAt,
        price,
      };
      bestDistance = distance;
    }
  }

  return best;
}

export function getMarketBehaviorRecords() {
  return readRecords();
}

export function recordSignalCandidates(candidates = [], microstructureBySymbol = {}, at = Date.now()) {
  const records = readRecords();
  const active = records.filter((record) => record.status === "ACTIVE");
  const added = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const symbol = candidate?.symbol;
    const entry = finite(candidate?.entry ?? candidate?.price);
    if (!symbol || entry === null || entry <= 0) continue;

    const fingerprint = signalFingerprint(candidate);
    const recent = records.find((record) => {
      if (record.symbol !== symbol || record.status === "ACTIVE") return false;
      const age = at - Date.parse(record.createdAt || "");
      return age >= 0 && age < MARKET_BEHAVIOR_POLICY.signalCooldownMinutes * 60_000;
    });
    const sameActive = active.find((record) => record.fingerprint === fingerprint);

    if (recent || sameActive || active.length >= MARKET_BEHAVIOR_POLICY.maxActiveSignals) continue;

    const micro = microstructureBySymbol[symbol] || null;
    const signal = {
      id: "mb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      status: "ACTIVE",
      createdAt: new Date(at).toISOString(),
      symbol,
      direction: directionOf(candidate.direction),
      entry,
      stopLoss: finite(candidate.stopLoss),
      takeProfit: finite(candidate.takeProfit),
      engineScore: finite(candidate.engineScore),
      confidence: finite(candidate.confidence),
      riskReward: finite(candidate.riskReward),
      rsi: finite(candidate.rsi),
      volumeRatio: finite(candidate.volumeRatio),
      engineDecision:
        String(candidate?.decision || "UNKNOWN").toUpperCase(),
      dataQualityStatus:
        String(candidate?.dataQuality?.status || "UNKNOWN").toUpperCase(),
      riskLevel:
        String(candidate?.risk?.level || candidate?.riskLevel || "UNKNOWN").toUpperCase(),
      riskPoints:
        finite(candidate?.risk?.points),
      regime: candidate.regime || null,
      mtfConfirmation: candidate?.multiTimeframe?.confirmation || null,
      mtfAlignment: candidate?.multiTimeframe?.alignment || null,
      marketType:
        String(
          candidate?.marketType ||
          (String(symbol).toUpperCase().endsWith("_PERP") ? "PERP" : "SPOT")
        ).toUpperCase() === "SPOT"
          ? "SPOT"
          : "PERP",
      fingerprint,
      initialMicrostructure: micro,
      observations: [],
      checkpoints: [],
      maxFavorablePct: 0,
      maxAdversePct: 0,
      maxFavorableR: 0,
      minAdverseR: 0,
      finalReturnPct: null,
      outcome: null,
      closedAt: null,
    };

    records.push(signal);
    added.push(signal);
  }

  writeRecords(records);
  return { success: true, added: added.length, signals: added };
}

export function updateMarketBehavior({ prices = {}, microstructureBySymbol = {}, at = Date.now() } = {}) {
  const records = readRecords();
  let changed = false;
  let updated = 0;
  let closed = 0;

  for (const signal of records.filter((record) => record.status === "ACTIVE")) {
    const price = finite(prices[signal.symbol]);
    if (price === null) continue;

    const createdAt = Date.parse(signal.createdAt || "");
    if (!Number.isFinite(createdAt)) continue;

    const elapsedMinutes = (at - createdAt) / 60_000;
    if (elapsedMinutes < 0) continue;

    const returnPct = directionalReturn(signal.direction, signal.entry, price);
    if (returnPct === null) continue;

    if (!Array.isArray(signal.observations)) {
      signal.observations = [];
    }

    const observation = observationFor(price, at);
    const lastObservation = signal.observations[signal.observations.length - 1];

    if (
      !lastObservation ||
      Date.parse(lastObservation.at || "") !== Date.parse(observation.at)
    ) {
      signal.observations.push(observation);
      if (
        signal.observations.length >
        MARKET_BEHAVIOR_POLICY.maxObservationsPerSignal
      ) {
        signal.observations =
          signal.observations.slice(
            -MARKET_BEHAVIOR_POLICY.maxObservationsPerSignal
          );
      }
    }

    signal.maxFavorablePct = Math.max(signal.maxFavorablePct || 0, returnPct);
    signal.maxAdversePct = Math.min(signal.maxAdversePct || 0, returnPct);
    signal.maxFavorableR = Math.max(signal.maxFavorableR || 0, rMultiple(signal, returnPct) ?? 0);
    signal.minAdverseR = Math.min(signal.minAdverseR || 0, rMultiple(signal, returnPct) ?? 0);

    const latestMicro = microstructureBySymbol[signal.symbol];
    if (latestMicro) signal.latestMicrostructure = latestMicro;

    for (const checkpoint of MARKET_BEHAVIOR_POLICY.checkpointsMinutes) {
      const exists =
        signal.checkpoints.some(
          (item) => item.minutes === checkpoint
        );

      if (exists) continue;

      const observationForCheckpoint =
        findCheckpointObservation(
          signal,
          checkpoint
        );

      if (!observationForCheckpoint) continue;

      signal.checkpoints.push(
        checkpointFor(
          signal,
          checkpoint,
          observationForCheckpoint.price,
          observationForCheckpoint.at
        )
      );
    }

    updated += 1;
    changed = true;

    if (elapsedMinutes >= MARKET_BEHAVIOR_POLICY.horizonMinutes) {
      signal.status = "CLOSED";
      signal.finalReturnPct = returnPct;
      signal.outcome = outcomeFor(returnPct);
      signal.closedAt = new Date(at).toISOString();
      closed += 1;
    }
  }

  if (changed) writeRecords(records);
  return { success: true, updated, closed, active: records.filter((record) => record.status === "ACTIVE").length };
}

function groupBy(records, key) {
  const groups = new Map();
  for (const record of records.filter((item) => item.status === "CLOSED")) {
    const value = String(record?.[key] || "UNKNOWN");
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(record);
  }
  return [...groups.entries()].map(([group, items]) => ({
    group,
    samples: items.length,
    favorableRate: items.length
      ? Number((items.filter((item) => item.outcome === "FAVORABLE").length / items.length * 100).toFixed(2))
      : 0,
    avgFinalReturnPct: items.length
      ? Number((items.reduce((sum, item) => sum + (finite(item.finalReturnPct, 0)), 0) / items.length).toFixed(4))
      : 0,
    avgMfePct: items.length
      ? Number((items.reduce((sum, item) => sum + (finite(item.maxFavorablePct, 0)), 0) / items.length).toFixed(4))
      : 0,
    avgMaePct: items.length
      ? Number((items.reduce((sum, item) => sum + (finite(item.maxAdversePct, 0)), 0) / items.length).toFixed(4))
      : 0,
  })).sort((a, b) => b.samples - a.samples);
}

export function getMarketBehaviorStats() {
  const records = readRecords();
  const closed = records.filter((record) => record.status === "CLOSED");
  const active = records.filter((record) => record.status === "ACTIVE");

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    policy: MARKET_BEHAVIOR_POLICY,
    totalRecords: records.length,
    activeSignals: active.length,
    closedSignals: closed.length,
    overall: {
      samples: closed.length,
      favorableRate: closed.length
        ? Number((closed.filter((item) => item.outcome === "FAVORABLE").length / closed.length * 100).toFixed(2))
        : 0,
      avgFinalReturnPct: closed.length
        ? Number((closed.reduce((sum, item) => sum + (finite(item.finalReturnPct, 0)), 0) / closed.length).toFixed(4))
        : 0,
      avgMfePct: closed.length
        ? Number((closed.reduce((sum, item) => sum + (finite(item.maxFavorablePct, 0)), 0) / closed.length).toFixed(4))
        : 0,
      avgMaePct: closed.length
        ? Number((closed.reduce((sum, item) => sum + (finite(item.maxAdversePct, 0)), 0) / closed.length).toFixed(4))
        : 0,
    },
    byRegime: groupBy(records, "regime"),
    byMarketType: groupBy(records, "marketType"),
    byEngineDecision: groupBy(records, "engineDecision"),
    byDirection: groupBy(records, "direction"),
    byMtfAlignment: groupBy(records, "mtfAlignment"),
    bySymbol: groupBy(records, "symbol"),
    recent: records.slice(-50).reverse(),
  };
}

export function resetMarketBehavior() {
  writeRecords([]);
  return { success: true, totalRecords: 0 };
}

export { DATA_FILE };
