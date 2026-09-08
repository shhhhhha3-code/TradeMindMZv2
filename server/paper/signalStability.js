import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "paper-signal-history.json");

const MAX_RECORDS = 5000;

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify([], null, 2),
      "utf8"
    );
  }
}

function readRecords() {
  try {
    ensureStorage();

    const raw = fs.readFileSync(
      DATA_FILE,
      "utf8"
    );

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function writeRecords(records) {
  ensureStorage();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      records.slice(0, MAX_RECORDS),
      null,
      2
    ),
    "utf8"
  );
}

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
}

function normalizeDecision(value) {
  const decision = String(value ?? "")
    .trim()
    .toUpperCase();

  if (
    decision === "TRADE" ||
    decision === "WATCH" ||
    decision === "NO_TRADE"
  ) {
    return decision;
  }

  return "NO_TRADE";
}

function normalizeSignal(snapshot = {}) {
  const candidate =
    snapshot.candidate ||
    snapshot.selectedCandidate ||
    snapshot ||
    null;

  const aiDecision =
    snapshot.aiDecision ||
    null;

  const symbol =
    snapshot.symbol ||
    candidate?.symbol ||
    null;

  const decision = normalizeDecision(
    snapshot.finalDecision ??
      snapshot.decision ??
      aiDecision?.decision ??
      snapshot.engineDecision
  );

  const price = finite(
    snapshot.price ??
      candidate?.price ??
      candidate?.entry
  );

  const score = finite(
    snapshot.engineScore ??
      candidate?.engineScore ??
      candidate?.score
  );

  const confidence = finite(
    snapshot.confidence ??
      candidate?.confidence ??
      aiDecision?.confidence
  );

  const risk =
    candidate?.risk?.level ??
    candidate?.risk ??
    snapshot.risk ??
    "UNKNOWN";

  return {
    id: `signal_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,

    timestamp:
      new Date().toISOString(),

    decision,

    symbol,

    direction:
      candidate?.direction ??
      candidate?.trend ??
      null,

    price,

    engineScore: score,

    confidence,

    risk,

    riskReward:
      finite(
        candidate?.riskReward ??
        snapshot.riskReward
      ),

    rsi:
      finite(
        candidate?.rsi ??
        snapshot.rsi
      ),

    volumeRatio:
      finite(
        candidate?.volumeRatio ??
        snapshot.volumeRatio
      ),

    aiDecision:
      aiDecision?.decision ??
      null,

    aiProvider:
      aiDecision?.provider ??
      null,

    aiConfidence:
      finite(
        aiDecision?.confidence
      ),

    blockedByEngine:
      Boolean(
        snapshot.blockedByEngine ??
        aiDecision?.blockedByEngine ??
        false
      ),
  };
}

function sameSignal(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    a.symbol === b.symbol &&
    a.decision === b.decision &&
    a.direction === b.direction
  );
}

export function recordSignal(snapshot = {}) {
  const records = readRecords();
  const signal = normalizeSignal(snapshot);

  const previous = records[0] || null;

  const duplicate =
    previous &&
    sameSignal(previous, signal);

  signal.duplicate = Boolean(
    duplicate
  );

  signal.sequence = duplicate
    ? previous.sequence
    : (previous?.sequence || 0) + 1;

  records.unshift(signal);

  writeRecords(records);

  return signal;
}

export function getSignalHistory(limit = 100) {
  const records = readRecords();

  return records.slice(
    0,
    Math.max(
      1,
      Math.min(
        Number(limit) || 100,
        1000
      )
    )
  );
}

export function resetSignalHistory() {
  writeRecords([]);

  return [];
}

export function getSignalStability() {
  const records = readRecords();

  if (!records.length) {
    return {
      totalScans: 0,
      tradeSignals: 0,
      watchSignals: 0,
      noTradeSignals: 0,
      uniqueSymbols: 0,
      duplicateSignals: 0,
      duplicateRate: 0,
      averageScore: 0,
      averageConfidence: 0,
      current: null,
    };
  }

  const trades =
    records.filter(
      (record) =>
        record.decision === "TRADE"
    );

  const watch =
    records.filter(
      (record) =>
        record.decision === "WATCH"
    );

  const noTrade =
    records.filter(
      (record) =>
        record.decision === "NO_TRADE"
    );

  const duplicates =
    records.filter(
      (record) =>
        record.duplicate
    );

  const symbols =
    new Set(
      records
        .map(
          (record) =>
            record.symbol
        )
        .filter(Boolean)
    );

  const scoreValues =
    records
      .map(
        (record) =>
          finite(record.engineScore)
      )
      .filter(
        (value) =>
          value !== null
      );

  const confidenceValues =
    records
      .map(
        (record) =>
          finite(record.confidence)
      )
      .filter(
        (value) =>
          value !== null
      );

  const average = (
    values
  ) =>
    values.length
      ? values.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / values.length
      : 0;

  return {
    totalScans:
      records.length,

    tradeSignals:
      trades.length,

    watchSignals:
      watch.length,

    noTradeSignals:
      noTrade.length,

    uniqueSymbols:
      symbols.size,

    duplicateSignals:
      duplicates.length,

    duplicateRate:
      Number(
        (
          duplicates.length /
          records.length
        ).toFixed(4)
      ),

    averageScore:
      Number(
        average(scoreValues).toFixed(2)
      ),

    averageConfidence:
      Number(
        average(
          confidenceValues
        ).toFixed(2)
      ),

    current:
      records[0] || null,
  };
}

export function evaluateTradeStability(
  symbol,
  requiredConsecutive = 2
) {
  const records = readRecords();

  const relevant =
    records.filter(
      (record) =>
        record.symbol === symbol
    );

  if (!relevant.length) {
    return {
      stable: false,
      consecutive: 0,
      required:
        requiredConsecutive,
    };
  }

  const current =
    relevant[0];

  if (
    current.decision !==
    "TRADE"
  ) {
    return {
      stable: false,
      consecutive: 0,
      required:
        requiredConsecutive,
    };
  }

  let consecutive = 0;

  for (
    const record of relevant
  ) {
    if (
      record.decision !==
        "TRADE"
    ) {
      break;
    }

    consecutive += 1;

    if (
      consecutive >=
      requiredConsecutive
    ) {
      break;
    }
  }

  return {
    stable:
      consecutive >=
      requiredConsecutive,

    consecutive,

    required:
      requiredConsecutive,
  };
}

export {
  DATA_FILE,
  MAX_RECORDS,
};
