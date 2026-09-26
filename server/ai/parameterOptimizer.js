import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getTradeCriteria, saveTradeCriteria } from "./tradeCriteria.js";
import { getPaperLearning } from "../paper/paperLearning.js";
import { getServerAIConfig, getAvailableProviders } from "./aiConfig.js";
import { callAICopilotProvider } from "./providers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROPOSAL_PATH = path.join(__dirname, "parameterOptimizerState.json");

export const PARAMETER_BOUNDS = Object.freeze({
  minimumScore: { min: 70, max: 85, step: 1 },
  minimumConfidence: { min: 75, max: 90, step: 1 },
  minimumRiskReward: { min: 1.8, max: 3.0, step: 0.05 },
  minimumRsi: { min: 25, max: 45, step: 1 },
  maximumRsi: { min: 60, max: 80, step: 1 },
  minimumVolumeRatio: { min: 0.6, max: 1.2, step: 0.05 },
  highRiskMinimumScore: { min: 80, max: 95, step: 1 },
  highRiskMinimumConfidence: { min: 85, max: 95, step: 1 },
});

const VALIDATION_POLICY = Object.freeze({
  minSamples: 50,
  minHoldoutSamples: 15,
  holdoutRatio: 0.25,
  rollingWindows: 3,
  minWindowSamples: 8,
  minRegimeSamples: 10,
  minImprovementPct: 0,
  maxRegimeDegradationPct: 0,
});

function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

function flattenCriteria(criteria) {
  return {
    minimumScore: criteria.minimumScore,
    minimumConfidence: criteria.minimumConfidence,
    minimumRiskReward: criteria.minimumRiskReward,
    minimumRsi: criteria.minimumRsi,
    maximumRsi: criteria.maximumRsi,
    minimumVolumeRatio: criteria.minimumVolumeRatio,
    highRiskMinimumScore: criteria.highRisk?.minimumScore,
    highRiskMinimumConfidence: criteria.highRisk?.minimumConfidence,
  };
}

function unflatten(v) {
  return {
    minimumScore: v.minimumScore,
    minimumConfidence: v.minimumConfidence,
    minimumRiskReward: v.minimumRiskReward,
    minimumRsi: v.minimumRsi,
    maximumRsi: v.maximumRsi,
    minimumVolumeRatio: v.minimumVolumeRatio,
    highRisk: {
      minimumScore: v.highRiskMinimumScore,
      minimumConfidence: v.highRiskMinimumConfidence,
    },
  };
}

function clampToBounds(key, value) {
  const bounds = PARAMETER_BOUNDS[key];
  const n = finite(value);
  if (!bounds || n === null) return null;
  const clamped = Math.max(bounds.min, Math.min(bounds.max, n));
  const steps = Math.round((clamped - bounds.min) / bounds.step);
  return Number((bounds.min + steps * bounds.step).toFixed(4));
}

export function validateParameterProposal(proposed = {}) {
  const current = flattenCriteria(getTradeCriteria());
  const normalized = {};
  const errors = [];
  for (const key of Object.keys(PARAMETER_BOUNDS)) {
    const value = clampToBounds(key, proposed[key]);
    if (value === null) { errors.push("INVALID_" + key); continue; }
    normalized[key] = value;
    if (Math.abs(value - current[key]) > PARAMETER_BOUNDS[key].step * 5) errors.push("CHANGE_TOO_LARGE_" + key);
  }
  if (normalized.minimumRsi >= normalized.maximumRsi) errors.push("RSI_RANGE_INVALID");
  return { valid: errors.length === 0, normalized, errors, current };
}

function readState() {
  try {
    if (fs.existsSync(PROPOSAL_PATH)) return JSON.parse(fs.readFileSync(PROPOSAL_PATH, "utf8"));
  } catch (error) { console.error("Parameter optimizer state read failed:", error); }
  return { status: "NONE", proposal: null, history: [] };
}

function writeState(state) {
  fs.writeFileSync(PROPOSAL_PATH, JSON.stringify(state, null, 2), "utf8");
  return state;
}

