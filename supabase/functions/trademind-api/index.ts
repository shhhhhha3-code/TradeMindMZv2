// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { scanPionexMarket } from "../_shared/marketScanner.js";
import { getAccountInfo, getOpenPositions, getWalletBalancesFull } from "../_shared/pionex.js";
import { runDecision } from "../_shared/ai.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secretKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (keys.default) return keys.default;
  } catch {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = secretKey();
  if (!url || !key) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function sanitizeLimit(value, fallback = 50) {
  return Math.max(1, Math.min(100, Number(value) || fallback));
}

function normalizePositions(payload) {
  const rows = Array.isArray(payload) ? payload
    : Array.isArray(payload?.positions) ? payload.positions
    : Array.isArray(payload?.data?.positions) ? payload.data.positions
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.result?.positions) ? payload.result.positions
    : [];

  return rows.map((position, index) => {
    const symbol = position?.symbol ?? position?.market ?? position?.contract ?? position?.instrument ?? null;
    const side = position?.side ?? position?.positionSide ?? position?.direction ?? null;
    const sideUpper = side ? String(side).toUpperCase() : null;
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
    const quantity = n(position?.quantity ?? position?.qty ?? position?.positionAmt ?? position?.size ?? position?.amount);
    const entryPrice = n(position?.entryPrice ?? position?.entry_price ?? position?.avgEntryPrice ?? position?.openPrice ?? position?.averageEntryPrice);
    const markPrice = n(position?.markPrice ?? position?.mark_price ?? position?.currentPrice ?? position?.lastPrice ?? position?.price);
    const unrealizedPnl = n(position?.unrealizedPnl ?? position?.unrealizedPNL ?? position?.unrealized_profit ?? position?.pnl ?? position?.profit);
    return {
      id: position?.id ?? position?.positionId ?? `pionex-${index}-${symbol || "unknown"}`,
      source: "PIONEX",
      symbol,
      side: sideUpper,
      direction: sideUpper === "LONG" ? "BUY" : sideUpper === "SHORT" ? "SELL" : sideUpper,
      quantity,
      entryPrice,
      markPrice,
      currentPrice: markPrice,
      unrealizedPnl,
      leverage: n(position?.leverage ?? position?.leverageValue),
      margin: n(position?.margin ?? position?.initialMargin ?? position?.marginUsed),
      liquidationPrice: n(position?.liquidationPrice ?? position?.liquidation_price),
      status: "OPEN",
      readOnly: true,
      raw: position,
    };
  });
}

async function savePositionAIAnalysis(supabase, position, analysis, provider) {
  const symbol = position?.symbol ? String(position.symbol).trim() : null;
  const direction = position?.direction ? String(position.direction).trim().toUpperCase()
    : String(position?.side || "").toUpperCase() === "LONG" ? "BUY"
    : String(position?.side || "").toUpperCase() === "SHORT" ? "SELL" : null;
  const entryPrice = Number.isFinite(Number(position?.entryPrice)) ? Number(position.entryPrice) : null;
  const currentPrice = Number.isFinite(Number(position?.currentPrice)) ? Number(position.currentPrice) : null;
  const row = {
    position_id: null,
    user_id: null,
    recommendation: analysis?.recommendation || "WATCH",
    confidence: Number.isFinite(Number(analysis?.confidence)) ? Number(analysis.confidence) : null,
    reasoning: analysis?.reasoning || null,
    provider: provider || "groq",
    market_price: currentPrice,
    symbol,
    direction,
    entry_price: entryPrice,
    source: position?.source || "PIONEX",
  };
  const { data, error } = await supabase.from("position_ai_analysis").insert(row).select("*").single();
  if (error) throw new Error(`Failed to save position AI analysis: ${error.message}`);
  return data;
}

