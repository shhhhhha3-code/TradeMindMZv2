// Runtime redeploy marker: verify current Football AI Edge Function source is deployed.
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
  "albania","andorra","armenia","austria","azerbaijan","belarus","belgium","bosnia",
  "bosnia and herzegovina","bulgaria","croatia","cyprus","czech republic","czechia",
  "denmark","england","estonia","faroe islands","finland","france","georgia","united kingdom",
  "germany","gibraltar","greece","hungary","iceland","ireland","italy",
  "kazakhstan","kosovo","latvia","liechtenstein","lithuania","luxembourg","malta",
  "moldova","monaco","montenegro","netherlands","north macedonia","northern ireland",
  "norway","poland","portugal","romania","russia","san marino","scotland","serbia","republic of ireland","slovak republic",
  "slovakia","slovenia","spain","sweden","switzerland","turkey","ukraine","wales",
]);

const EUROPEAN_COMPETITIONS = [
  "champions league","europa league","conference league","uefa champions league",
  "uefa europa league","uefa conference league","nations league","uefa nations league",
  "european championship","euro championship","euro qualification","euro qualifiers",
  "uefa super cup","super cup",
];

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

// ---------------- API-Football odds provider ----------------
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";
const API_FOOTBALL_MAX_PAGES_PER_DATE = 4;
const API_FOOTBALL_ODDS_REFRESH_HOURS = 6;

function getApiFootballKey() {
  return Deno.env.get("API_FOOTBALL_KEY") || "";
}

async function apiFootball(path:string, params:Record<string,string> = {}) {
  const key=getApiFootballKey();
  if (!key) return {ok:false, response:[], errors:["API_FOOTBALL_KEY is not configured"]};
  const url=new URL(API_FOOTBALL_BASE+path);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
  let lastError="API-Football request failed";
  for (let attempt=0; attempt<3; attempt++) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(url,{
        headers:{"x-apisports-key":key,Accept:"application/json"},
        signal:controller.signal
      });
      const body=await response.json();
      const retryable=response.status===429 || response.status>=500;
      if (!response.ok) {
        lastError=`HTTP ${response.status}`;
        if (retryable && attempt<2) {
          await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
          continue;
        }
        return {ok:false,response:[],errors:[lastError],raw:body};
      }
      if (Array.isArray(body?.errors) && body.errors.length) {
        lastError=body.errors.join(", ");
        if (attempt<2 && /rate|limit|too many|temporar/i.test(lastError)) {
          await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
          continue;
        }
        return {ok:false,response:[],errors:body.errors,raw:body};
      }
      return {ok:true,response:Array.isArray(body?.response)?body.response:[],paging:body?.paging||{},remaining:response.headers.get("x-ratelimit-requests-remaining")};
    } catch (error) {
      lastError=error instanceof DOMException && error.name==="AbortError" ? "API-Football timeout" : (error instanceof Error ? error.message : "API-Football request failed");
      if (attempt<2) {
        await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
        continue;
      }
      return {ok:false,response:[],errors:[lastError]};
    } finally {
      clearTimeout(timer);
    }
  }
  return {ok:false,response:[],errors:[lastError]};
}

