import fs from "node:fs";
import path from "node:path";
import { getPaperTrades } from "./paperTrading.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(
  DATA_DIR,
  "paper-learning.json"
);

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      "[]",
      "utf8"
    );
  }
}

function readRecords() {
  try {
    ensureStorage();

    const raw =
      fs.readFileSync(
        DATA_FILE,
        "utf8"
      );

    const parsed =
      JSON.parse(raw);

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
      records.slice(-5000),
      null,
      2
    ),
    "utf8"
  );
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;

  return (
    Math.round(
      (numberOrZero(value) + Number.EPSILON) *
        factor
    ) / factor
  );
}

function resolveResult(trade) {
  const result =
    String(
      trade?.result || ""
    ).toUpperCase();

  if (
    ["WIN", "WON", "PROFIT"].includes(result)
  ) {
    return "WIN";
  }

  if (
    ["LOSS", "LOST", "STOP"].includes(result)
  ) {
    return "LOSS";
  }

  if (
    ["FLAT", "BREAKEVEN", "BREAK_EVEN"]
      .includes(result)
  ) {
    return "FLAT";
  }

  const pnl =
    Number(trade?.pnlPercent);

  if (Number.isFinite(pnl)) {
    if (pnl > 0) return "WIN";
    if (pnl < 0) return "LOSS";
    return "FLAT";
  }

  return "UNKNOWN";
}

function learningKey(trade) {
  return [
    trade?.id || "",
    trade?.evaluatedAt || "",
    trade?.result || "",
    trade?.pnlPercent ?? ""
  ].join("|");
}