async function analyzePosition(supabase, body) {
  const position = body?.position;
  if (!position?.symbol) throw new Error("Position symbol is required.");
  const market = body?.market || body?.marketData || {};
  const provider = "groq";
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("Groq API key is not configured.");
  const prompt = {
    systemPrompt: `You are TradeMindMZ position risk analyst. Analyze ONLY the supplied Pionex position and supplied market data. Do not place trades and do not invent missing information. Return ONLY JSON: {"recommendation":"HOLD|WATCH|REDUCE_RISK|EXIT_CONSIDERATION","riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","confidence":0,"reasoning":"brief explanation","action":"brief practical guidance"}`,
    userPrompt: `OPEN POSITION:\n${JSON.stringify(position, null, 2)}\n\nCURRENT MARKET DATA:\n${JSON.stringify(market, null, 2)}`,
  };
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: prompt.systemPrompt }, { role: "user", content: prompt.userPrompt }],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Groq request failed: ${res.status} ${text.slice(0, 300)}`);
  const raw = JSON.parse(JSON.parse(text).choices?.[0]?.message?.content || "{}");
  const recommendations = ["HOLD","WATCH","REDUCE_RISK","EXIT_CONSIDERATION"];
  const risks = ["LOW","MEDIUM","HIGH","CRITICAL"];
  const analysis = {
    recommendation: recommendations.includes(String(raw?.recommendation || "").toUpperCase()) ? String(raw.recommendation).toUpperCase() : "WATCH",
    riskLevel: risks.includes(String(raw?.riskLevel || "").toUpperCase()) ? String(raw.riskLevel).toUpperCase() : "MEDIUM",
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw?.confidence) || 0))),
    reasoning: String(raw?.reasoning || "AI did not provide reasoning."),
    action: String(raw?.action || "Continue monitoring."),
  };
  let history = null;
  try { history = await savePositionAIAnalysis(supabase, position, analysis, provider); } catch (e) { console.error("Position AI history save failed:", e); }
  return { success: true, status: "POSITION_AI_ANALYZED", provider, analysis, historySaved: Boolean(history), historyId: history?.id || null, error: null };
}

async function getLearningStats(supabase) {
  const { data, error } = await supabase.from("position_ai_analysis").select("recommendation,confidence,provider,created_at");
  if (error) throw new Error(`Learning stats query failed: ${error.message}`);
  const rows = Array.isArray(data) ? data : [];
  const confidence = rows.map((r) => Number(r.confidence)).filter(Number.isFinite);
  const recommendations = { HOLD: 0, WATCH: 0, REDUCE_RISK: 0, EXIT_CONSIDERATION: 0 };
  const providers = {};
  for (const row of rows) {
    const rec = String(row.recommendation || "").toUpperCase();
    if (Object.hasOwn(recommendations, rec)) recommendations[rec] += 1;
    const provider = String(row.provider || "unknown");
    providers[provider] = (providers[provider] || 0) + 1;
  }
  return {
    success: true,
    totalAnalyses: rows.length,
    averageConfidence: confidence.length ? Math.round((confidence.reduce((a,b)=>a+b,0)/confidence.length)*10)/10 : 0,
    recommendations,
    providers,
    latest: rows.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0] || null,
  };
}

async function getSignalHistory(supabase, limit) {
  const safe = sanitizeLimit(limit);
  const [positionResult, signalResult] = await Promise.all([
    supabase.from("position_ai_analysis").select("*").order("created_at", { ascending: false }).limit(safe),
    supabase.from("ai_signals").select("*").order("created_at", { ascending: false }).limit(safe),
  ]);
  if (positionResult.error) throw new Error(`Position history query failed: ${positionResult.error.message}`);
  if (signalResult.error) throw new Error(`AI signal history query failed: ${signalResult.error.message}`);
  const positionHistory = (positionResult.data || []).map((row) => ({
    id: row.id, type: "POSITION", symbol: row.symbol ?? null, direction: row.direction ?? null,
    recommendation: row.recommendation || "WATCH", confidence: row.confidence != null ? Number(row.confidence) : null,
    reasoning: row.reasoning || "", provider: row.provider || null, price: row.market_price != null ? Number(row.market_price) : null,
    entryPrice: row.entry_price != null ? Number(row.entry_price) : null, source: row.source || "PIONEX", createdAt: row.created_at,
  }));
  const signalHistory = (signalResult.data || []).map((row) => ({
    id: row.id, type: "SIGNAL", symbol: row.symbol || null, direction: row.direction || row.side || null,
    recommendation: row.recommendation || row.signal || row.direction || "WATCH",
    confidence: row.confidence != null ? Number(row.confidence) : null,
    reasoning: row.reasoning || row.ai_reasoning || "", provider: row.provider || row.ai_provider || null,
    price: row.market_price != null ? Number(row.market_price) : (row.entry_price != null ? Number(row.entry_price) : null),
    entryPrice: row.entry_price != null ? Number(row.entry_price) : null, source: row.source || "TRADEMINDMZ",
    createdAt: row.created_at || row.captured_at || null,
  }));
  return { success: true, history: [...positionHistory, ...signalHistory].filter((x)=>x.createdAt).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,safe), count: [...positionHistory,...signalHistory].filter((x)=>x.createdAt).length };
}

function normalizeTradeCriteria(input = {}) {
  const source = Object.keys(input || {}).length
    ? input
    : globalThis.__tradeMindCriteria || {};
  const n = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
  return {
    minimumScore: Math.round(Math.max(0, Math.min(100, n(input.minimumScore,75)))),
    minimumConfidence: Math.round(Math.max(0, Math.min(100, n(input.minimumConfidence,80)))),
    minimumRiskReward: Number(Math.max(.1, Math.min(20, n(input.minimumRiskReward,2))).toFixed(2)),
    minimumRsi: Number(Math.max(0, Math.min(100, n(input.minimumRsi,35))).toFixed(2)),
    maximumRsi: Number(Math.max(0, Math.min(100, n(input.maximumRsi,70))).toFixed(2)),
    minimumVolumeRatio: Number(Math.max(0, Math.min(20, n(input.minimumVolumeRatio,.8))).toFixed(2)),
    highRisk: { minimumScore: Math.round(Math.max(0, Math.min(100, n(input.highRisk?.minimumScore,85)))), minimumConfidence: Math.round(Math.max(0, Math.min(100, n(input.highRisk?.minimumConfidence,90)))) },
  };
}

function evaluateCandidate(candidate) {
  const criteria = normalizeTradeCriteria();
  const score = Number(candidate?.score);
  const confidence = Number(candidate?.confidence);
  const rr = Number(candidate?.riskReward);
  const rsi = Number(candidate?.rsi);
  const volume = Number(candidate?.volumeRatio);
  const entry = Number(candidate?.entry), sl = Number(candidate?.stopLoss), tp = Number(candidate?.takeProfit);
  const direction = String(candidate?.direction || "").toUpperCase();
  const risk = String(candidate?.riskLevel || candidate?.risk?.level || "UNKNOWN").toUpperCase();
  const checks = [
    { key:"score",label:"Score",actual:score,target:criteria.minimumScore,operator:">=",passed:Number.isFinite(score)&&score>=criteria.minimumScore },
    { key:"confidence",label:"Confidence",actual:confidence,target:criteria.minimumConfidence,operator:">=",passed:Number.isFinite(confidence)&&confidence>=criteria.minimumConfidence },
    { key:"riskReward",label:"Risk / Reward",actual:rr,target:criteria.minimumRiskReward,operator:">=",passed:Number.isFinite(rr)&&rr>=criteria.minimumRiskReward },
    { key:"rsi",label:"RSI",actual:rsi,target:`${criteria.minimumRsi}–${criteria.maximumRsi}`,operator:"RANGE",passed:Number.isFinite(rsi)&&rsi>=criteria.minimumRsi&&rsi<=criteria.maximumRsi },
    { key:"volumeRatio",label:"Volume ratio",actual:volume,target:criteria.minimumVolumeRatio,operator:">=",passed:Number.isFinite(volume)&&volume>=criteria.minimumVolumeRatio },
    { key:"tradeLevels",label:"Trade levels",actual:"",target:direction==="BUY"?"SL < Entry < TP":direction==="SELL"?"SL > Entry > TP":"Valid direction",operator:"STRUCTURE",passed:direction==="BUY"?sl<entry&&entry<tp:direction==="SELL"?sl>entry&&entry>tp:false },
    { key:"highRisk",label:"HIGH risk protection",actual:risk==="HIGH"?`${score} / ${confidence}%`:"NOT REQUIRED",target:risk==="HIGH"?`${criteria.highRisk.minimumScore} / ${criteria.highRisk.minimumConfidence}%`:"Only enforced for HIGH risk",operator:risk==="HIGH"?">=":"INFO",passed:risk==="HIGH"?Number.isFinite(score)&&Number.isFinite(confidence)&&score>=criteria.highRisk.minimumScore&&confidence>=criteria.highRisk.minimumConfidence:true },
  ];
  return { passed: checks.every((x)=>x.passed), checks, failedChecks: checks.filter((x)=>!x.passed), criteria };
}

async function handle(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/trademind-api/, "").replace(/^\/trademind-api/, "") || "/";
  const method = req.method.toUpperCase();
  const body = method === "GET" ? {} : await req.json().catch(() => ({}));

  if (path === "/api/health" && method === "GET") {
    return response({ success:true, service:"TradeMindMZ V2", status:"ONLINE", ai:true, pionex:"READ_ONLY", trading:false });
  }

  if (path === "/api/pionex/status" && method === "GET") {
    return response({ success:true, configured:Boolean(Deno.env.get("PIONEX_API_KEY")&&Deno.env.get("PIONEX_API_SECRET")), readOnly:true, automaticTrading:false });
  }

  if (path === "/api/pionex/market-scan" && method === "GET") {
    try {
      const result = await scanPionexMarket({
        interval: url.searchParams.get("interval") || "1D",
        candleLimit: Number(url.searchParams.get("limit") || 100),
        maxMarkets: Number(url.searchParams.get("maxMarkets") || 25),
      });
      const aiDecision = await runDecision(result.engineTop5, url.searchParams.get("provider") || "groq");
      return response({
        ...result,
        aiDecision,
        finalDecision: aiDecision?.success ? aiDecision.decision : "NO_TRADE",
        decisionPipeline: { marketSource:"PIONEX", engine:"TradeMindMZ Engine V2", ai:"TradeMindMZ AI Decision Layer V1", automaticTrading:false, readOnly:true },
      });
    } catch (error) {
      const rateLimited = error?.status === 429 || error?.code === "PIONEX_RATE_LIMITED";
      return response({ success:false, scanned:0, candidates:[], status:rateLimited?"PIONEX_RATE_LIMITED":"PIONEX_MARKET_ERROR", retryable:true, error:error?.message||"Pionex market scan failed." }, rateLimited?429:502);
    }
  }

  if (path === "/api/pionex/live-positions" && method === "GET") {
    try { return response({ ...(await getOpenPositions()), success:true, source:"PIONEX", positions:normalizePositions(await getOpenPositions()) }); }
    catch (error) { return response({ success:false, source:"PIONEX", positions:[], error:error?.message||"Unable to fetch Pionex live positions." }, 502); }
  }

  if (path === "/api/pionex/account" && method === "GET") {
    try { const [account,positions]=await Promise.allSettled([getAccountInfo(),getOpenPositions()]); return response({success:true,connected:account.status==="fulfilled"||positions.status==="fulfilled",account:account.value||null,positions:positions.value||null,errors:{account:account.status==="rejected"?String(account.reason?.message||account.reason):null,positions:positions.status==="rejected"?String(positions.reason?.message||positions.reason):null},updatedAt:new Date().toISOString()}); }
    catch(error){ return response({success:false,connected:false,error:error?.message||"Pionex request failed."},502); }
  }

  if (path === "/api/pionex/positions" && method === "GET") {
    try { return response({success:true,connected:true,positions:normalizePositions(await getOpenPositions()),updatedAt:new Date().toISOString()}); }
    catch(error){ return response({success:false,positions:[],error:error?.message||"Pionex request failed."},502); }
  }

  if (path === "/api/pionex/wallet-balances" && method === "GET") {
    try { const wallet=await getWalletBalancesFull(); return wallet?.result ? response({success:true,source:"pionex",data:wallet.data,updatedAt:new Date().toISOString()}) : response({success:false,source:"pionex",data:null,error:wallet?.message||"Pionex wallet request failed.",code:wallet?.code||"PIONEX_WALLET_ERROR",data:wallet||null},502); }
    catch(error){ return response({success:false,source:"pionex",data:null,error:error?.message||"Pionex wallet request failed."},502); }
  }

  if (path === "/api/ai/trade-criteria" && method === "GET") {
    return response({
      success: true,
      criteria: normalizeTradeCriteria(),
    });
  }

  if (path === "/api/ai/trade-criteria" && method === "POST") {
    const criteria = normalizeTradeCriteria(body || {});
    globalThis.__tradeMindCriteria = criteria;
    return response({
      success: true,
      criteria,
      saved: true,
    });
  }

  if (path === "/api/ai/top-candidates" && method === "POST") {
    try {
      const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
      const aiDecision = await runDecision(candidates, body?.preferredProvider || "groq");
      const selected = candidates.find((c)=>c.symbol===aiDecision.symbol) || candidates[0] || null;
      const evaluation = selected ? evaluateCandidate(selected) : null;
      return response({ success:true,status:"AI_TOP5_ANALYZED",provider:aiDecision.provider,providers:aiDecision.providers||[],recommendation:aiDecision.decision==="TRADE"?{verdict:"RECOMMENDED",recommended:selected,summary:aiDecision.reason}: {verdict:"NO_TRADE",recommended:selected,summary:aiDecision.reason},criteria:evaluation,error:null });
    } catch(error){ return response({success:false,status:"AI_FAILED",recommendation:null,error:error?.message||"AI TOP5 analysis failed."},500); }
  }

  if (path === "/api/ai/analyze" && method === "POST") {
    try {
      const key=Deno.env.get("GROQ_API_KEY");
      if(!key) throw new Error("Groq API key is not configured.");
      const marketPrompt=`Analyze this supplied market data only. Return JSON with signal, confidence, reasoning. Symbol: ${body?.symbol||""}. Price: ${body?.price||""}. Market data: ${JSON.stringify(body?.marketData||{})}. Historical evidence: ${JSON.stringify(body?.historicalEvidence||{})}`;
      const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:Deno.env.get("GROQ_MODEL")||"llama-3.3-70b-versatile",temperature:.1,response_format:{type:"json_object"},messages:[{role:"system",content:"You are TradeMindMZ market analyst. Do not invent data. Return JSON only."},{role:"user",content:marketPrompt}]})});
      const t=await r.text(); if(!r.ok) throw new Error(`Groq request failed: ${r.status} ${t.slice(0,300)}`); return response({success:true,status:"AI_ANALYZED",provider:"groq",providers:["groq"],signal:JSON.parse(JSON.parse(t).choices?.[0]?.message?.content||"{}"),error:null});
    }catch(error){return response({success:false,status:"AI_FAILED",signal:null,error:error?.message||"AI analysis failed."},500);}
  }

  if ((path === "/api/ai/position-analyze" || path === "/api/positions/analyze") && method === "POST") {
    try { return response(await analyzePosition(supabaseAdmin(), body)); } catch(error){ return response({success:false,status:"POSITION_AI_ERROR",error:error?.message||"Position AI analysis failed."},500); }
  }

  if (path === "/api/ai/learning-stats" && method === "GET") {
    try { return response(await getLearningStats(supabaseAdmin())); } catch(error){ return response({success:false,totalAnalyses:0,averageConfidence:0,recommendations:{},providers:{},latest:null,error:error?.message||"Learning stats failed."},500); }
  }

  if (path === "/api/ai/signal-history" && method === "GET") {
    try { return response(await getSignalHistory(supabaseAdmin(), url.searchParams.get("limit"))); } catch(error){ return response({success:false,history:[],count:0,error:error?.message||"Signal history failed."},500); }
  }

  if (path === "/api/positions" && method === "GET") {
    try {
      const supabase=supabaseAdmin();
      let query=supabase.from("tracked_positions").select("*").order("created_at",{ascending:false});
      if(url.searchParams.get("userId")) query=query.eq("user_id",url.searchParams.get("userId"));
      if(url.searchParams.get("status")!==null) query=query.eq("status",url.searchParams.get("status")||"LIVE");
      const {data,error}=await query;
      if(error) throw error;
      return response({success:true,positions:data||[]});
    } catch(error){ return response({success:false,error:error?.message||"Position read failed.",positions:[]},500); }
  }

  if (path === "/api/diagnostics" && method === "GET") {
    const supabaseOk=Boolean(Deno.env.get("SUPABASE_URL") && secretKey());
    const pionexOk=Boolean(Deno.env.get("PIONEX_API_KEY") && Deno.env.get("PIONEX_API_SECRET"));
    const groqOk=Boolean(Deno.env.get("GROQ_API_KEY"));
    return response({
      success:supabaseOk&&pionexOk&&groqOk,
      status:supabaseOk&&pionexOk&&groqOk?"DIAGNOSTICS_OK":"DIAGNOSTICS_WARNING",
      timestamp:new Date().toISOString(),
      totalDurationMs:0,
      checks:[
        {name:"Backend",status:"OK",httpStatus:200,details:{service:"Supabase Edge Function"},error:null},
        {name:"Supabase",status:supabaseOk?"OK":"ERROR",httpStatus:supabaseOk?200:500,details:{configured:supabaseOk},error:supabaseOk?null:"Supabase server credentials are not configured."},
        {name:"Pionex",status:pionexOk?"OK":"ERROR",httpStatus:pionexOk?200:500,details:{configured:pionexOk,readOnly:true},error:pionexOk?null:"Pionex credentials are not configured."},
        {name:"Groq AI",status:groqOk?"CONFIGURED":"ERROR",httpStatus:groqOk?200:500,details:{configured:groqOk,activeProvider:"groq",probe:false},error:groqOk?null:"GROQ_API_KEY is not configured."},
      ],
    });
  }

  if (path === "/api/supabase/status" && method === "GET") {
    try {
      const supabase=supabaseAdmin();
      const {error}=await supabase.from("trademindmz_health").select("id").limit(1);
      return response({ok:!error,provider:"supabase",status:error?"CONNECTED_BUT_TABLE_TEST_FAILED":"CONNECTED",error:error?.message||null});
    } catch(error){return response({ok:false,provider:"supabase",status:"CONNECTION_FAILED",error:error?.message||String(error)});}
  }

  return response({success:false,error:"TradeMindMZ API route not found.",path,method},404);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try { return await handle(req); }
  catch(error) { console.error("TradeMindMZ Edge API error:", error); return response({success:false,error:error?.message||String(error)},500); }
});
