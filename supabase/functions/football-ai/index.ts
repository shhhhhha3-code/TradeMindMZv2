import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const API_BASE = "https://api.footballsoccerapi.com/v1";
const MODEL_NAME = "football-multinomial-v1";
const FEATURE_VERSION = "feature-v1";
const FEATURE_NAMES = [
  "home_form","away_form","home_goal_diff","away_goal_diff",
  "home_attack","away_attack","home_defense","away_defense",
  "goal_diff_edge","position_edge","travel_load",
  "home_xg_proxy","away_xg_proxy","home_advantage",
];

const EUROPEAN_COUNTRIES = new Set([
  "England","Spain","Italy","Germany","France","Netherlands","Portugal","Belgium",
  "Turkey","Greece","Austria","Switzerland","Scotland","Denmark","Norway","Sweden",
  "Finland","Poland","Czech Republic","Czechia","Croatia","Serbia","Ukraine",
  "Romania","Hungary","Slovakia","Slovenia","Bulgaria","Cyprus","Israel",
  "Republic of Ireland","Ireland","Iceland","Russia","Bosnia","Bosnia And Herzegovina",
  "Montenegro","North Macedonia","Wales",
]);

const EUROPEAN_COMPETITIONS = ["Champions League","Europa League","Conference League"];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function nowIso() { return new Date().toISOString(); }
function num(value: any, fallback = 0) {
  const n = Number(value); return Number.isFinite(n) ? n : fallback;
}
function clamp(value: number, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}
function safeJson(value: any) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return {}; }
}

function getFootballKey() { return Deno.env.get("FOOTBALL_API_KEY") || ""; }
function getSupabaseSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return keys?.default || "";
  } catch { return ""; }
}

