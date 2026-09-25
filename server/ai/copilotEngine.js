import { buildCandidates } from "../../engine/candidateEngine.js";
import { runAIDecisionLayer } from "./aiDecisionEngine.js";
import { getSupabaseClient } from "../supabase/client.js";
import { getPaperLearning } from "../paper/paperLearning.js";
import { calculateCopilotEvidence, getCopilotEvidence } from "./copilotEvidence.js";

const ACTIONS = { TRADE:"TRADE", WATCH:"WATCH", NO_TRADE:"NO_TRADE", PROTECT:"PROTECT", EXIT_REVIEW:"EXIT_REVIEW" };

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function direction(value) {
  const v = String(value ?? "").toUpperCase();
  if (v === "BUY" || v === "LONG" || v === "UP") return "BULLISH";
  if (v === "SELL" || v === "SHORT" || v === "DOWN") return "BEARISH";
  return "NEUTRAL";
}
function regime(candidates) {
  const dirs = candidates.map(c => direction(c.direction ?? c.trend));
  const bullish = dirs.filter(v => v === "BULLISH").length;
  const bearish = dirs.filter(v => v === "BEARISH").length;
  if (bullish >= 3 && bullish > bearish) return "BULLISH";
  if (bearish >= 3 && bearish > bullish) return "BEARISH";
  return "MIXED";
}
function factorState(candidate) {
  if (!candidate) return [];
  const rsi=finite(candidate.rsi), rr=finite(candidate.riskReward), volume=finite(candidate.volumeRatio), change=finite(candidate.change24h);
  return [
    {name:"Engine score",state:candidate.engineScore>=75?"PASS":"FAIL",value:candidate.engineScore},
    {name:"Confidence",state:candidate.confidence==null||candidate.confidence>=80?"PASS":"FAIL",value:candidate.confidence},
    {name:"Risk/reward",state:rr==null||rr>=2?"PASS":"FAIL",value:rr},
    {name:"RSI",state:rsi==null||(rsi>=35&&rsi<=70)?"PASS":"FAIL",value:rsi},
    {name:"Volume",state:volume==null||volume>=0.8?"PASS":"FAIL",value:volume},
    {name:"Risk",state:candidate.risk?.level!=="HIGH"?"PASS":"FAIL",value:candidate.risk?.level??null},
    ...(change==null?[]:[{name:"24h momentum",state:change>0?"POSITIVE":change<0?"NEGATIVE":"FLAT",value:change}])
  ];
}
function buildExplanation(candidate, action) {
  if (!candidate) return "Insufficient market data.";
  const blockers = candidate.risk?.reasons ?? [];
  if (action === ACTIONS.NO_TRADE) return blockers.length ? `No trade: deterministic risk gates blocked this setup (${blockers.join(", ")}).` : "No trade: the setup does not meet the minimum confluence required by TradeMindMZ.";
  if (action === ACTIONS.WATCH) return "Watch: useful confluence exists, but required confirmation is still missing.";
  return `Trade candidate: ${candidate.symbol} passes deterministic filters and is eligible for AI cross-check.`;
}
async function saveCopilotDecision(result) {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("ai_copilot_history").insert({
      symbol: result.symbol,
      action: result.action,
      confidence: result.confidence,
      risk: result.risk,
      regime: result.regime,
      engine_score: result.deterministic?.engineScore ?? null,
      engine_reasons: result.deterministic?.reasons ?? [],
      factors: result.deterministic?.factors ?? [],
      position_review: result.positionReview ?? null,
      ai_result: result.ai ?? null,
      candidates: result.candidates ?? [],
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("[TradeMindMZ Copilot] history save skipped:", error?.message ?? error);
    return false;
  }
}

export async function runCopilot({markets=[],position=null,preferredProvider=null,candidateLimit=5}={}) {
  const candidates = buildCandidates(markets,{limit:candidateLimit});
  const ai = await runAIDecisionLayer(candidates,{preferredProvider});
  let action = ai.decision === "TRADE" ? ACTIONS.TRADE : ai.decision === "WATCH" ? ACTIONS.WATCH : ACTIONS.NO_TRADE;
  let positionReview = null;

  if (position) {
    const entry=finite(position.entryPrice??position.entry);
    const current=finite(position.currentPrice??position.markPrice??position.price);
    const stop=finite(position.stopLoss??position.stop);
    const side=String(position.side??position.direction??"").toUpperCase();
    const short=side==="SELL"||side==="SHORT";
    const pnlPct=entry&&current?(short?((entry-current)/entry)*100:((current-entry)/entry)*100):null;
    const stopThreat=entry&&current&&stop?(short?current>=stop:current<=stop):false;
    positionReview={symbol:position.symbol??null,side:side||null,entry,current,stopLoss:stop,pnlPct:pnlPct==null?null:Number(pnlPct.toFixed(2)),stopThreat,action:stopThreat?ACTIONS.PROTECT:ACTIONS.EXIT_REVIEW,reason:stopThreat?"Price is at or beyond the supplied stop-loss. Review risk immediately.":"Position remains open; continue monitoring invalidation and risk/reward."};
  }

  const selected=candidates.find(c=>String(c.symbol).toUpperCase()===String(ai.symbol??"").toUpperCase())??candidates[0]??null;
  const learning = getPaperLearning({ limit: 5000 });
  const evidence = calculateCopilotEvidence(selected, learning.history);
  const result={success:true,copilotVersion:"2.1",action,symbol:selected?.symbol??null,regime:regime(candidates),confidence:ai.confidence??0,risk:ai.risk??selected?.risk?.level??"HIGH",evidence,deterministic:{engineScore:selected?.engineScore??null,reasons:selected?.risk?.reasons??[],factors:factorState(selected)},ai,positionReview,explanation:buildExplanation(selected,action),candidates,generatedAt:new Date().toISOString(),execution:"READ_ONLY"};
  result.historySaved=await saveCopilotDecision(result);
  return result;
}

export function getCopilotEvidenceSnapshot({ limit = 5000, candidate = null } = {}) {\n  return getCopilotEvidence({ limit, candidate });\n}\n\nexport async function getCopilotLearningStats() {
  try {
    const supabase=getSupabaseClient();
    const { data, error }=await supabase.from("ai_copilot_learning_stats").select("*").single();
    if(error) throw error;
    return {success:true,stats:data};
  } catch(error) {
    return {success:false,stats:null,error:error?.message??String(error)};
  }
}
