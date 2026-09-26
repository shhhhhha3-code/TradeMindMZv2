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

function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

function clampToBounds(key, value) {
  const bounds = PARAMETER_BOUNDS[key];
  const n = finite(value);
  if (!bounds || n === null) return null;
  const clamped = Math.max(bounds.min, Math.min(bounds.max, n));
  const steps = Math.round((clamped - bounds.min) / bounds.step);
  return Number((bounds.min + steps * bounds.step).toFixed(4));
}

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

export function validateParameterProposal(proposed = {}) {
  const current = flattenCriteria(getTradeCriteria());
  const normalized = {};
  const errors = [];
  for (const key of Object.keys(PARAMETER_BOUNDS)) {
    const value = clampToBounds(key, proposed[key]);
    if (value === null) { errors.push("INVALID_" + key); continue; }
    normalized[key] = value;
    if (Math.abs(value - current[key]) > PARAMETER_BOUNDS[key].step * 5) {
      errors.push("CHANGE_TOO_LARGE_" + key);
    }
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

function summarizeHistory(limit = 500) {
  const result = getPaperLearning({ limit });
  const records = Array.isArray(result?.records) ? result.records : [];
  const closed = records.filter(r => r?.result && r.result !== "UNKNOWN");
  const wins = closed.filter(r => Number(r.pnlPercent) > 0).length;
  const losses = closed.filter(r => Number(r.pnlPercent) < 0).length;
  const pnl = closed.reduce((sum, r) => sum + (Number(r.pnlPercent) || 0), 0);
  return {
    samples: closed.length,
    wins,
    losses,
    winRate: closed.length ? Number((wins / closed.length * 100).toFixed(2)) : null,
    pnl: Number(pnl.toFixed(4)),
    recent: closed.slice(0, 100).map(r => ({
      pnlPercent: r.pnlPercent, result: r.result, engineScore: r.engineScore,
      confidence: r.confidence, risk: r.risk, regime: r.regime,
      mtfAlignment: r.mtfAlignment, mtfConfirmation: r.mtfConfirmation,
    })),
  };
}

async function askCopilot(provider, current, history, question) {
  const systemPrompt = [
    "You are the TradeMindMZ Parameter Optimization Copilot.",
    "Propose parameter changes only from supplied evidence.",
    "Never invent backtest results or market data.",
    "All changes are proposals only; they are NOT active until explicitly promoted.",
    "Respect the supplied parameter bounds and prefer small changes.",
    "If evidence is insufficient, return current values unchanged.",
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
  if (history.samples < 50) {
    return { success: false, status: "INSUFFICIENT_SAMPLES", requiredSamples: 50, current, history };
  }

  const errors = [];
  for (const provider of order) {
    try {
      const ai = await askCopilot(provider, current, history, question);
      const validation = validateParameterProposal(ai?.proposed || ai?.parameters || ai);
      if (!validation.valid) { errors.push({ provider, errors: validation.errors }); continue; }

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
        validation: { status: "PENDING", walkForwardRequired: true, holdoutRequired: true, automaticPromotion: false },
      };

      const state = readState();
      writeState({ status: "PROPOSED", proposal, history: [proposal, ...(state.history || [])].slice(0, 20) });
      return { success: true, ...proposal };
    } catch (error) {
      errors.push({ provider, error: error?.message || String(error) });
    }
  }
  return { success: false, status: "AI_FAILED", current, history, providerErrors: errors };
}

export function getParameterOptimizerStatus() {
  const state = readState();
  return {
    success: true,
    active: flattenCriteria(getTradeCriteria()),
    state: state.status,
    proposal: state.proposal,
    history: state.history || [],
    policy: { automaticPromotion: false, automaticTrading: false, minSamples: 50, maxSingleParameterChangeSteps: 5, bounds: PARAMETER_BOUNDS },
  };
}

export function markParameterValidation({ proposalId, status = "PENDING", details = {} } = {}) {
  const state = readState();
  if (!state.proposal || state.proposal.id !== proposalId) throw new Error("No matching parameter proposal.");
  if (!["PENDING", "PASSED", "FAILED"].includes(status)) throw new Error("Invalid validation status.");
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