function summarize(records) {
  const closed = records.filter(r => r?.result && r.result !== "UNKNOWN");
  const wins = closed.filter(r => Number(r.pnlPercent) > 0).length;
  const pnl = closed.reduce((sum, r) => sum + (Number(r.pnlPercent) || 0), 0);
  return {
    samples: closed.length,
    wins,
    losses: closed.filter(r => Number(r.pnlPercent) < 0).length,
    winRate: closed.length ? Number((wins / closed.length * 100).toFixed(2)) : null,
    avgPnl: closed.length ? Number((pnl / closed.length).toFixed(4)) : null,
    totalPnl: Number(pnl.toFixed(4)),
  };
}

function recordTimestamp(record) {
  for (const value of [record?.evaluatedAt, record?.tradeCreatedAt, record?.recordedAt]) {
    const time = Date.parse(value || "");
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function loadClosedRecords(limit = 5000) {
  const result = getPaperLearning({ limit: Math.min(Math.max(Number(limit) || 500, 50), 5000) });
  return Array.isArray(result?.history)
    ? result.history.filter(r => r?.result && r.result !== "UNKNOWN").sort((a, b) => recordTimestamp(a) - recordTimestamp(b))
    : [];
}

function recordPassesCriteria(record, criteria) {
  const score = finite(record.engineScore);
  const confidence = finite(record.confidence);
  const rr = finite(record.riskReward);
  const rsi = finite(record.rsi);
  const volume = finite(record.volumeRatio);
  const risk = String(record.risk || "").toUpperCase();
  if (score === null || confidence === null || rr === null || rsi === null || volume === null) return false;
  if (score < criteria.minimumScore || confidence < criteria.minimumConfidence || rr < criteria.minimumRiskReward) return false;
  if (rsi < criteria.minimumRsi || rsi > criteria.maximumRsi || volume < criteria.minimumVolumeRatio) return false;
  if (risk === "HIGH" && (score < criteria.highRisk.minimumScore || confidence < criteria.highRisk.minimumConfidence)) return false;
  return true;
}

function evaluateDataset(records, criteria) {
  const eligible = records.filter(r => recordPassesCriteria(r, criteria));
  const stats = summarize(eligible);
  return { ...stats, eligibleSamples: eligible.length };
}
function evaluateByRegime(records, currentCriteria, proposedCriteria) {
  const groups = new Map();
  for (const record of records) {
    const regime = String(record?.regime || "UNKNOWN").toUpperCase();
    if (!groups.has(regime)) groups.set(regime, []);
    groups.get(regime).push(record);
  }
  return [...groups.entries()].map(([regime, bucket]) => {
    const current = evaluateDataset(bucket, currentCriteria);
    const proposed = evaluateDataset(bucket, proposedCriteria);
    const deltaPnl = Number(((proposed.totalPnl || 0) - (current.totalPnl || 0)).toFixed(4));
    const sufficientlySampled = bucket.length >= VALIDATION_POLICY.minRegimeSamples;
    return {
      regime, rawSamples: bucket.length, sufficientlySampled, current, proposed, deltaPnl,
      passed: !sufficientlySampled || (proposed.eligibleSamples > 0 && deltaPnl >= VALIDATION_POLICY.maxRegimeDegradationPct),
    };
  });
}

function buildRollingWindows(records) {
  const holdoutSize = Math.max(VALIDATION_POLICY.minHoldoutSamples, Math.floor(records.length * VALIDATION_POLICY.holdoutRatio));
  const preHoldout = records.slice(0, records.length - holdoutSize);
  const count = Math.min(VALIDATION_POLICY.rollingWindows, Math.floor(preHoldout.length / VALIDATION_POLICY.minWindowSamples));
  const windows = [];
  if (count < 1) return windows;
  const windowSize = Math.max(VALIDATION_POLICY.minWindowSamples, Math.floor(preHoldout.length / (count + 1)));
  for (let i = 0; i < count; i += 1) {
    const end = Math.min(preHoldout.length, (i + 2) * windowSize);
    const start = Math.max(0, end - windowSize);
    if (end - start >= VALIDATION_POLICY.minWindowSamples) windows.push({ index: i + 1, start, end, records: preHoldout.slice(start, end) });
  }
  return windows;
}

export function validateProposalWithWalkForward({ proposalId } = {}) {
  const state = readState();
  const proposal = state.proposal;
  if (!proposal || proposal.id !== proposalId) throw new Error("No matching parameter proposal.");

  const records = loadClosedRecords();
  if (records.length < VALIDATION_POLICY.minSamples) {
    throw new Error("Walk-forward validation requires at least 50 closed paper-trading records.");
  }

  const holdoutSize = Math.max(VALIDATION_POLICY.minHoldoutSamples, Math.floor(records.length * VALIDATION_POLICY.holdoutRatio));
  const split = records.length - holdoutSize;
  const train = records.slice(0, split);
  const holdout = records.slice(split);
  if (holdout.length < VALIDATION_POLICY.minHoldoutSamples) throw new Error("Insufficient holdout records.");

  const currentCriteria = unflatten(proposal.current);
  const proposedCriteria = unflatten(proposal.proposed);

  const trainCurrent = evaluateDataset(train, currentCriteria);
  const trainProposed = evaluateDataset(train, proposedCriteria);
  const holdoutCurrent = evaluateDataset(holdout, currentCriteria);
  const holdoutProposed = evaluateDataset(holdout, proposedCriteria);

  const holdoutDelta = Number(((holdoutProposed.totalPnl || 0) - (holdoutCurrent.totalPnl || 0)).toFixed(4));
  const trainDelta = Number(((trainProposed.totalPnl || 0) - (trainCurrent.totalPnl || 0)).toFixed(4));
  const trainRegimes = evaluateByRegime(train, currentCriteria, proposedCriteria);
  const holdoutRegimes = evaluateByRegime(holdout, currentCriteria, proposedCriteria);
  const rollingWindows = buildRollingWindows(records).map(window => {
    const current = evaluateDataset(window.records, currentCriteria);
    const proposed = evaluateDataset(window.records, proposedCriteria);
    const deltaPnl = Number(((proposed.totalPnl || 0) - (current.totalPnl || 0)).toFixed(4));
    const regimes = evaluateByRegime(window.records, currentCriteria, proposedCriteria);
    return {
      index: window.index, start: window.start, end: window.end, samples: window.records.length,
      current, proposed, deltaPnl, regimes,
      passed: proposed.eligibleSamples > 0 && deltaPnl >= VALIDATION_POLICY.minImprovementPct && regimes.every(item => item.passed),
    };
  });
  const regimeChecks = [...trainRegimes, ...holdoutRegimes];
  const passed =
    trainProposed.eligibleSamples > 0 &&
    holdoutProposed.eligibleSamples > 0 &&
    trainDelta >= VALIDATION_POLICY.minImprovementPct &&
    holdoutDelta >= VALIDATION_POLICY.minImprovementPct &&
    rollingWindows.length > 0 &&
    rollingWindows.every(window => window.passed) &&
    regimeChecks.every(item => item.passed);

  proposal.validation = {
    status: passed ? "PASSED" : "FAILED",
    method: "REGIME_AWARE_ROLLING_WALK_FORWARD_HOLDOUT",
    validatedAt: new Date().toISOString(),
    policy: VALIDATION_POLICY,
    dataOrder: "ASCENDING_CHRONOLOGICAL",
    train: { samples: train.length, current: trainCurrent, proposed: trainProposed, deltaPnl: trainDelta, byRegime: trainRegimes },
    rollingWindows,
    holdout: { samples: holdout.length, current: holdoutCurrent, proposed: holdoutProposed, deltaPnl: holdoutDelta, byRegime: holdoutRegimes },
    automaticPromotion: false,
  };
  writeState({ ...state, status: passed ? "VALIDATED" : "VALIDATION_FAILED", proposal });
  return { success: true, status: proposal.validation.status, proposal, validation: proposal.validation };
}

function summarizeHistory(limit = 500) {
  const records = loadClosedRecords(limit);
  return {
    ...summarize(records),
    recent: records.slice(-100).reverse().map(r => ({
      pnlPercent: r.pnlPercent, result: r.result, engineScore: r.engineScore,
      confidence: r.confidence, risk: r.risk, riskReward: r.riskReward,
      rsi: r.rsi, volumeRatio: r.volumeRatio, regime: r.regime,
      mtfAlignment: r.mtfAlignment, mtfConfirmation: r.mtfConfirmation,
    })),
  };
}

async function askCopilot(provider, current, history, question) {
  const systemPrompt = [
    "You are the TradeMindMZ Parameter Optimization Copilot.",
    "Propose parameter changes only from supplied evidence.",
    "Never invent backtest, walk-forward or holdout results.",
    "All changes are proposals only and are NOT active until validated and explicitly promoted.",
    "Respect parameter bounds and prefer small changes.",
    "Return JSON only with proposed, rationale, evidence, expectedImpact.",
  ].join("\n");
  const userPrompt = JSON.stringify({ question, current, bounds: PARAMETER_BOUNDS, history }, null, 2);
  return callAICopilotProvider(provider, { systemPrompt, userPrompt });
}

export async function createParameterProposal({ question = "Review recent paper-trading evidence and propose safe parameter improvements.", preferredProvider = null, historyLimit = 500 } = {}) {
  const current = flattenCriteria(getTradeCriteria());
  const history = summarizeHistory(historyLimit);
  const providers = getAvailableProviders();
  const config = getServerAIConfig();
  const order = [preferredProvider, config.defaultProvider, ...providers].filter((p, i, list) => p && providers.includes(p) && list.indexOf(p) === i);
  if (!order.length) return { success: false, status: "NO_PROVIDER", current, history };
  if (history.samples < VALIDATION_POLICY.minSamples) return { success: false, status: "INSUFFICIENT_SAMPLES", requiredSamples: VALIDATION_POLICY.minSamples, current, history };

  for (const provider of order) {
    try {
      const ai = await askCopilot(provider, current, history, question);
      const validation = validateParameterProposal(ai?.proposed || ai?.parameters || ai);
      if (!validation.valid) continue;
      const proposal = {
        id: "PM-" + Date.now(),
        status: "PROPOSED",
        createdAt: new Date().toISOString(),
        provider,
        current: validation.current,
        proposed: validation.normalized,
        rationale: String(ai?.rationale || "Copilot parameter proposal").slice(0, 2000),
        evidence: ai?.evidence || history,
        expectedImpact: String(ai?.expectedImpact || "Unknown until validation").slice(0, 1000),
        validation: { status: "PENDING", method: "WALK_FORWARD_HOLDOUT", automaticPromotion: false },
      };
      const state = readState();
      writeState({ status: "PROPOSED", proposal, history: [proposal, ...(state.history || [])].slice(0, 20) });
      return { success: true, ...proposal };
    } catch (error) { console.error("Parameter proposal failed:", error); }
  }
  return { success: false, status: "AI_FAILED", current, history };
}

export function getParameterOptimizerStatus() {
  const state = readState();
  return {
    success: true,
    active: flattenCriteria(getTradeCriteria()),
    state: state.status,
    proposal: state.proposal,
    history: state.history || [],
    policy: { ...VALIDATION_POLICY, automaticPromotion: false, automaticTrading: false, bounds: PARAMETER_BOUNDS },
  };
}

export function markParameterValidation({ proposalId, status = "PENDING", details = {} } = {}) {
  const state = readState();
  if (!state.proposal || state.proposal.id !== proposalId) throw new Error("No matching parameter proposal.");
  if (!["PENDING", "FAILED"].includes(status)) throw new Error("PASSED can only be produced by the internal regime-aware validator.");
  state.proposal.validation = { ...state.proposal.validation, status, details, validatedAt: new Date().toISOString() };
  writeState(state);
  return { success: true, proposal: state.proposal };
}

export function promoteParameterProposal({ proposalId } = {}) {
  const state = readState();
  const proposal = state.proposal;
  if (!proposal || proposal.status !== "PROPOSED" || proposal.id !== proposalId) throw new Error("No matching PROPOSED parameter proposal.");
  if (proposal.validation?.status !== "PASSED") throw new Error("Promotion requires successful walk-forward and holdout validation.");
  const saved = saveTradeCriteria(unflatten(proposal.proposed));
  proposal.status = "PROMOTED";
  proposal.promotedAt = new Date().toISOString();
  proposal.activeAfterPromotion = flattenCriteria(saved);
  writeState({ status: "PROMOTED", proposal, history: [proposal, ...(state.history || [])].slice(0, 20) });
  return { success: true, status: "PROMOTED", criteria: saved, proposal };
}

export function rejectParameterProposal({ proposalId } = {}) {
  const state = readState();
  if (!state.proposal || state.proposal.id !== proposalId) throw new Error("No matching parameter proposal.");
  state.proposal.status = "REJECTED";
  state.proposal.rejectedAt = new Date().toISOString();
  writeState({ status: "REJECTED", proposal: state.proposal, history: [state.proposal, ...(state.history || [])].slice(0, 20) });
  return { success: true, status: "REJECTED", proposal: state.proposal };
}