function createRecord(trade) {
  const pnl =
    numberOrZero(
      trade?.pnlPercent
    );

  return {
    id:
      `learning_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    tradeId:
      trade?.id || null,

    recordedAt:
      new Date().toISOString(),

    tradeCreatedAt:
      trade?.createdAt || null,

    evaluatedAt:
      trade?.evaluatedAt || null,

    symbol:
      trade?.symbol || "UNKNOWN",

    direction:
      trade?.direction || "UNKNOWN",

    result:
      resolveResult(trade),

    pnlPercent:
      round(pnl),

    engineScore:
      numberOrZero(
        trade?.engineScore
      ),

    confidence:
      numberOrZero(
        trade?.confidence
      ),

    risk:
      trade?.risk || null,

    riskReward:
      numberOrZero(
        trade?.riskReward
      ),

    aiDecision:
      trade?.aiDecision || null,

    aiProvider:
      trade?.aiProvider || null,

    aiConfidence:
      numberOrZero(
        trade?.aiConfidence
      ),

    entry:
      numberOrZero(
        trade?.entry
      ),

    exit:
      numberOrZero(
        trade?.exit
      ),

    stopLoss:
      numberOrZero(
        trade?.stopLoss
      ),

    takeProfit:
      numberOrZero(
        trade?.takeProfit
      ),

    horizonMinutes:
      numberOrZero(
        trade?.horizonMinutes
      ),

    evaluationReason:
      trade?.evaluationReason || null
  };
}

export function syncPaperLearning() {
  const records = readRecords();
  const known = new Set(
    records.map(
      (record) =>
        record.learningKey
    )
  );

  const closed =
    getPaperTrades().filter(
      (trade) =>
        trade?.status === "CLOSED"
    );

  let added = 0;

  for (const trade of closed) {
    const key =
      learningKey(trade);

    if (known.has(key)) {
      continue;
    }

    const record =
      createRecord(trade);

    record.learningKey = key;

    records.push(record);
    known.add(key);
    added += 1;
  }

  if (added > 0) {
    writeRecords(records);
  }

  return {
    success: true,
    added,
    totalRecords:
      records.length,
    closedTrades:
      closed.length
  };
}

function summarize(records) {
  const wins =
    records.filter(
      (record) =>
        record.result === "WIN"
    );

  const losses =
    records.filter(
      (record) =>
        record.result === "LOSS"
    );

  const flats =
    records.filter(
      (record) =>
        record.result === "FLAT"
    );

  const totalPnl =
    records.reduce(
      (sum, record) =>
        sum +
        numberOrZero(
          record.pnlPercent
        ),
      0
    );

  const grossProfit =
    wins.reduce(
      (sum, record) =>
        sum +
        Math.max(
          0,
          numberOrZero(
            record.pnlPercent
          )
        ),
      0
    );

  const grossLoss =
    losses.reduce(
      (sum, record) =>
        sum +
        Math.min(
          0,
          numberOrZero(
            record.pnlPercent
          )
        ),
      0
    );

  return {
    total: records.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,

    winRate:
      records.length
        ? round(
            (wins.length /
              records.length) *
              100
          )
        : 0,

    totalPnlPercent:
      round(totalPnl),

    avgPnlPercent:
      records.length
        ? round(
            totalPnl /
              records.length
          )
        : 0,

    avgWinPercent:
      wins.length
        ? round(
            wins.reduce(
              (sum, record) =>
                sum +
                numberOrZero(
                  record.pnlPercent
                ),
              0
            ) / wins.length
          )
        : 0,

    avgLossPercent:
      losses.length
        ? round(
            losses.reduce(
              (sum, record) =>
                sum +
                numberOrZero(
                  record.pnlPercent
                ),
              0
            ) / losses.length
          )
        : 0,

    grossProfitPercent:
      round(grossProfit),

    grossLossPercent:
      round(grossLoss),

    profitFactor:
      grossLoss < 0
        ? round(
            grossProfit /
              Math.abs(grossLoss)
          )
        : grossProfit > 0
          ? null
          : 0
  };
}

function groupRecords(
  records,
  selector
) {
  const groups = new Map();

  for (const record of records) {
    const key =
      String(
        selector(record) ||
          "UNKNOWN"
      );

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups
      .get(key)
      .push(record);
  }

  return [...groups.entries()]
    .map(([key, bucket]) => ({
      key,
      ...summarize(bucket)
    }))
    .sort(
      (a, b) =>
        b.total -
        a.total
    );
}

function scoreBucket(score) {
  const value =
    numberOrZero(score);

  if (value < 60) return "<60";
  if (value < 70) return "60-69";
  if (value < 80) return "70-79";
  if (value < 90) return "80-89";

  return "90+";
}

function confidenceBucket(
  confidence
) {
  const value =
    numberOrZero(
      confidence
    );

  if (value < 70) return "<70";
  if (value < 80) return "70-79";
  if (value < 90) return "80-89";

  return "90+";
}

function rsiBucket(rsi) {
  const value =
    numberOrZero(rsi);

  if (value < 30) return "<30";
  if (value < 40) return "30-39";
  if (value < 50) return "40-49";
  if (value < 60) return "50-59";
  if (value < 70) return "60-69";

  return "70+";
}

export function getPaperLearning({
  limit = 100
} = {}) {
  const records =
    readRecords();

  const safeLimit = Math.min(
    Math.max(
      Number(limit) || 100,
      1
    ),
    500
  );

  return {
    success: true,

    generatedAt:
      new Date().toISOString(),

    totalRecords:
      records.length,

    overall:
      summarize(records),

    bySymbol:
      groupRecords(
        records,
        (record) =>
          record.symbol
      ),

    byDirection:
      groupRecords(
        records,
        (record) =>
          record.direction
      ),

    byAIProvider:
      groupRecords(
        records,
        (record) =>
          record.aiProvider
      ),

    byEngineScore:
      groupRecords(
        records,
        (record) =>
          scoreBucket(
            record.engineScore
          )
      ),

    byConfidence:
      groupRecords(
        records,
        (record) =>
          confidenceBucket(
            record.confidence
          )
      ),

    byRisk:
      groupRecords(
        records,
        (record) =>
          record.risk
      ),

    history:
      records
        .slice(-safeLimit)
        .reverse()
  };
}

export function resetPaperLearning() {
  writeRecords([]);

  return {
    success: true,
    totalRecords: 0
  };
}

export {
  DATA_FILE
};