async function footballApi(path: string, params: Record<string,string> = {}) {
  const key = getFootballKey();
  if (!key) throw new Error("FOOTBALL_API_KEY is not configured in Supabase secrets");
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  const response = await fetch(url, { headers: { "X-API-Key": key, Accept: "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error("Football Soccer API HTTP " + response.status + ": " + JSON.stringify(body).slice(0,700));
  if (body?.error) throw new Error(String(body.error));
  return body;
}

function isEuropeanMatch(m: any) {
  const country = String(m?.country_name || m?.country || "");
  const league = String(m?.league_name || m?.league || "");
  return EUROPEAN_COUNTRIES.has(country) ||
    EUROPEAN_COMPETITIONS.some((name) => league.toLowerCase().includes(name.toLowerCase()));
}

function pickPrice(m: any, side: "home"|"draw"|"away") {
  const keys = side === "home"
    ? ["home_kickoff_price","home_price","home_odds"]
    : side === "draw"
      ? ["draw_kickoff_price","draw_price","draw_odds"]
      : ["away_kickoff_price","away_price","away_odds"];
  for (const key of keys) {
    const value = Number(m?.[key]);
    if (Number.isFinite(value) && value > 1) return value;
  }
  return null;
}

function marketProbabilities(m: any) {
  const odds = { home: pickPrice(m,"home"), draw: pickPrice(m,"draw"), away: pickPrice(m,"away") };
  const available = Object.entries(odds).filter(([,v]) => v && v > 1) as [string,number][];
  if (available.length < 2) return { odds, probabilities: null };
  const inv = available.map(([,v]) => 1/v);
  const total = inv.reduce((a,b) => a+b,0);
  const probabilities: Record<string,number> = { home:1/3, draw:1/3, away:1/3 };
  available.forEach(([key],i) => { probabilities[key] = inv[i]/total; });
  return { odds, probabilities };
}

function extractXg(m:any, side:"home"|"away") {
  const keys = side === "home"
    ? ["home_xg","home_expected_goals","home_expected_goals_for","xg_home"]
    : ["away_xg","away_expected_goals","away_expected_goals_for","xg_away"];
  for (const key of keys) {
    const value = Number(m?.[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function resultFromScore(home:number|null, away:number|null) {
  if (home == null || away == null) return null;
  return home > away ? "home" : home < away ? "away" : "draw";
}

function outcomeLabel(outcome:string,m:any) {
  if (outcome === "home") return String(m.home_team_name || m.home_team || "Hjemme");
  if (outcome === "away") return String(m.away_team_name || m.away_team || "Borte");
  return "Uavgjort";
}

function softmax(scores:number[]) {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(Math.max(-30,Math.min(30,s-max))));
  const total = exps.reduce((a,b)=>a+b,0) || 1;
  return exps.map((v)=>v/total);
}

function defaultWeights() {
  const home = [0.75,0,0.55,0,0.45,0,-0.35,0,0.75,0.30,-0.15,0.25,0,0.40];
  const draw = [0.08,0.08,0.05,0.05,0.04,0.04,0.02,0.02,-0.05,-0.02,0,0.02,0.02,0];
  const away = [0,-0.75,0,-0.55,0,-0.45,0,0.35,-0.55,-0.30,0.10,0,-0.25,-0.20];
  return {
    weights:{home,draw,away},
    bias:{home:0.35,draw:0,away:-0.05},
    learning_rate:0.018,
    training_samples:0,
    model_version:MODEL_NAME,
  };
}

function predictWithWeights(features:Record<string,number>,model:any) {
  const x = FEATURE_NAMES.map((name)=>num(features[name]));
  const classes = ["home","draw","away"];
  const scores = classes.map((outcome)=>{
    const weights = Array.isArray(model?.weights?.[outcome]) ? model.weights[outcome] : [];
    return num(model?.bias?.[outcome]) + x.reduce((sum,v,i)=>sum+v*num(weights[i]),0);
  });
  const probs = softmax(scores);
  return {home:probs[0],draw:probs[1],away:probs[2],scores:{home:scores[0],draw:scores[1],away:scores[2]}};
}

async function getModel(supabase:any) {
  const {data} = await supabase.from("football_ai_model_weights").select("*").eq("model_name",MODEL_NAME).maybeSingle();
  if (data) return data;
  const initial = defaultWeights();
  const row = {
    model_name:MODEL_NAME, model_version:MODEL_NAME, weights:initial.weights, bias:initial.bias,
    learning_rate:initial.learning_rate, training_samples:0
  };
  const {data:created} = await supabase.from("football_ai_model_weights")
    .upsert(row,{onConflict:"model_name"}).select("*").single();
  return created || row;
}

function teamStatsFromRows(rows:any[]) {
  const recent = rows.filter((r)=>r.status === "finished" && r.home_score != null && r.away_score != null)
    .sort((a,b)=>new Date(b.kickoff_at).getTime()-new Date(a.kickoff_at).getTime()).slice(0,10);
  if (!recent.length) return {form:0.5,goalDiff:0,attack:0.38,defense:0.38,xgProxy:0.38,played:0,wins:0};
  let points=0,gf=0,ga=0,wins=0;
  for (const r of recent) {
    const isHome = r.home_team === r._team;
    const scored = isHome ? num(r.home_score) : num(r.away_score);
    const conceded = isHome ? num(r.away_score) : num(r.home_score);
    const result = scored > conceded ? "win" : scored === conceded ? "draw" : "loss";
    points += result === "win" ? 3 : result === "draw" ? 1 : 0;
    if (result === "win") wins++;
    gf += scored; ga += conceded;
  }
  const n=recent.length;
  return {
    form:points/(3*n),
    goalDiff:clamp((gf-ga)/Math.max(1,n*3)),
    attack:clamp((gf/n)/3,0,1),
    defense:clamp((ga/n)/3,0,1),
    xgProxy:clamp((gf/n)/3,0,1),
    played:n,wins
  };
}

async function loadAllTeamHistory(supabase:any) {
  const cache=new Map<string,any>();
  const {data,error}=await supabase.from("football_matches")
    .select("kickoff_at,home_team,away_team,home_score,away_score,status")
    .eq("status","finished")
    .order("kickoff_at",{ascending:false})
    .limit(2000);
  if (error) throw error;
  const grouped=new Map<string,any[]>();
  for (const row of data||[]) {
    if (row.home_team) {
      const list=grouped.get(row.home_team)||[];
      list.push({...row,_team:row.home_team});
      grouped.set(row.home_team,list);
    }
    if (row.away_team) {
      const list=grouped.get(row.away_team)||[];
      list.push({...row,_team:row.away_team});
      grouped.set(row.away_team,list);
    }
  }
  for (const [team,rows] of grouped) cache.set(team,teamStatsFromRows(rows));
  return cache;
}

function buildFeatures(match:any,homeStats:any,awayStats:any) {
  const homeXg=extractXg(match,"home"), awayXg=extractXg(match,"away");
  const homeXgProxy=homeXg != null ? clamp(homeXg/3,0,1) : homeStats.xgProxy;
  const awayXgProxy=awayXg != null ? clamp(awayXg/3,0,1) : awayStats.xgProxy;
  const hp=num(match.home_league_position,0), ap=num(match.away_league_position,0);
  const positionEdge=hp>0 && ap>0 ? clamp((ap-hp)/20) : 0;
  const travel=clamp(num(match.away_travel_km,0)/2500,0,1);
  const features={
    home_form:clamp(homeStats.form,0,1), away_form:clamp(awayStats.form,0,1),
    home_goal_diff:homeStats.goalDiff, away_goal_diff:awayStats.goalDiff,
    home_attack:homeStats.attack, away_attack:awayStats.attack,
    home_defense:homeStats.defense, away_defense:awayStats.defense,
    goal_diff_edge:clamp((homeStats.goalDiff-awayStats.goalDiff)/2),
    position_edge:positionEdge, travel_load:travel,
    home_xg_proxy:homeXgProxy, away_xg_proxy:awayXgProxy, home_advantage:1
  };
  const quality=[homeStats.played>0,awayStats.played>0,hp>0,ap>0,num(match.away_travel_km)>0,homeXg!=null||awayXg!=null];
  return {
    features,
    meta:{
      xg_source:homeXg!=null||awayXg!=null ? "api-field" : "goals-based-proxy",
      home_history_matches:homeStats.played,away_history_matches:awayStats.played,
      data_quality:quality.filter(Boolean).length/quality.length,
      injuries_source:"not_available_from_current_provider"
    }
  };
}

function oddsEngine(probabilities:any,market:any) {
  const out:any={};
  for (const outcome of ["home","draw","away"]) {
    const odds=market.odds[outcome], p=probabilities[outcome], implied=odds ? 1/odds : null;
    out[outcome]={
      odds,model_probability:p,implied_probability:implied,
      edge:odds ? p-implied : null,
      value_percent:odds ? (p*odds-1)*100 : null
    };
  }
  return out;
}

function choosePrediction(probabilities:any,odds:any) {
  const outcomes=["home","draw","away"].map((outcome)=>({
    outcome,probability:probabilities[outcome],value:odds[outcome]?.value_percent ?? null
  }));
  const positiveValue=outcomes.filter((x)=>x.value!=null && x.value>0);
  const pool=positiveValue.length ? positiveValue : outcomes;
  return pool.sort((a,b)=>{
    const av=a.value==null ? -999 : a.value, bv=b.value==null ? -999 : b.value;
    return Math.abs(bv-av)>0.5 ? bv-av : b.probability-a.probability;
  })[0];
}

async function callLlm(provider:"groq"|"openai",match:any,payload:any) {
  const key=provider==="groq" ? Deno.env.get("GROQ_API_KEY") : Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const model=provider==="groq" ? (Deno.env.get("GROQ_MODEL")||"openai/gpt-oss-20b") : (Deno.env.get("OPENAI_MODEL")||"gpt-6-astra");
  const system="You are the reasoning layer for a football prediction system. Use ONLY supplied structured data. Never invent injuries, xG, news, or expert opinions. Return JSON with keys summary, risk, data_gaps, confidence_adjustment. confidence_adjustment must be an integer from -10 to 10. Keep summary under 45 words and risk under 20 words.";
  const user=JSON.stringify({match:{home:match.home_team_name,away:match.away_team_name,league:match.league_name},engine:payload});
  const url=provider==="groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/responses";
  const body=provider==="groq"
    ? {model,temperature:0,response_format:{type:"json_object"},messages:[{role:"system",content:system},{role:"user",content:user}]}
    : {model,temperature:0,instructions:system,input:user};
  try {
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify(body)});
    if (!response.ok) return null;
    const data=await response.json();
    const text=provider==="groq" ? data?.choices?.[0]?.message?.content : data?.output_text;
    if (!text) return null;
    try { return JSON.parse(text); } catch { return {summary:text}; }
  } catch { return null; }
}

async function enrichPredictionWithAi(match:any,prediction:any,featureMeta:any) {
  const payload={
    prediction:prediction.prediction,probabilities:prediction.probabilities,odds:prediction.odds,value:prediction.value,
    features:prediction.features,data_quality:featureMeta.data_quality,xg_source:featureMeta.xg_source,
    injuries_source:featureMeta.injuries_source
  };
  const [groq,openai]=await Promise.all([callLlm("groq",match,payload),callLlm("openai",match,payload)]);
  const summaries=[groq?.summary,openai?.summary].filter(Boolean);
  const risks=[groq?.risk,openai?.risk].filter(Boolean);
  const adjustments=[groq?.confidence_adjustment,openai?.confidence_adjustment].map(Number).filter(Number.isFinite);
  return {
    groq,openai,summary:summaries.join(" ")||null,risk:risks.join(" ")||null,
    confidenceAdjustment:adjustments.length ? adjustments.reduce((a,b)=>a+b,0)/adjustments.length : 0
  };
}

async function upsertMatch(supabase:any,m:any) {
  const externalId=String(m.match_id||m.id||"");
  if (!externalId) return null;
  const rawKickoff=m.kickoff_utc ?? m.kickoff ?? m.kickoff_at;
  const kickoff=typeof rawKickoff==="number" ? new Date(rawKickoff*1000).toISOString() : String(rawKickoff||"");
  if (!kickoff) return null;
  const {data,error}=await supabase.from("football_matches").upsert({
    external_id:externalId,league:m.league_name||"Unknown",
    season:m.season_start_year ? String(m.season_start_year) : (m.season ? String(m.season):null),
    kickoff_at:kickoff,home_team:m.home_team_name||m.home_team||"Unknown",
    away_team:m.away_team_name||m.away_team||"Unknown",
    home_team_id:m.home_team_id ? String(m.home_team_id):null,
    away_team_id:m.away_team_id ? String(m.away_team_id):null,
    status:m.match_status||m.status||"scheduled",
    home_score:m.home_goals ?? null,away_score:m.away_goals ?? null,
    home_xg:extractXg(m,"home"),away_xg:extractXg(m,"away"),
    venue:m.venue_name||null,source:"football-soccer-api",raw:safeJson(m),updated_at:nowIso()
  },{onConflict:"external_id"}).select("*").single();
  if (error) throw error;
  return data;
}

async function evaluatePredictions(supabase:any) {
  const {data:predictions,error}=await supabase.from("football_ai_predictions")
    .select("id,match_id,prediction,confidence,odds,selected_outcome,feature_vector,model_version,status")
    .eq("status","OPEN").limit(500);
  if (error) throw error;
  let evaluated=0;
  for (const p of predictions||[]) {
    const {data:match}=await supabase.from("football_matches")
      .select("id,home_team,away_team,home_score,away_score,status").eq("id",p.match_id).maybeSingle();
    if (!match || !["finished","finished_after_extra_time","awarded"].includes(String(match.status).toLowerCase())) continue;
    const actual=resultFromScore(match.home_score,match.away_score);
    if (!actual) continue;
    let selected=p.selected_outcome;
    if (!selected) {
      if (p.prediction===match.home_team) selected="home";
      else if (p.prediction===match.away_team) selected="away";
      else if (String(p.prediction).toLowerCase().includes("uavgjort")) selected="draw";
    }
    if (!selected) continue;
    const correct=selected===actual, odds=num(p.odds,0);
    const pnl=odds>1 ? (correct ? odds-1 : -1) : null;
    const probs=p.feature_vector?.probabilities;
    const brier=probs ? ["home","draw","away"].reduce((sum,k)=>sum+Math.pow(num(probs[k])-(actual===k?1:0),2),0)/3 : null;
    const logLoss=probs ? -Math.log(Math.max(0.000001,Math.min(0.999999,num(probs[actual])))) : null;
    await supabase.from("football_ai_evaluations").upsert({
      prediction_id:p.id,match_id:p.match_id,actual_result:actual,predicted_result:selected,
      correct,stake:1,pnl,brier_score:brier,log_loss:logLoss,evaluated_at:nowIso()
    },{onConflict:"prediction_id"});
    await supabase.from("football_ai_predictions").update({
      status:correct?"WON":"LOST",settled_result:actual,pnl,evaluated_at:nowIso()
    }).eq("id",p.id);
    evaluated++;
  }
  return evaluated;
}

async function retrainModel(supabase:any) {
  const model=await getModel(supabase);
  const {data:evaluations}=await supabase.from("football_ai_evaluations")
    .select("prediction_id,actual_result").order("evaluated_at",{ascending:true}).limit(5000);
  if (!evaluations?.length) return model;
  const ids=evaluations.map((e:any)=>e.prediction_id);
  const {data:predictions}=await supabase.from("football_ai_predictions").select("id,feature_vector").in("id",ids);
  const byId=new Map((predictions||[]).map((p:any)=>[p.id,p]));
  // Full retrain from the base model prevents repeatedly training the same
  // historical samples on top of already-updated weights.
  const initial=defaultWeights();
  const next={
    ...model,
    weights:{
      home:[...initial.weights.home],
      draw:[...initial.weights.draw],
      away:[...initial.weights.away]
    },
    bias:{...initial.bias}
  };
  const classes=["home","draw","away"],lr=num(model.learning_rate,0.018);
  let samples=0;
  for (const ev of evaluations) {
    const features=byId.get(ev.prediction_id)?.feature_vector?.features;
    if (!features) continue;
    const x=FEATURE_NAMES.map((n)=>num(features[n]));
    const scores=classes.map((outcome)=>num(next.bias[outcome])+x.reduce((s,v,i)=>s+v*num(next.weights[outcome][i]),0));
    const probs=softmax(scores);
    classes.forEach((outcome,i)=>{
      const error=probs[i]-(ev.actual_result===outcome?1:0);
      next.weights[outcome]=next.weights[outcome].map((w:number,j:number)=>w-lr*error*x[j]);
      next.bias[outcome]=num(next.bias[outcome])-lr*error;
    });
    samples++;
  }
  const {data:metrics}=await supabase.from("football_ai_evaluations")
    .select("correct,pnl,brier_score,log_loss").order("evaluated_at",{ascending:false}).limit(500);
  const count=metrics?.length||0,wins=metrics?.filter((r:any)=>r.correct).length||0;
  const brierRows=metrics?.filter((r:any)=>r.brier_score!=null)||[];
  const logRows=metrics?.filter((r:any)=>r.log_loss!=null)||[];
  const row={
    model_name:MODEL_NAME,model_version:MODEL_NAME,weights:next.weights,bias:next.bias,
    learning_rate:lr,training_samples:samples,
    accuracy:count?wins/count:null,
    roi:count?metrics.reduce((s:number,r:any)=>s+num(r.pnl),0)/count:null,
    brier_score:brierRows.length?brierRows.reduce((s:number,r:any)=>s+num(r.brier_score),0)/brierRows.length:null,
    log_loss:logRows.length?logRows.reduce((s:number,r:any)=>s+num(r.log_loss),0)/logRows.length:null,
    updated_at:nowIso()
  };
  await supabase.from("football_ai_model_weights").upsert(row,{onConflict:"model_name"});
  return row;
}

async function syncRows(supabase:any,rows:any[],runType:string) {
  const filtered=rows.filter(isEuropeanMatch),teamCache=await loadAllTeamHistory(supabase),model=await getModel(supabase);
  let matchesScanned=0,predictionsCreated=0,oddsStored=0;
  for (const m of filtered) {
    const saved=await upsertMatch(supabase,m);
    if (!saved) continue;
    matchesScanned++;
    const market=marketProbabilities(m);
    const prices=[["home",market.odds.home],["draw",market.odds.draw],["away",market.odds.away]].filter(([,v])=>v) as [string,number][];
    if (prices.length) {
      const {error}=await supabase.from("football_odds").insert(prices.map(([selection,odds])=>({
        match_id:saved.id,bookmaker:"Football Soccer API / exchange",market:"1X2",selection,odds,
        captured_at:nowIso(),raw:safeJson(m)
      })));
      if (!error) oddsStored+=prices.length;
    }
    if (new Date(saved.kickoff_at).getTime()<=Date.now()) continue;
    const [homeStats,awayStats]=await Promise.all([
      Promise.resolve(teamCache.get(saved.home_team)||teamStatsFromRows([])),
      Promise.resolve(teamCache.get(saved.away_team)||teamStatsFromRows([]))
    ]);
    const built=buildFeatures(m,homeStats,awayStats);
    const prediction=predictWithWeights(built.features,model);
    const oe=oddsEngine(prediction,market),chosen=choosePrediction(prediction,oe);
    const confidence=Math.max(35,Math.min(95,chosen.probability*100));
    const featureVector={
      features:built.features,probabilities:prediction,odds:market.odds,
      market_probabilities:market.probabilities,odds_engine:oe,metadata:built.meta
    };
    const {data:existing}=await supabase.from("football_ai_predictions").select("id")
      .eq("match_id",saved.id).eq("status","OPEN").limit(1);
    if (existing?.length) continue;
    const reasoning={
      engine:"learned-multinomial",feature_version:FEATURE_VERSION,
      model_version:model.model_version||MODEL_NAME,data_quality:built.meta.data_quality,
      xg:{home:extractXg(m,"home"),away:extractXg(m,"away"),source:built.meta.xg_source},
      injuries:{available:false,source:built.meta.injuries_source},
      odds_engine:oe,
      feature_summary:{
        home_form:homeStats.form,away_form:awayStats.form,
        home_goal_diff:homeStats.goalDiff,away_goal_diff:awayStats.goalDiff,
        league_position_edge:built.features.position_edge,travel_load:built.features.travel_load
      }
    };
    const {data:created,error}=await supabase.from("football_ai_predictions").insert({
      match_id:saved.id,prediction:outcomeLabel(chosen.outcome,m),selected_outcome:chosen.outcome,
      confidence,implied_probability:market.odds[chosen.outcome]?(1/market.odds[chosen.outcome])*100:null,
      odds:market.odds[chosen.outcome],value_percent:oe[chosen.outcome]?.value_percent,
      model_score:confidence,reasoning,feature_vector:featureVector,feature_version:FEATURE_VERSION,
      model_version:model.model_version||MODEL_NAME,provider:"football-soccer-api + local-learning-model",
      model:MODEL_NAME,status:"OPEN"
    }).select("id").single();
    if (error||!created) continue;
    predictionsCreated++;
    await supabase.from("football_ai_features").upsert({
      match_id:saved.id,feature_version:FEATURE_VERSION,feature_vector:featureVector,data_quality:built.meta.data_quality
    },{onConflict:"match_id,feature_version"});
    if (predictionsCreated<=2 && (chosen.value==null || chosen.value>1 || confidence>60)) {
      const ai=await enrichPredictionWithAi(m,{
        prediction:outcomeLabel(chosen.outcome,m),probabilities:prediction,odds:market.odds,
        value:oe[chosen.outcome]?.value_percent,features:built.features
      },built.meta);
      if (ai.summary||ai.groq||ai.openai) {
        const adjusted=Math.max(35,Math.min(95,confidence+ai.confidenceAdjustment));
        await supabase.from("football_ai_predictions").update({
          confidence:adjusted,model_score:adjusted,
          llm_reasoning:JSON.stringify({groq:ai.groq,openai:ai.openai,summary:ai.summary,risk:ai.risk}),
          reasoning:{...reasoning,llm:{summary:ai.summary,risk:ai.risk}}
        }).eq("id",created.id);
      }
    }
  }
  await supabase.from("football_ai_runs").insert({
    run_type:runType,matches_scanned:matchesScanned,predictions_created:predictionsCreated,
    provider:"football-soccer-api + learning-engine",status:"SUCCESS",started_at:nowIso(),finished_at:nowIso()
  });
  return {matchesScanned,oddsStored,predictionsCreated};
}

async function runPipeline(supabase:any) {
  const started=Date.now();
  const [fixturesBody,upcomingBody,resultsBody]=await Promise.all([
    footballApi("/fixtures/today",{limit:"1000"}),
    footballApi("/fixtures/upcoming",{days:"2",limit:"1000"}),
    footballApi("/results/yesterday",{limit:"1000"})
  ]);
  const todayRows=Array.isArray(fixturesBody?.data)?fixturesBody.data:[];
  const upcomingRows=Array.isArray(upcomingBody?.data)?upcomingBody.data:[];
  const resultRows=Array.isArray(resultsBody?.data)?resultsBody.data:[];
  const fixtureRows=Array.from(new Map(
    [...todayRows,...upcomingRows]
      .filter((row:any)=>row?.match_id||row?.id)
      .map((row:any)=>[String(row.match_id||row.id),row])
  ).values());
  for (const row of resultRows.filter(isEuropeanMatch)) await upsertMatch(supabase,row);
  const evaluatedBefore=await evaluatePredictions(supabase);
  const modelBefore=evaluatedBefore ? await retrainModel(supabase) : await getModel(supabase);
  const sync=await syncRows(supabase,fixtureRows,"DAILY_EUROPE_AI_SCAN");
  const evaluatedAfter=await evaluatePredictions(supabase);
  const modelAfter=evaluatedAfter ? await retrainModel(supabase) : modelBefore;
  return {
    ok:true,duration_ms:Date.now()-started,
    fixtures:fixtureRows.filter(isEuropeanMatch).length,
    settled_yesterday:resultRows.filter(isEuropeanMatch).length,
    evaluated:evaluatedBefore+evaluatedAfter,retrained:Boolean(evaluatedBefore||evaluatedAfter),
    model:{
      name:modelAfter?.model_name||MODEL_NAME,version:modelAfter?.model_version||MODEL_NAME,
      training_samples:modelAfter?.training_samples||0,accuracy:modelAfter?.accuracy??null,
      roi:modelAfter?.roi??null,brier_score:modelAfter?.brier_score??null
    },
    sync
  };
}

Deno.serve(async (req)=>{
  if (req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  try {
    const url=new URL(req.url),action=url.searchParams.get("action")||"health";
    if (action==="health") {
      const configured=Boolean(getFootballKey()); let usage=null;
      if (configured) {
        try { usage=(await footballApi("/usage"))?.data||null; }
        catch(e) { usage={error:e instanceof Error?e.message:String(e)}; }
      }
      return json({
        ok:configured&&!usage?.error,service:"football-ai",
        pipeline:"Football API -> features -> learned model -> odds -> value -> results -> evaluation -> retraining",
        provider:"football-soccer-api",footballApiConfigured:configured,
        groqConfigured:Boolean(Deno.env.get("GROQ_API_KEY")),
        openaiConfigured:Boolean(Deno.env.get("OPENAI_API_KEY")),usage
      });
    }
    const secretKey=getSupabaseSecretKey();
    if (!secretKey) return json({ok:false,error:"Supabase secret key is not available to the Edge Function"},500);
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,secretKey);

    if (action==="sync"||action==="pipeline") return json(await runPipeline(supabase));
    if (action==="evaluate") {
      const evaluated=await evaluatePredictions(supabase);
      const model=evaluated?await retrainModel(supabase):await getModel(supabase);
      return json({ok:true,evaluated,model});
    }
    if (action==="train") return json({ok:true,model:await retrainModel(supabase)});

    if (action==="history") {
      const from=url.searchParams.get("from")||new Date(Date.now()-30*86400000).toISOString().slice(0,10);
      const to=url.searchParams.get("to")||new Date().toISOString().slice(0,10);
      const start=new Date(from+"T00:00:00.000Z"),end=new Date(to+"T23:59:59.999Z");
      const {data:matches,error:matchError}=await supabase.from("football_matches")
        .select("id,league,kickoff_at,home_team,away_team,status,home_score,away_score")
        .gte("kickoff_at",start.toISOString()).lte("kickoff_at",end.toISOString())
        .order("kickoff_at",{ascending:false}).limit(1000);
      if(matchError) throw matchError;
      const ids=(matches||[]).map((m:any)=>m.id);
      let predictions:any[]=[];
      if(ids.length){
        const {data:rows,error}=await supabase.from("football_ai_predictions")
          .select("id,match_id,prediction,selected_outcome,confidence,implied_probability,odds,value_percent,model_score,status,reasoning,model_version,provider,model,created_at,evaluated_at,pnl,settled_result")
          .in("match_id",ids).order("created_at",{ascending:false}).limit(1000);
        if(error) throw error;
        predictions=rows||[];
      }
      const matchMap=new Map((matches||[]).map((m:any)=>[m.id,m]));
      const rows=predictions.map((p:any)=>({...p,match:matchMap.get(p.match_id)||null}));
      const settled=rows.filter((p:any)=>p.status==="WON"||p.status==="LOST"||p.status==="VOID");
      const wins=settled.filter((p:any)=>p.status==="WON").length;
      const losses=settled.filter((p:any)=>p.status==="LOST").length;
      const voids=settled.filter((p:any)=>p.status==="VOID").length;
      const pnl=settled.reduce((s:number,p:any)=>s+num(p.pnl),0);
      const value=rows.filter((p:any)=>p.value_percent!=null&&num(p.value_percent)>0);
      const leagues:any={};
      for(const p of settled){
        const league=p.match?.league||"Ukjent";
        if(!leagues[league]) leagues[league]={league,wins:0,losses:0,voids:0,pnl:0};
        leagues[league].wins+=p.status==="WON"?1:0;
        leagues[league].losses+=p.status==="LOST"?1:0;
        leagues[league].voids+=p.status==="VOID"?1:0;
        leagues[league].pnl+=num(p.pnl);
      }
      const {data:model}=await supabase.from("football_ai_model_weights")
        .select("model_name,model_version,training_samples,accuracy,roi,brier_score,log_loss,updated_at")
        .eq("model_name",MODEL_NAME).maybeSingle();
      return json({
        ok:true,from,to,predictions:rows,
        summary:{total:rows.length,settled:settled.length,wins,losses,voids,hit_rate:settled.length?wins/settled.length*100:null,pnl,roi_per_prediction:settled.length?pnl/settled.length*100:null,value_candidates:value.length},
        leagues:Object.values(leagues).sort((a:any,b:any)=>b.pnl-a.pnl),
        model:model||null
      });
    }

    if (action==="dashboard") {
      const date=url.searchParams.get("date")||new Date().toISOString().slice(0,10);
      const start=new Date(date+"T00:00:00.000Z"),end=new Date(date+"T23:59:59.999Z");
      const {data:matches,error:matchError}=await supabase.from("football_matches")
        .select("id,league,kickoff_at,home_team,away_team,status,home_score,away_score,home_xg,away_xg,venue")
        .gte("kickoff_at",start.toISOString()).lte("kickoff_at",end.toISOString())
        .order("kickoff_at",{ascending:true}).limit(200);
      if (matchError) throw matchError;
      const ids=(matches||[]).map((m:any)=>m.id); let predictions:any[]=[];
      if (ids.length) {
        const {data:rows,error}=await supabase.from("football_ai_predictions")
          .select("id,match_id,prediction,selected_outcome,confidence,implied_probability,odds,value_percent,model_score,status,reasoning,feature_vector,model_version,provider,model,created_at,evaluated_at,pnl")
          .in("match_id",ids).order("created_at",{ascending:false});
        if (error) throw error; predictions=rows||[];
      }
      const {data:model}=await supabase.from("football_ai_model_weights")
        .select("model_name,model_version,training_samples,accuracy,roi,brier_score,log_loss,updated_at")
        .eq("model_name",MODEL_NAME).maybeSingle();
      const {data:recent}=await supabase.from("football_ai_evaluations")
        .select("correct,pnl,brier_score,log_loss,evaluated_at").order("evaluated_at",{ascending:false}).limit(500);
      const n=recent?.length||0,wins=recent?.filter((r:any)=>r.correct).length||0;
      return json({
        ok:true,date,matches:matches||[],predictions,
        engine:{
          model:model||null,
          evaluation:{
            samples:n,accuracy:n?wins/n*100:null,
            roi_percent_per_unit:n?recent.reduce((s:number,r:any)=>s+num(r.pnl),0)/n*100:null
          },
          pipeline:["Football API","Feature Engineering","AI Prediction Engine","Probability + Confidence","Odds Engine","Value Finder","Daily Predictions","Result Evaluation","Model Learning","Retrain / Update"]
        }
      });
    }
    return json({ok:false,error:"Unknown action",supported:["health","pipeline","sync","dashboard","history","evaluate","train"]},400);
  } catch(error) {
    return json({ok:false,error:error instanceof Error?error.message:String(error)},500);
  }
});