function normalizeTeamName(value:any) {
  return String(value||"")
    .normalize("NFD").replace(/\p{Diacritic}/gu,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
    .replace(/\b(fc|afc|cf|sc|ac|fk|sk|u17|u18|u19|u20|u21|u23|ii|iii|iv|reserves|reserve|b)\b/g,"")
    .replace(/\s+/g," ").trim();
}

function teamNameSimilarity(a:any,b:any) {
  const aa=new Set(normalizeTeamName(a).split(" ").filter(Boolean));
  const bb=new Set(normalizeTeamName(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let common=0; for (const token of aa) if (bb.has(token)) common++;
  return common/Math.max(aa.size,bb.size);
}

function extractApiFootball1x2(row:any) {
  const bookmakers=Array.isArray(row?.bookmakers)?row.bookmakers:[];
  const candidates:any[]=[];
  for (const bookmaker of bookmakers) {
    for (const bet of (Array.isArray(bookmaker?.bets)?bookmaker.bets:[])) {
      const betName=String(bet?.name||"").toLowerCase();
      if (!betName.includes("match winner") && betName!=="1x2") continue;
      const values=Array.isArray(bet?.values)?bet.values:[];
      const find=(names:string[])=>values.find((v:any)=>names.includes(String(v?.value||"").toLowerCase()));
      const home=find(["home","1"]), draw=find(["draw","x"]), away=find(["away","2"]);
      const odds={home:num(home?.odd,0),draw:num(draw?.odd,0),away:num(away?.odd,0)};
      if (odds.home>1 && odds.draw>1 && odds.away>1) {
        candidates.push({
          bookmaker:String(bookmaker?.name||"API-Football"),
          bookmaker_id:bookmaker?.id??null,
          odds,
          updated_at:row?.update||null,
          fixture_id:row?.fixture?.id??null
        });
      }
    }
  }
  return candidates;
}

function findApiFootballOdds(match:any, rows:any[]) {
  const kickoff=new Date(match.kickoff_at).getTime();
  let best:any=null, bestScore=-1;
  for (const row of rows) {
    const home=row?.teams?.home?.name, away=row?.teams?.away?.name;
    const homeScore=teamNameSimilarity(match.home_team,home);
    const awayScore=teamNameSimilarity(match.away_team,away);
    const time=new Date(row?.fixture?.date||"").getTime();
    const hours=Number.isFinite(kickoff)&&Number.isFinite(time)?Math.abs(kickoff-time)/3600000:99;
    if (homeScore<0.5 || awayScore<0.5 || hours>6) continue;
    const score=homeScore+awayScore-Math.min(hours/24,0.25);
    if (score>bestScore) {
      const candidates=extractApiFootball1x2(row);
      if (candidates.length) {
        const selected=candidates.reduce((a,b)=>(
          ["home","draw","away"].reduce((s,k)=>s+(b.odds[k]||0),0) >
          ["home","draw","away"].reduce((s,k)=>s+(a.odds[k]||0),0) ? b : a
        ));
        best={...selected,match_score:score};
        bestScore=score;
      }
    }
  }
  return best;
}

async function fetchApiFootballOddsDates(dates:string[]) {
  const rows:any[]=[];
  if (!getApiFootballKey()) return {rows,requests:0,remaining:null,error:"API_FOOTBALL_KEY missing"};
  const results=await Promise.all(dates.slice(0,2).map(async (date)=>{
    const dateRows:any[]=[];
    let requests=0,remaining:any=null,error:string|null=null;
    for (let page=1; page<=API_FOOTBALL_MAX_PAGES_PER_DATE; page++) {
      const result=await apiFootball("/odds",{date,timezone:"UTC",page:String(page)});
      requests++;
      remaining=result.remaining??remaining;
      if (!result.ok) {
        error=(result.errors||[]).join(", ");
        break;
      }
      dateRows.push(...result.response);
      const total=Number(result?.paging?.total||1);
      if (page>=total || page>=API_FOOTBALL_MAX_PAGES_PER_DATE || Number(remaining)<=10) break;
    }
    return {dateRows,requests,remaining,error};
  }));
  for (const result of results) {
    rows.push(...result.dateRows);
  }
  const errors=results.map(r=>r.error).filter(Boolean);
  return {
    rows,
    requests:results.reduce((s,r)=>s+r.requests,0),
    remaining:results.map(r=>r.remaining).filter(v=>v!=null).pop()??null,
    error:errors.length?errors.join(" | "):null
  };
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

function normalizedText(value:any) {
  return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
}

function isAllowedEuropeanCompetition(m:any) {
  const raw=m?.raw||{};
  const league=normalizedText(m?.league_name||m?.league||raw?.league_name||raw?.league||raw?.competition_name||raw?.competition);
  const type=normalizedText(raw?.league_type||raw?.competition_type||raw?.type||m?.league_type||m?.competition_type);

  // Only European leagues/cups/UEFA competitions are allowed into the AI universe.
  // Explicit friendlies/test matches are excluded even when the country is European.
  const excluded=[
    "friendly","friendlies","club friendly","international friendly","friendly matches",
    "test match","test matches","testimonial","charity match"
  ];
  if(excluded.some((name)=>league.includes(name)||type.includes(name))) return false;

  const cupOrCompetition=EUROPEAN_COMPETITIONS.some((name)=>league.includes(normalizedText(name)));
  const leagueLike=!type.includes("friendly") && (
    type.includes("league") ||
    type.includes("cup") ||
    type.includes("competition") ||
    type.includes("domestic") ||
    (!type && Boolean(league))
  );
  return cupOrCompetition || leagueLike;
}

function isEuropeanMatch(m: any) {
  const raw=m?.raw||{};
  const country=normalizedText(m?.country_name||m?.country||raw?.country_name||raw?.country||raw?.countryName);
  return EUROPEAN_COUNTRIES.has(country) && isAllowedEuropeanCompetition(m);
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
      edge:odds && implied != null ? p-implied : null,
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

function classifyCompetition(leagueName:string) {
  const n=String(leagueName||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const cupPatterns=[
    "cup","copa","pokal","beker","coupe","coppa","taca","trophy","shield",
    "super cup","supercup","community shield","champions league","europa league",
    "conference league","nations league","world cup","euro","qualification"
  ];
  return cupPatterns.some((x)=>n.includes(x)) ? "cup" : "league";
}

function matchRecord(m:any) {
  const externalId=String(m.match_id||m.id||"");
  if (!externalId) return null;
  const rawKickoff=m.kickoff_utc ?? m.kickoff ?? m.kickoff_at;
  const kickoff=typeof rawKickoff==="number" ? new Date(rawKickoff*1000).toISOString() : String(rawKickoff||"");
  if (!kickoff) return null;
  return {
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
  };
}

async function upsertMatch(supabase:any,m:any) {
  const row=matchRecord(m);
  if (!row) return null;
  const {data,error}=await supabase.from("football_matches").upsert(row,{onConflict:"external_id"}).select("*").single();
  if (error) throw error;
  return data;
}

async function evaluatePredictions(supabase:any) {
  const {data:predictions,error}=await supabase.from("football_ai_predictions")
    .select("id,match_id,prediction,confidence,odds,selected_outcome,feature_vector,model_version,status")
    .eq("status","OPEN").limit(500);
  if (error) throw error;
  if (!predictions?.length) return 0;

  const matchIds=[...new Set(predictions.map((p:any)=>p.match_id).filter(Boolean))];
  const {data:matches,error:matchError}=await supabase.from("football_matches")
    .select("id,home_team,away_team,home_score,away_score,status")
    .in("id",matchIds);
  if (matchError) throw matchError;

  const matchMap=new Map((matches||[]).map((m:any)=>[m.id,m]));
  const evaluations:any[]=[];
  const wonIds:string[]=[];
  const lostIds:string[]=[];
  const voidIds:string[]=[];

  for (const p of predictions) {
    const match:any=matchMap.get(p.match_id);
    if (!match) continue;
    const matchStatus=String(match.status||"").toLowerCase();
    const isVoid=["cancelled","canceled","postponed","abandoned","suspended"].includes(matchStatus);
    if (isVoid) {
      voidIds.push(p.id);
      evaluations.push({
        prediction_id:p.id,match_id:p.match_id,actual_result:null,predicted_result:null,
        correct:false,stake:1,pnl:null,brier_score:null,log_loss:null,evaluated_at:nowIso()
      });
      continue;
    }
    if (!["finished","finished_after_extra_time","awarded"].includes(matchStatus)) continue;
    const actual=resultFromScore(match.home_score,match.away_score);
    if (!actual) continue;

    let selected=p.selected_outcome;
    if (!selected) {
      if (p.prediction===match.home_team) selected="home";
      else if (p.prediction===match.away_team) selected="away";
      else if (String(p.prediction).toLowerCase().includes("uavgjort")) selected="draw";
    }
    if (!selected) continue;

    const correct=selected===actual;
    const odds=num(p.odds,0);
    const pnl=odds>1 ? (correct ? odds-1 : -1) : null;
    const probs=p.feature_vector?.probabilities;
    const brier=probs ? ["home","draw","away"].reduce((sum,k)=>sum+Math.pow(num(probs[k])-(actual===k?1:0),2),0)/3 : null;
    const logLoss=probs ? -Math.log(Math.max(0.000001,Math.min(0.999999,num(probs[actual])))) : null;

    evaluations.push({
      prediction_id:p.id,match_id:p.match_id,actual_result:actual,predicted_result:selected,
      correct,stake:1,pnl,brier_score:brier,log_loss:logLoss,evaluated_at:nowIso()
    });
    (correct?wonIds:lostIds).push(p.id);
  }

  if (!evaluations.length) return 0;

  const {error:evalError}=await supabase.from("football_ai_evaluations")
    .upsert(evaluations,{onConflict:"prediction_id"});
  if (evalError) throw evalError;

  const [wonResult,lostResult,voidResult]=await Promise.all([
    wonIds.length ? supabase.from("football_ai_predictions").update({status:"WON"}).in("id",wonIds) : Promise.resolve({error:null}),
    lostIds.length ? supabase.from("football_ai_predictions").update({status:"LOST"}).in("id",lostIds) : Promise.resolve({error:null}),
    voidIds.length ? supabase.from("football_ai_predictions").update({status:"VOID"}).in("id",voidIds) : Promise.resolve({error:null})
  ]);
  if (wonResult.error) throw wonResult.error;
  if (lostResult.error) throw lostResult.error;
  if (voidResult.error) throw voidResult.error;

  const updateRows=evaluations.map((e:any)=>({
    id:e.prediction_id,settled_result:e.actual_result,pnl:e.pnl,evaluated_at:e.evaluated_at
  }));
  const {error:updateError}=await supabase.from("football_ai_predictions").upsert(updateRows,{onConflict:"id"});
  if (updateError) throw updateError;
  return evaluations.length;
}

async function retrainModel(supabase:any) {
  const model=await getModel(supabase);
  const {data:evaluations}=await supabase.from("football_ai_evaluations")
    .select("prediction_id,actual_result").order("evaluated_at",{ascending:true}).limit(5000);
  const evaluationRows:any[]=(evaluations||[]).filter((e:any)=>["home","draw","away"].includes(String(e.actual_result)));
  if(!evaluationRows.length) return model;

  const ids=evaluationRows.map((e:any)=>e.prediction_id);
  const {data:predictions}=await supabase.from("football_ai_predictions")
    .select("id,match_id,feature_vector").in("id",ids);
  const matchIds=[...new Set((predictions||[]).map((p:any)=>p.match_id).filter(Boolean))];
  const {data:trainingMatches}=matchIds.length
    ? await supabase.from("football_matches").select("id,raw,league").in("id",matchIds)
    : {data:[]};
  const europeanMatchIds=new Set((trainingMatches||[]).filter(isEuropeanMatch).map((m:any)=>String(m.id)));
  const europeanPredictions=(predictions||[]).filter((p:any)=>europeanMatchIds.has(String(p.match_id)));
  const europeanPredictionIds=new Set(europeanPredictions.map((p:any)=>String(p.id)));
  const europeanEvaluationRows=evaluationRows.filter((e:any)=>europeanPredictionIds.has(String(e.prediction_id)));
  if(!europeanEvaluationRows.length) return model;
  const byId:Map<string,any>=new Map(europeanPredictions.map((p:any)=>[String(p.id),p]));

  const initial=defaultWeights();
  const next={
    ...model,
    weights:{home:[...initial.weights.home],draw:[...initial.weights.draw],away:[...initial.weights.away]},
    bias:{...initial.bias}
  };
  const classes:any[]=["home","draw","away"],lr=num(model.learning_rate,0.018);
  let samples=0;
  for(const ev of europeanEvaluationRows){
    const features=byId.get(String(ev.prediction_id))?.feature_vector?.features;
    if(!features) continue;
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

  const predictionIds=europeanEvaluationRows.map((e:any)=>e.prediction_id);
  const {data:metricPredictions}=predictionIds.length
    ? await supabase.from("football_ai_predictions").select("id,match_id").in("id",predictionIds)
    : {data:[]};
  const metricMatchIds=[...new Set((metricPredictions||[]).map((p:any)=>p.match_id).filter(Boolean))];
  const {data:metricMatches}=metricMatchIds.length
    ? await supabase.from("football_matches").select("id,raw,league").in("id",metricMatchIds)
    : {data:[]};
  const metricEuropeanIds=new Set((metricMatches||[]).filter(isEuropeanMatch).map((m:any)=>String(m.id)));
  const metricEuropeanPredictionIds=new Set((metricPredictions||[]).filter((p:any)=>metricEuropeanIds.has(String(p.match_id))).map((p:any)=>String(p.id)));
  const {data:metrics}=await supabase.from("football_ai_evaluations")
    .select("prediction_id,correct,pnl,brier_score,log_loss").in("prediction_id",[...metricEuropeanPredictionIds]).order("evaluated_at",{ascending:false}).limit(5000);
  const metricRows:any[]=metrics||[];
  const settledMetricRows=metricRows.filter((r:any)=>r.pnl!=null&&r.correct!=null);
  const count=settledMetricRows.length,wins=settledMetricRows.filter((r:any)=>r.correct===true).length;
  const brierRows:any[]=metricRows.filter((r:any)=>r.brier_score!=null);
  const logRows:any[]=metricRows.filter((r:any)=>r.log_loss!=null);
  const row={
    model_name:MODEL_NAME,model_version:`${MODEL_NAME}-r${samples}`,weights:next.weights,bias:next.bias,
    learning_rate:lr,training_samples:samples,
    accuracy:count?wins/count:null,
    roi:count?settledMetricRows.reduce((s:number,r:any)=>s+num(r.pnl),0)/count:null,
    brier_score:brierRows.length?brierRows.reduce((s:number,r:any)=>s+num(r.brier_score),0)/brierRows.length:null,
    log_loss:logRows.length?logRows.reduce((s:number,r:any)=>s+num(r.log_loss),0)/logRows.length:null,
    updated_at:nowIso()
  };
  await supabase.from("football_ai_model_weights").upsert(row,{onConflict:"model_name"});
  return row;
}

async function loadTeamLogoCache(supabase:any) {
  const {data,error}=await supabase.from("football_team_assets").select("team_key,team_name,logo_url");
  if (error) return new Map<string,string>();
  return new Map((data||[]).filter((r:any)=>r.logo_url).map((r:any)=>[String(r.team_key),String(r.logo_url)]));
}

function apiFootballCountryName(country:any) {
  const key=normalizedText(country).replace(/[^a-z0-9]+/g," ");
  const aliases:any={
    "bosnia and herzegovina":"Bosnia",
    "czech republic":"Czech-Republic",
    "faroe islands":"Faroe-Islands",
    "north macedonia":"North-Macedonia",
    "republic of ireland":"Ireland",
    "slovak republic":"Slovakia",
    "united kingdom":"England"
  };
  return aliases[key]||String(country||"").trim();
}

async function resolveTeamLogos(supabase:any,matches:any[]) {
  const cache=await loadTeamLogoCache(supabase);
  if (!getApiFootballKey()) return cache;
  const missing=new Map<string,{name:string,country:string}>();
  for (const m of matches.slice(0,40)) {
    for (const side of ["home","away"]) {
      const name=String(m?.[side+"_team"]||"").trim();
      const key=normalizeTeamName(name);
      if (!key || cache.has(key)) continue;
      const country=String(m?.raw?.country_name||m?.raw?.country||m?.country_name||"").trim();
      missing.set(key,{name,country});
    }
  }
  if (!missing.size) return cache;

  const countries=[...new Set([...missing.values()].map(x=>x.country).filter(Boolean))].slice(0,8);
  for (const country of countries) {
    const result=await apiFootball("/teams",{country:apiFootballCountryName(country)});
    if (!result.ok) continue;
    for (const row of result.response||[]) {
      const team=row?.team||{};
      const logo=typeof team.logo==="string"&&/^https?:\/\//.test(team.logo)?team.logo:null;
      if (!logo||!team.name) continue;
      const key=normalizeTeamName(team.name);
      const requested=[...missing.entries()].filter(([,x])=>x.country===country);
      let best:any=null,bestScore=0;
      for (const [requestedKey,x] of requested) {
        const score=teamNameSimilarity(x.name,team.name);
        if (score>bestScore){bestScore=score;best={requestedKey,x};}
      }
      if (best && bestScore>=0.5) {
        cache.set(best.requestedKey,logo);
        await supabase.from("football_team_assets").upsert({
          team_key:best.requestedKey,team_name:best.x.name,country,
          provider_team_id:team.id!=null?String(team.id):null,logo_url:logo,source:"API-Football",updated_at:nowIso()
        },{onConflict:"team_key"});
      }
      if (key && !cache.has(key)) cache.set(key,logo);
    }
  }
  return cache;
}

async function syncRows(supabase:any,rows:any[],runType:string,externalOddsRows:any[] = []) {
  const started=Date.now();
  const filtered=rows.filter(isEuropeanMatch);
  const [teamCache,model]=await Promise.all([loadAllTeamHistory(supabase),getModel(supabase)]);
  const payloads=filtered.map(matchRecord).filter(Boolean);

  if (!payloads.length) {
    await supabase.from("football_ai_runs").insert({
      run_type:runType,matches_scanned:0,predictions_created:0,
      provider:"football-soccer-api + learning-engine",status:"SUCCESS",started_at:nowIso(),finished_at:nowIso()
    });
    return {matchesScanned:0,oddsStored:0,predictionsCreated:0,duration_ms:Date.now()-started};
  }

  const {error:matchError}=await supabase.from("football_matches")
    .upsert(payloads,{onConflict:"external_id"});
  if (matchError) throw matchError;

  // Re-read by external_id so every downstream prediction/odds row has a real FK id.
  const externalIds=payloads.map((p:any)=>String(p.external_id)).filter(Boolean);
  const {data:savedRows,error:savedError}=externalIds.length
    ? await supabase.from("football_matches").select("*").in("external_id",externalIds)
    : {data:[],error:null};
  if (savedError) throw savedError;
  const saved=(savedRows||[]).filter((row:any)=>row?.id);
  if (saved.length !== externalIds.length) {
    throw new Error(`football_matches FK lookup incomplete: expected ${externalIds.length}, got ${saved.length}`);
  }
  const providerByExternal=new Map(filtered.map((m:any)=>[String(m.match_id||m.id),m]));
  const logoCache=await resolveTeamLogos(supabase,saved);
  const existingIds=saved.map((m:any)=>m.id).filter(Boolean);
  const existingOpen:any[]=[];
  for (let i=0;i<existingIds.length;i+=100) {
    const chunk=existingIds.slice(i,i+100);
    const {data,error}=await supabase.from("football_ai_predictions")
      .select("id,match_id,confidence,feature_vector,reasoning,model_version")
      .in("match_id",chunk).eq("status","OPEN");
    if (error) throw error;
    existingOpen.push(...(data||[]));
  }
  const existingByMatch=new Map(existingOpen.map((p:any)=>[String(p.match_id),p]));

  const oddsRows:any[]=[];
  const newPredictions:any[]=[];
  const featureRows:any[]=[];
  const enrichQueue:any[]=[];

  for (const savedMatch of saved) {
    const m=providerByExternal.get(String(savedMatch.external_id));
    if (!m) continue;

    const externalOdds=findApiFootballOdds(savedMatch,externalOddsRows);
    const baseMarket=marketProbabilities(m);
    const market=externalOdds
      ? {odds:externalOdds.odds,probabilities:baseMarket.probabilities}
      : baseMarket;
    const prices=[["home",market.odds.home],["draw",market.odds.draw],["away",market.odds.away]]
      .filter(([,v])=>v) as [string,number][];

    for (const [selection,odds] of prices) {
      oddsRows.push({
        match_id:savedMatch.id,bookmaker:externalOdds ? `API-Football / ${externalOdds.bookmaker}` : "Football Soccer API / exchange",
        market:"1X2",selection,odds,captured_at:nowIso(),raw:safeJson(externalOdds||m)
      });
    }

    if (new Date(savedMatch.kickoff_at).getTime()<=Date.now()) continue;

    const existing=existingByMatch.get(String(savedMatch.id));
    if (existing && externalOdds) {
      const currentFeatures=existing.feature_vector?.probabilities;
      if (currentFeatures) {
        const refreshedOdds=oddsEngine(currentFeatures,{odds:externalOdds.odds});
        const refreshedChosen=choosePrediction(currentFeatures,refreshedOdds);
        const refreshedReasoning={
          ...(existing.reasoning||{}),
          odds_engine:refreshedOdds,
          odds_source:`API-Football / ${externalOdds.bookmaker}`
        };
        await supabase.from("football_ai_predictions").update({
          prediction:outcomeLabel(refreshedChosen.outcome,m),
          selected_outcome:refreshedChosen.outcome,
          confidence:Math.max(35,Math.min(95,refreshedChosen.probability*100)),
          implied_probability:externalOdds.odds[refreshedChosen.outcome]?(1/externalOdds.odds[refreshedChosen.outcome])*100:null,
          odds:externalOdds.odds[refreshedChosen.outcome]||null,
          value_percent:refreshedOdds[refreshedChosen.outcome]?.value_percent??null,
          reasoning:refreshedReasoning,
          feature_vector:{...(existing.feature_vector||{}),odds:externalOdds.odds,odds_engine:refreshedOdds}
        }).eq("id",existing.id);
      }
    }
    if (existing) continue;

    const homeStats=teamCache.get(savedMatch.home_team)||teamStatsFromRows([]);
    const awayStats=teamCache.get(savedMatch.away_team)||teamStatsFromRows([]);
    const built=buildFeatures(m,homeStats,awayStats);
    const prediction=predictWithWeights(built.features,model);
    const oe=oddsEngine(prediction,market),chosen=choosePrediction(prediction,oe);
    const confidence=Math.max(35,Math.min(95,chosen.probability*100));
    const featureVector={
      features:built.features,probabilities:prediction,odds:market.odds,
      market_probabilities:market.probabilities,odds_engine:oe,metadata:built.meta
    };
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
    newPredictions.push({
      match_id:savedMatch.id,prediction:outcomeLabel(chosen.outcome,m),selected_outcome:chosen.outcome,
      confidence,implied_probability:market.odds[chosen.outcome]?(1/market.odds[chosen.outcome])*100:null,
      odds:market.odds[chosen.outcome],value_percent:oe[chosen.outcome]?.value_percent,
      model_score:confidence,reasoning,feature_vector:featureVector,feature_version:FEATURE_VERSION,
      model_version:model.model_version||MODEL_NAME,
      provider:externalOdds ? "football-soccer-api + API-Football odds + local-learning-model" : "football-soccer-api + local-learning-model",
      model:MODEL_NAME,status:"OPEN"
    });
    featureRows.push({
      match_id:savedMatch.id,feature_version:FEATURE_VERSION,feature_vector:featureVector,data_quality:built.meta.data_quality
    });
    if (enrichQueue.length<2 && (chosen.value==null || chosen.value>1 || confidence>60)) {
      enrichQueue.push({
        providerMatch:m,matchId:savedMatch.id,prediction:outcomeLabel(chosen.outcome,m),
        confidence,probabilities:prediction,odds:market.odds,value:oe[chosen.outcome]?.value_percent,
        features:built.features,meta:built.meta
      });
    }
  }

  if (oddsRows.length) {
    for (let i=0;i<oddsRows.length;i+=300) {
      const {error}=await supabase.from("football_odds").insert(oddsRows.slice(i,i+300));
      if (error) throw error;
    }
  }

  let created:any[]=[];
  if (newPredictions.length) {
    const {data,error}=await supabase.from("football_ai_predictions").insert(newPredictions).select("id,match_id");
    if (error) throw error;
    created=data||[];
  }
  if (featureRows.length) {
    const {error}=await supabase.from("football_ai_features").upsert(featureRows,{onConflict:"match_id,feature_version"});
    if (error) throw error;
  }

  if (enrichQueue.length && created.length) {
    const createdByMatch=new Map(created.map((x:any)=>[String(x.match_id),x.id]));
    await Promise.all(enrichQueue.map(async (item:any)=>{
      const createdId=createdByMatch.get(String(item.matchId));
      if (!createdId) return;
      const ai=await enrichPredictionWithAi(item.providerMatch,{
        prediction:item.prediction,probabilities:item.probabilities,odds:item.odds,
        value:item.value,features:item.features
      },item.meta);
      if (ai.summary||ai.groq||ai.openai) {
        const adjusted=Math.max(35,Math.min(95,num(item.confidence,0)+ai.confidenceAdjustment));
        await supabase.from("football_ai_predictions").update({
          confidence:adjusted,model_score:adjusted,
          llm_reasoning:JSON.stringify({groq:ai.groq,openai:ai.openai,summary:ai.summary,risk:ai.risk}),
          reasoning:{
            ...newPredictions.find((p:any)=>p.match_id===item.matchId)?.reasoning,
            llm:{summary:ai.summary,risk:ai.risk}
          }
        }).eq("id",createdId);
      }
    }));
  }

  const matchesScanned=saved.length;
  const predictionsCreated=created.length;
  await supabase.from("football_ai_runs").insert({
    run_type:runType,matches_scanned:matchesScanned,predictions_created:predictionsCreated,
    provider:"football-soccer-api + learning-engine",status:"SUCCESS",started_at:nowIso(),finished_at:nowIso()
  });
  return {matchesScanned,oddsStored:oddsRows.length,predictionsCreated,duration_ms:Date.now()-started};
}async function runPipeline(supabase:any, requestedDate:string|null = null, forceOdds=false) {
  const baseDate=/^\d{4}-\d{2}-\d{2}$/.test(String(requestedDate||""))
    ? String(requestedDate)
    : new Date().toISOString().slice(0,10);
  const baseStart=new Date(baseDate+"T00:00:00.000Z");
  const tomorrowDate=new Date(baseStart.getTime()+86400000).toISOString().slice(0,10);
  const yesterdayDate=new Date(baseStart.getTime()-86400000).toISOString().slice(0,10);
  const started=Date.now();
  const [fixturesBody,upcomingBody,resultsBody]=await Promise.all([
    footballApi("/fixtures/today",{date:baseDate,limit:"1000"}),
    footballApi("/fixtures/upcoming",{days:"2",limit:"1000"}),
    footballApi("/results/yesterday",{date:yesterdayDate,limit:"1000"})
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
  const utcHour=new Date().getUTCHours();
  const shouldRefreshOdds=forceOdds || utcHour % API_FOOTBALL_ODDS_REFRESH_HOURS === 0;
  const oddsFetch=shouldRefreshOdds
    ? await fetchApiFootballOddsDates([baseDate,tomorrowDate])
    : {rows:[],requests:0,remaining:null,error:null};
  const sync=await syncRows(supabase,fixtureRows,"DAILY_EUROPE_AI_SCAN",oddsFetch.rows);
  const evaluatedAfter=await evaluatePredictions(supabase);
  const modelAfter=evaluatedAfter ? await retrainModel(supabase) : modelBefore;
  return {
    ok:true,status:"SUCCESS",duration_ms:Date.now()-started,
    fixtures:fixtureRows.filter(isEuropeanMatch).length,
    settled_yesterday:resultRows.filter(isEuropeanMatch).length,
    evaluated:evaluatedBefore+evaluatedAfter,retrained:Boolean(evaluatedBefore||evaluatedAfter),
    model:{
      name:modelAfter?.model_name||MODEL_NAME,version:modelAfter?.model_version||MODEL_NAME,
      training_samples:modelAfter?.training_samples||0,accuracy:modelAfter?.accuracy??null,
      roi:modelAfter?.roi??null,brier_score:modelAfter?.brier_score??null
    },
     sync,
    stages:{
      fixtures:fixtureRows.filter(isEuropeanMatch).length,
      results:resultRows.filter(isEuropeanMatch).length,
      odds_requests:oddsFetch.requests,
      odds_rows:oddsFetch.rows.length,
      predictions_created:sync.predictionsCreated,
      evaluated:evaluatedBefore+evaluatedAfter,
      retrained:Boolean(evaluatedBefore||evaluatedAfter)
    },
    odds:{provider:"API-Football",requests:oddsFetch.requests,rows:oddsFetch.rows.length,remaining:oddsFetch.remaining,error:oddsFetch.error}
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
      const ready=configured && !usage?.error;
      return json({
        ok:true,
        status:ready ? "READY" : "DEGRADED",
        service:"football-ai",
        pipeline:"Football API -> features -> learned model -> odds -> value -> results -> evaluation -> retraining",
        provider:"football-soccer-api",
        footballApiConfigured:configured,
        apiFootballOddsConfigured:Boolean(getApiFootballKey()),
        groqConfigured:Boolean(Deno.env.get("GROQ_API_KEY")),
        openaiConfigured:Boolean(Deno.env.get("OPENAI_API_KEY")),
        usage
      });
    }
    const secretKey=getSupabaseSecretKey();
    if (!secretKey) return json({ok:false,error:"Supabase secret key is not available to the Edge Function"},500);
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,secretKey);

    if (action==="diagnostics") {
      const started=Date.now();
      const checks:any={};
      const timed=async(name:string,fn:()=>Promise<any>)=>{
        const t=Date.now();
        try {
          const result=await fn();
          checks[name]={ok:true,ms:Date.now()-t,result};
        } catch(error) {
          checks[name]={ok:false,ms:Date.now()-t,error:error instanceof Error?error.message:String(error)};
        }
      };

      await timed("database",async()=>{
        const {data,error}=await supabase.from("football_matches").select("id").limit(1);
        if(error) throw error;
        return {reachable:true,sample_rows:data?.length||0};
      });

      await timed("football_api",async()=>{
        if(!getFootballKey()) throw new Error("FOOTBALL_API_KEY is not configured");
        const body=await footballApi("/fixtures/upcoming",{days:"1",limit:"1"});
        return {configured:true,fixtures:Array.isArray(body?.data)?body.data.length:0};
      });

      await timed("api_football_odds",async()=>{
        if(!getApiFootballKey()) return {configured:false,skipped:true};
        const result=await apiFootball("/odds",{date:new Date().toISOString().slice(0,10),page:"1"});
        if(!result.ok) throw new Error((result.errors||[]).join(", "));
        return {configured:true,rows:result.response.length,remaining:result.remaining};
      });

      await timed("model",async()=>{
        const {data,error}=await supabase.from("football_ai_model_weights")
          .select("model_name,model_version,training_samples,accuracy,roi,updated_at")
          .eq("model_name",MODEL_NAME).maybeSingle();
        if(error) throw error;
        return {present:Boolean(data),model:data||null};
      });

      const failed=Object.entries(checks).filter(([,v]:any)=>!v.ok).map(([name,v]:any)=>({name,error:v.error}));
      return json({
        ok:failed.length===0,
        status:failed.length===0?"READY":"DEGRADED",
        service:"football-ai",
        checked_at:nowIso(),
        duration_ms:Date.now()-started,
        checks,
        failures:failed
      });
    }

    if (action==="sync"||action==="pipeline") {
      const requestedDate=url.searchParams.get("date");
      return json(await runPipeline(supabase,requestedDate,action==="sync"));
    }
    if (action==="evaluate") {
      const evaluated=await evaluatePredictions(supabase);
      const model=evaluated?await retrainModel(supabase):await getModel(supabase);
      return json({ok:true,evaluated,model});
    }
    if (action==="learning") {
      const {data:rows,error}=await supabase.from("football_ai_evaluations")
        .select("prediction_id,correct,pnl,brier_score,log_loss,actual_result,evaluated_at").order("evaluated_at",{ascending:false}).limit(5000);
      if (error) throw error;
      const evaluationRows=rows||[];
      const predictionIds=[...new Set(evaluationRows.map((r:any)=>r.prediction_id).filter(Boolean))];
      const {data:learningPredictions}=predictionIds.length
        ? await supabase.from("football_ai_predictions").select("id,match_id").in("id",predictionIds)
        : {data:[]};
      const learningMatchIds=[...new Set((learningPredictions||[]).map((p:any)=>p.match_id).filter(Boolean))];
      const {data:learningMatches}=learningMatchIds.length
        ? await supabase.from("football_matches").select("id,raw,league").in("id",learningMatchIds)
        : {data:[]};
      const europeanLearningMatchIds=new Set((learningMatches||[]).filter(isEuropeanMatch).map((m:any)=>String(m.id)));
      const europeanLearningPredictionIds=new Set((learningPredictions||[]).filter((p:any)=>europeanLearningMatchIds.has(String(p.match_id))).map((p:any)=>String(p.id)));
      const evaluations=evaluationRows.filter((r:any)=>europeanLearningPredictionIds.has(String(r.prediction_id)));
      const wins=evaluations.filter((r:any)=>r.correct===true).length;
      const losses=evaluations.filter((r:any)=>r.correct===false && r.pnl!=null).length;
      const voids=evaluations.filter((r:any)=>r.pnl==null && r.actual_result==null).length;
      const settled=wins+losses;
      const model=await getModel(supabase);
      return json({ok:true,learning:{
        evaluated:evaluations.length,wins,losses,voids,
        accuracy:settled?wins/settled:null,
        pnl:evaluations.reduce((s:number,r:any)=>s+num(r.pnl),0),
        last_evaluated_at:evaluations[0]?.evaluated_at||null
      },model});
    }
    if (action==="train") return json({ok:true,model:await retrainModel(supabase)});

    if (action==="validation") {
      const from=url.searchParams.get("from")||new Date(Date.now()-90*86400000).toISOString().slice(0,10);
      const to=url.searchParams.get("to")||new Date().toISOString().slice(0,10);
      const start=new Date(from+"T00:00:00.000Z"),end=new Date(to+"T23:59:59.999Z");
      const {data:matches,error:matchError}=await supabase.from("football_matches")
        .select("id,league,kickoff_at,home_team,away_team,raw").gte("kickoff_at",start.toISOString()).lte("kickoff_at",end.toISOString()).limit(5000);
      if(matchError) throw matchError;
      const europeanMatches=(matches||[]).filter(isEuropeanMatch);
      const ids=europeanMatches.map((m:any)=>m.id);
      if(!ids.length) return json({ok:true,from,to,summary:{evaluated:0,settled:0,wins:0,losses:0,voids:0,accuracy:null,pnl:0,roi:null,brier_score:null,log_loss:null},breakdowns:{league:[],market:[],outcome:[],confidence:[],odds:[],value:[],period:[]},scope:"Europe"});

      const [{data:predictions,error:predictionError},{data:evaluations,error:evaluationError}]=await Promise.all([
        supabase.from("football_ai_predictions").select("id,match_id,selected_outcome,prediction,confidence,odds,value_percent,created_at,evaluated_at,status").in("match_id",ids).limit(5000),
        supabase.from("football_ai_evaluations").select("prediction_id,actual_result,correct,pnl,brier_score,log_loss,evaluated_at").in("match_id",ids).gte("evaluated_at",start.toISOString()).lte("evaluated_at",end.toISOString()).limit(5000)
      ]);
      if(predictionError) throw predictionError;
      if(evaluationError) throw evaluationError;

      const predictionMap=new Map((predictions||[]).map((p:any)=>[String(p.id),p]));
      const matchMap=new Map(europeanMatches.map((m:any)=>[String(m.id),m]));
      const rows=(evaluations||[]).map((e:any)=>{
        const p=predictionMap.get(String(e.prediction_id)); const m=p?matchMap.get(String(p.match_id)):null;
        return {...e,p,m};
      }).filter((r:any)=>r.p);
      const settled=rows.filter((r:any)=>r.e.pnl!=null && r.e.actual_result!=null && r.e.correct!=null);
      const voids=rows.filter((r:any)=>r.e.pnl==null && r.e.actual_result==null);
      const wins=settled.filter((r:any)=>r.e.correct===true).length;
      const losses=settled.length-wins;
      const pnl=settled.reduce((s:number,r:any)=>s+num(r.e.pnl),0);
      const avg=(key:string,arr=settled)=>{
        const vals=arr.map((r:any)=>r.e?.[key]).filter((v:any)=>v!=null && Number.isFinite(Number(v))).map(Number);
        return vals.length?vals.reduce((a:number,b:number)=>a+b,0)/vals.length:null;
      };
      const metrics=(arr:any[])=>{
        const s=arr.filter((r:any)=>r.e.pnl!=null && r.e.actual_result!=null && r.e.correct!=null);
        const w=s.filter((r:any)=>r.e.correct===true).length;
        const p=s.reduce((sum:number,r:any)=>sum+num(r.e.pnl),0);
        return {samples:s.length,wins:w,losses:s.length-w,accuracy:s.length?w/s.length:null,pnl:p,roi:s.length?p/s.length:null,brier_score:avg("brier_score",s),log_loss:avg("log_loss",s)};
      };
      const group=(key:string,fn:(r:any)=>string)=>{
        const map=new Map<string,any[]>();
        for(const r of settled){const k=fn(r)||"Ukjent";const list=map.get(k)||[];list.push(r);map.set(k,list);}
        return [...map.entries()].map(([name,list])=>({key:name,...metrics(list)})).sort((a,b)=>b.samples-a.samples);
      };
      const confidenceBucket=(v:number)=>{
        if(!Number.isFinite(v)) return "Ukjent";
        if(v<50) return "<50%"; if(v<60) return "50–59%"; if(v<70) return "60–69%"; if(v<80) return "70–79%"; return "80%+";
      };
      const oddsBucket=(v:number)=>{
        if(!Number.isFinite(v)||v<=1) return "Ukjent";
        if(v<1.5) return "<1.50"; if(v<2) return "1.50–1.99"; if(v<3) return "2.00–2.99"; return "3.00+";
      };
      const valueBucket=(v:number)=>{
        if(!Number.isFinite(v)) return "Ingen value";
        if(v<0) return "<0%"; if(v<5) return "0–4.9%"; if(v<10) return "5–9.9%"; return "10%+";
      };
      const periodBucket=(r:any)=>{
        const d=new Date(r.e.evaluated_at||r.p.evaluated_at||r.p.created_at).getTime();
        const age=(Date.now()-d)/86400000;
        return age<=7?"Siste 7 dager":age<=30?"Siste 30 dager":"31–90 dager";
      };
      const summary={evaluated:rows.length,settled:settled.length,wins,losses,voids:voids.length,accuracy:settled.length?wins/settled.length:null,pnl,roi:settled.length?pnl/settled.length:null,brier_score:avg("brier_score"),log_loss:avg("log_loss")};
      return json({ok:true,from,to,scope:"Europe",summary,breakdowns:{
        league:group("league",(r)=>String(r.m?.league||"Ukjent")),
        market:group("market",()=> "1X2"),
        outcome:group("outcome",(r)=>String(r.p?.selected_outcome||"unknown").toUpperCase()),
        confidence:group("confidence",(r)=>confidenceBucket(num(r.p?.confidence,NaN))),
        odds:group("odds",(r)=>oddsBucket(num(r.p?.odds,NaN))),
        value:group("value",(r)=>valueBucket(num(r.p?.value_percent,NaN))),
        period:group("period",periodBucket)
      }});
    }

    if (action==="history") {
      const from=url.searchParams.get("from")||new Date(Date.now()-30*86400000).toISOString().slice(0,10);
      const to=url.searchParams.get("to")||new Date().toISOString().slice(0,10);
      const start=new Date(from+"T00:00:00.000Z"),end=new Date(to+"T23:59:59.999Z");
      const {data:matches,error:matchError}=await supabase.from("football_matches")
        .select("id,league,kickoff_at,home_team,away_team,status,home_score,away_score,raw")
        .gte("kickoff_at",start.toISOString()).lte("kickoff_at",end.toISOString())
        .order("kickoff_at",{ascending:false}).limit(5000);
      if(matchError) throw matchError;
      const europeanMatches=(matches||[]).filter(isEuropeanMatch);
      const ids=europeanMatches.map((m:any)=>m.id);
      let predictions:any[]=[];
      if(ids.length){
        const {data:rows,error}=await supabase.from("football_ai_predictions")
          .select("id,match_id,prediction,selected_outcome,confidence,implied_probability,odds,value_percent,model_score,status,reasoning,model_version,provider,model,created_at,evaluated_at,pnl,settled_result")
          .in("match_id",ids).order("created_at",{ascending:false}).limit(1000);
        if(error) throw error;
        predictions=rows||[];
      }
      const europeanIds=new Set(europeanMatches.map((m:any)=>String(m.id)));
      predictions=predictions.filter((p:any)=>europeanIds.has(String(p.match_id)));
      const matchMap=new Map(europeanMatches.map((m:any)=>[m.id,m]));
      const rows=predictions.map((p:any)=>({...p,match:matchMap.get(p.match_id)||null}));
      const settled=rows.filter((p:any)=>p.status==="WON"||p.status==="LOST"||p.status==="VOID");
      const decided=settled.filter((p:any)=>p.status==="WON"||p.status==="LOST");
      const wins=settled.filter((p:any)=>p.status==="WON").length;
      const losses=settled.filter((p:any)=>p.status==="LOST").length;
      const voids=settled.filter((p:any)=>p.status==="VOID").length;
      const pnl=decided.reduce((s:number,p:any)=>s+num(p.pnl),0);
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
        .select("model_name,model_version,training_samples,accuracy,roi,brier_score,log_loss,updated_at,weights,bias,learning_rate")
        .eq("model_name",MODEL_NAME).maybeSingle();
      return json({
        ok:true,scope:"Europe",from,to,predictions:rows,
        summary:{total:rows.length,settled:settled.length,decided:decided.length,wins,losses,voids,hit_rate:decided.length?wins/decided.length*100:null,pnl,roi_per_prediction:decided.length?pnl/decided.length*100:null,value_candidates:value.length},
        leagues:Object.values(leagues).sort((a:any,b:any)=>b.pnl-a.pnl),
        model:model||null
      });
    }

    if (action==="dashboard") {
      const date=url.searchParams.get("date");
      const scope=url.searchParams.get("scope")||"today";
      const startDate=date||new Date().toISOString().slice(0,10);
      const start=new Date(startDate+"T00:00:00.000Z");
      const end=scope==="upcoming"
        ? new Date(start.getTime()+2*86400000+86399999)
        : new Date(startDate+"T23:59:59.999Z");
      const {data:matches,error:matchError}=await supabase.from("football_matches")
        .select("id,league,kickoff_at,home_team,away_team,status,home_score,away_score,home_xg,away_xg,venue,raw")
        .gte("kickoff_at",start.toISOString()).lte("kickoff_at",end.toISOString())
        .order("kickoff_at",{ascending:true}).limit(5000);
      if (matchError) throw matchError;
      const logoCache=await loadTeamLogoCache(supabase);
      const normalizedMatches=(matches||[]).filter(isEuropeanMatch).map((m:any)=>({
        ...m,
        country:m?.raw?.country_name||"Ukjent",
        region:"Europe",
        competition_type:classifyCompetition(m?.league||""),
        home_logo:logoCache.get(normalizeTeamName(m?.home_team))||null,
        away_logo:logoCache.get(normalizeTeamName(m?.away_team))||null
      }));
      const ids=normalizedMatches.map((m:any)=>m.id); let predictions:any[]=[];
      if (ids.length) {
        const {data:rows,error}=await supabase.from("football_ai_predictions")
          .select("id,match_id,prediction,selected_outcome,confidence,implied_probability,odds,value_percent,model_score,status,reasoning,feature_vector,feature_version,model_version,provider,model,created_at,evaluated_at,pnl")
          .in("match_id",ids).order("created_at",{ascending:false});
        if (error) throw error; predictions=rows||[];
      }
      const {data:model}=await supabase.from("football_ai_model_weights")
        .select("model_name,model_version,training_samples,accuracy,roi,brier_score,log_loss,updated_at")
        .eq("model_name",MODEL_NAME).maybeSingle();
      const {data:recent}=await supabase.from("football_ai_evaluations")
        .select("prediction_id,correct,pnl,brier_score,log_loss,evaluated_at").order("evaluated_at",{ascending:false}).limit(500);
      const recentPredictionIds=[...new Set((recent||[]).map((r:any)=>r.prediction_id).filter(Boolean))];
      const {data:recentPredictions}=recentPredictionIds.length
        ? await supabase.from("football_ai_predictions").select("id,match_id").in("id",recentPredictionIds)
        : {data:[]};
      const recentMatchIds=[...new Set((recentPredictions||[]).map((p:any)=>p.match_id).filter(Boolean))];
      const {data:recentMatches}=recentMatchIds.length
        ? await supabase.from("football_matches").select("id,raw,league").in("id",recentMatchIds)
        : {data:[]};
      const europeanRecentMatchIds=new Set((recentMatches||[]).filter(isEuropeanMatch).map((m:any)=>String(m.id)));
      const europeanRecentPredictionIds=new Set((recentPredictions||[]).filter((p:any)=>europeanRecentMatchIds.has(String(p.match_id))).map((p:any)=>String(p.id)));
      const settledRecent=(recent||[]).filter((r:any)=>europeanRecentPredictionIds.has(String(r.prediction_id)) && r.pnl!=null && r.correct!=null);
      const n=settledRecent.length,wins=settledRecent.filter((r:any)=>r.correct===true).length;
      return json({
        ok:true,date,matches:normalizedMatches,predictions,
        engine:{
          model:model||null,
          evaluation:{
            samples:n,accuracy:n?wins/n*100:null,
            roi_percent_per_unit:n?settledRecent.reduce((s:number,r:any)=>s+num(r.pnl),0)/n*100:null
          },
          pipeline:["Football API","Feature Engineering","AI Prediction Engine","Probability + Confidence","Odds Engine","Value Finder","Daily Predictions","Result Evaluation","Model Learning","Retrain / Update"]
        }
      });
    }
    if (action==="odds") {
      const date=url.searchParams.get("date")||new Date().toISOString().slice(0,10);
      const result=await fetchApiFootballOddsDates([date]);
      return json({ok:!result.error,provider:"API-Football",date,requests:result.requests,rows:result.rows.length,remaining:result.remaining,error:result.error},result.error?502:200);
    }
    return json({ok:false,error:"Unknown action",supported:["health","diagnostics","pipeline","sync","odds","dashboard","learning","validation","history","evaluate","train"]},400);
  } catch(error) {
    const detail = error instanceof Error ? error.message : (error && typeof error === "object" ? JSON.stringify(error) : String(error));
    return json({ok:false,error:detail},500);
  }
});
