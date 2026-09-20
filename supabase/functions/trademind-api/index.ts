// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { scanPionexMarket, scorePionexCandidate, parsePionexKlines } from "../_shared/marketScanner.js";
import { getAccountInfo, getOpenPositions, getWalletBalancesFull, getMarketTickers, getMarketKlines } from "../_shared/pionex.js";
import { runDecision } from "../_shared/ai.js";
import {
  getLatestLiveAiSnapshot,
  saveLiveAiSnapshot,
} from "../_shared/liveAiSnapshot.js";

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

const LIVE_AI_INTERVAL_MS = 7 * 60 * 1000;
const liveAiInFlight = new Map();

function getLiveAiCacheKey(url) {
  return [
    url.searchParams.get("interval") || "15M",
    url.searchParams.get("maxMarkets") || "25",
    url.searchParams.get("leverage") || "2",
    url.searchParams.get("provider") || "groq",
    url.searchParams.get("marketType") || "PERP",
  ].join(":");
}

async function authorizeSchedulerRequest(req, supabase) {
  const provided = String(
    req.headers.get("x-trademind-scheduler") || ""
  ).trim();

  if (!provided) {
    return false;
  }

  const { data, error } = await supabase
    .from("trademind_scheduler_secrets")
    .select("secret")
    .eq("id", true)
    .limit(1)
    .maybeSingle();

  if (error || !data?.secret) {
    console.error("Scheduler authorization lookup failed:", error);
    return false;
  }

  return provided === String(data.secret);
}

function liveAiOptionsFromUrl(url) {
  return {
    interval: url.searchParams.get("interval") || "15M",
    candleLimit: Number(url.searchParams.get("limit") || 100),
    maxMarkets: Number(url.searchParams.get("maxMarkets") || 25),
    marketType: url.searchParams.get("marketType") || "PERP",
    leverage: Number(url.searchParams.get("leverage") || 2),
    provider: url.searchParams.get("provider") || "groq",
  };
}

function deriveMarketRegime(candidates = []) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const btc = rows.find(row => /^(BTC|BTC_USDT)/i.test(String(row?.symbol || "")));
  const source = btc || rows[0] || {};
  const change = Number(source?.change24h ?? source?.indicators?.change24h);
  const ema9 = Number(source?.ema9 ?? source?.indicators?.ema9);
  const ema21 = Number(source?.ema21 ?? source?.indicators?.ema21);
  const score = Number(source?.score ?? source?.engineScore);
  const aligned = Number.isFinite(ema9) && Number.isFinite(ema21) ? ema9 > ema21 : null;
  let regime = "SIDEWAYS";
  if ((aligned === true && Number.isFinite(change) && change > 0.5) || (Number.isFinite(score) && score >= 82 && change > 0)) regime = "BULLISH";
  else if ((aligned === false && Number.isFinite(change) && change < -0.5) || (Number.isFinite(score) && score < 60 && change < 0)) regime = "BEARISH";
  return {
    regime,
    referenceSymbol: source?.symbol || null,
    change24h: Number.isFinite(change) ? change : null,
    emaAligned: aligned,
    score: Number.isFinite(score) ? score : null,
  };
}

async function runLiveAiAnalysis({
  interval = "15M",
  candleLimit = 100,
  maxMarkets = 25,
  marketType = "PERP",
  leverage = 2,
  provider = "groq",
  force = false,
  persist = true,
} = {}) {
  const cacheKey = [
    interval,
    maxMarkets,
    leverage,
    provider,
    String(marketType || "PERP").toUpperCase(),
  ].join(":");

  const now = Date.now();
  const cached = globalThis.__tradeMindLiveAiCache?.[cacheKey];

  if (
    !force &&
    cached &&
    now - cached.createdAt < LIVE_AI_INTERVAL_MS
  ) {
    return {
      ...cached.payload,
      cached: true,
      nextAnalysisAt: new Date(
        cached.createdAt + LIVE_AI_INTERVAL_MS
      ).toISOString(),
    };
  }

  let analysisPromise = liveAiInFlight.get(cacheKey);

  if (!analysisPromise) {
    analysisPromise = (async () => {
      const result = await scanPionexMarket({
        interval,
        candleLimit,
        maxMarkets,
        marketType,
        leverage,
      });

      if (
        !Array.isArray(result?.engineTop5) ||
        result.engineTop5.length === 0
      ) {
        throw new Error("Pionex scanner returned no Engine TOP 5 candidates.");
      }

      const aiDecision = await runDecision(
        result.engineTop5,
        provider,
        { marketType }
      );

      const selectedCandidate = result.engineTop5.find(
        (candidate) =>
          String(candidate?.symbol || "").toUpperCase() ===
          String(aiDecision?.symbol || "").toUpperCase()
      ) || null;

      const tradeQuality = selectedCandidate
        ? evaluateCandidate(selectedCandidate, { marketType })
        : null;

      const marketRegime = deriveMarketRegime(result.engineTop5);

      const finalDecision =
        aiDecision?.success &&
        aiDecision.decision === "TRADE" &&
        tradeQuality?.passed === true
          ? "TRADE"
          : "NO_TRADE";

      const whyNoTrade = finalDecision === "TRADE"
        ? null
        : {
            summary: aiDecision?.reason || "No actionable setup passed the final filters.",
            aiReasons: Array.isArray(aiDecision?.engineReasons) ? aiDecision.engineReasons : [],
            failedChecks: Array.isArray(tradeQuality?.failedChecks)
              ? tradeQuality.failedChecks.map((check) => ({
                  key: check.key,
                  label: check.label,
                  actual: check.actual,
                  target: check.target,
                  operator: check.operator,
                }))
              : [],
            marketType,
          };

      const createdAt = Date.now();

      const payload = {
        ...result,
        aiDecision,
        tradeQuality,
        whyNoTrade,
        marketRegime,
        finalDecision,
        decisionPipeline: {
          marketSource:
            result.contractType ||
            "PIONEX USDT-M PERPETUAL",
          universe: result.scanned,
          engine: "TradeMindMZ Engine V2",
          ai: "TradeMindMZ AI Decision Layer V1",
          aiInput: "ENGINE TOP 5 ONLY",
          aiCadence: "7 MINUTES",
          leverage: result.leverage || 2,
          automaticTrading: false,
          readOnly: true,
          persistedServerSide: true,
          riskFilter: "ENGINE SCORE + AI CONFIDENCE + R/R + RSI + VOLUME + NET EDGE",
          marketRegime: marketRegime.regime,
          actionableOnlyWhen: marketType === "SPOT"
            ? "AI TRADE + BUY ONLY + RISK FILTER PASS"
            : "AI TRADE AND RISK FILTER PASS",
        },
      };

      const nextAnalysisAt = new Date(
        createdAt + LIVE_AI_INTERVAL_MS
      ).toISOString();

      payload.nextAnalysisAt = nextAnalysisAt;

      let persistenceError = null;

      if (persist) {
        try {
          await saveLiveAiSnapshot(
            supabaseAdmin(),
            payload,
            {
              marketType,
              interval,
              leverage,
            }
          );
        } catch (error) {
          persistenceError =
            error?.message || String(error);

          console.error(
            "Live AI snapshot persistence failed:",
            error
          );
        }
      }

      const finalPayload = {
        ...payload,
        persistenceError,
      };

      globalThis.__tradeMindLiveAiCache = {
        ...(globalThis.__tradeMindLiveAiCache || {}),
        [cacheKey]: {
          createdAt,
          payload: finalPayload,
        },
      };

      return finalPayload;
    })();

    liveAiInFlight.set(
      cacheKey,
      analysisPromise
    );

    analysisPromise.finally(() => {
      if (
        liveAiInFlight.get(cacheKey) ===
        analysisPromise
      ) {
        liveAiInFlight.delete(cacheKey);
      }
    });
  }

  return analysisPromise;
}



function normalizeSpotSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[_-]?USDT.*$/, "");
}

function normalizeSpotHoldings(accountPayload, tickerPayload) {
  const rows = Array.isArray(accountPayload?.data?.balances)
    ? accountPayload.data.balances
    : Array.isArray(accountPayload?.balances)
      ? accountPayload.balances
      : [];

  const tickers = Array.isArray(tickerPayload?.data?.tickers)
    ? tickerPayload.data.tickers
    : Array.isArray(tickerPayload?.tickers)
      ? tickerPayload.tickers
      : Array.isArray(tickerPayload?.data)
        ? tickerPayload.data
        : [];

  const tickerMap = new Map();
  for (const ticker of tickers) {
    const symbol = normalizeSpotSymbol(ticker?.symbol ?? ticker?.market);
    if (!symbol) continue;
    const price = Number(ticker?.close ?? ticker?.price ?? ticker?.lastPrice);
    if (Number.isFinite(price) && price > 0) tickerMap.set(symbol, price);
  }

  return rows
    .map((row) => {
      const coin = String(row?.coin ?? row?.asset ?? row?.currency ?? "").trim().toUpperCase();
      const free = Number(row?.free ?? row?.available ?? row?.balance ?? 0);
      const frozen = Number(row?.frozen ?? row?.locked ?? 0);
      const quantity = free + frozen;
      if (!coin || coin === "USDT" || !Number.isFinite(quantity) || quantity <= 0) return null;
      const price = tickerMap.get(coin) ?? null;
      return {
        id: "spot-" + coin,
        source: "PIONEX_SPOT",
        marketType: "SPOT",
        symbol: coin + "_USDT",
        coin,
        quantity,
        free: Number.isFinite(free) ? free : 0,
        frozen: Number.isFinite(frozen) ? frozen : 0,
        currentPrice: price,
        currentValueUsdt: Number.isFinite(price) ? quantity * price : null,
        entryPrice: null,
        costBasis: null,
        unrealizedPnl: null,
        unrealizedPercent: null,
        side: "LONG",
        direction: "SELL",
        status: "HELD",
        readOnly: true,
      };
    })
    .filter(Boolean)
    .sort((a,b) => Number(b.currentValueUsdt || 0) - Number(a.currentValueUsdt || 0));
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
    risk_level: analysis?.riskLevel || null,
    action: analysis?.action || null,
    hold_time_min_minutes: Number.isFinite(Number(analysis?.holdTimeMinMinutes)) ? Number(analysis.holdTimeMinMinutes) : null,
    hold_time_max_minutes: Number.isFinite(Number(analysis?.holdTimeMaxMinutes)) ? Number(analysis.holdTimeMaxMinutes) : null,
    hold_time_reason: analysis?.holdTimeReason || null,
  };
  const { data, error } = await supabase.from("position_ai_analysis").insert(row).select("*").single();
  if (error) throw new Error(`Failed to save position AI analysis: ${error.message}`);
  return data;
}

async function analyzePosition(supabase, body) {
  const position = body?.position;
  if (!position?.symbol) throw new Error("Position symbol is required.");
  const market = body?.market || body?.marketData || {};

  const prompt = {
    systemPrompt: `You are TradeMindMZ position risk analyst. Analyze ONLY the supplied Pionex position and supplied market data. Do not place trades and do not invent missing information. The position is USDT-M perpetual and read-only. Return ONLY JSON: {"recommendation":"HOLD|WATCH|REDUCE_RISK|EXIT_CONSIDERATION","riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","confidence":0,"reasoning":"brief explanation","action":"brief practical guidance","holdTimeMinMinutes":0,"holdTimeMaxMinutes":0,"holdTimeReason":"brief explanation of expected remaining hold time"}. Hold time is an estimate, not a guarantee. Base it only on the supplied timeframe, volatility, distance to TP/SL, momentum, and position age when available.`,
    userPrompt: `OPEN POSITION:
${JSON.stringify(position, null, 2)}

CURRENT MARKET DATA:
${JSON.stringify(market, null, 2)}`,
  };

  const available = [];
  if (Deno.env.get("GROQ_API_KEY")) available.push("groq");
  if (Deno.env.get("OPENAI_API_KEY")) available.push("openai");

  if (!available.length) {
    throw new Error("No AI provider is configured.");
  }

  const preferred = String(body?.preferredProvider || "groq").toLowerCase();
  const ordered = [preferred, "groq", "openai"]
    .filter((provider, index, list) =>
      available.includes(provider) &&
      list.indexOf(provider) === index
    );

  const errors = [];
  let raw = null;
  let provider = null;

  for (const candidateProvider of ordered) {
    try {
      const key = Deno.env.get(
        candidateProvider === "openai"
          ? "OPENAI_API_KEY"
          : "GROQ_API_KEY"
      );

      const endpoint =
        candidateProvider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://api.groq.com/openai/v1/chat/completions";

      const model =
        candidateProvider === "openai"
          ? Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini"
          : Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: prompt.systemPrompt },
            { role: "user", content: prompt.userPrompt },
          ],
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(
          `${candidateProvider} request failed: ${res.status} ${text.slice(0, 300)}`
        );
      }

      const parsed = JSON.parse(text);
      raw = JSON.parse(
        parsed.choices?.[0]?.message?.content || "{}"
      );
      provider = candidateProvider;
      break;
    } catch (error) {
      errors.push({
        provider: candidateProvider,
        error: error?.message || String(error),
      });
    }
  }

  if (!raw) {
    throw new Error(
      `All configured position AI providers failed: ${errors.map(x => x.provider).join(", ")}`
    );
  }

  const recommendations = [
    "HOLD",
    "WATCH",
    "REDUCE_RISK",
    "EXIT_CONSIDERATION",
  ];

  const risks = [
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ];

  const holdMin = Math.max(
    0,
    Math.round(Number(raw?.holdTimeMinMinutes) || 0)
  );

  const holdMax = Math.max(
    holdMin,
    Math.round(Number(raw?.holdTimeMaxMinutes) || 0)
  );

  const analysis = {
    recommendation:
      recommendations.includes(
        String(raw?.recommendation || "").toUpperCase()
      )
        ? String(raw.recommendation).toUpperCase()
        : "WATCH",

    riskLevel:
      risks.includes(
        String(raw?.riskLevel || "").toUpperCase()
      )
        ? String(raw.riskLevel).toUpperCase()
        : "MEDIUM",

    confidence: Math.max(
      0,
      Math.min(
        100,
        Math.round(Number(raw?.confidence) || 0)
      )
    ),

    reasoning:
      String(
        raw?.reasoning ||
        "AI did not provide reasoning."
      ),

    action:
      String(
        raw?.action ||
        "Continue monitoring."
      ),

    holdTimeMinMinutes:
      holdMin,

    holdTimeMaxMinutes:
      holdMax,

    holdTimeReason:
      String(
        raw?.holdTimeReason ||
        ""
      ),
  };

  let history = null;
  try {
    history = await savePositionAIAnalysis(
      supabase,
      position,
      analysis,
      provider
    );
  } catch (e) {
    console.error(
      "Position AI history save failed:",
      e
    );
  }

  return {
    success: true,
    status: "POSITION_AI_ANALYZED",
    provider,
    providers: available,
    providerErrors: errors,
    analysis,
    historySaved: Boolean(history),
    historyId: history?.id || null,
    error: null,
  };
}

function normalizedPositionKey(position) {
  const rawId = position?.id ? String(position.id).trim() : "";
  const symbol = String(position?.symbol || "").trim().toUpperCase();
  const side = String(position?.side || position?.direction || "").trim().toUpperCase();
  return rawId && rawId.startsWith("pionex-") === false
    ? `PIONEX:${rawId}`
    : `PIONEX:${symbol}:${side}`;
}

function positionDirection(position) {
  const raw = String(position?.direction || position?.side || "").toUpperCase();
  if (raw === "LONG" || raw === "BUY") return "BUY";
  if (raw === "SHORT" || raw === "SELL") return "SELL";
  return raw;
}

function calculatePositionPnlPercent(position) {
  const entry = Number(position?.entryPrice);
  const current = Number(position?.currentPrice ?? position?.markPrice);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(current)) return null;
  const side = String(position?.side || position?.direction || "").toUpperCase();
  return side === "SHORT"
    ? ((entry - current) / entry) * 100
    : ((current - entry) / entry) * 100;
}

async function upsertTradeJournalForPosition(supabase, position, analysis = null) {
  const key = normalizedPositionKey(position);
  const direction = positionDirection(position);
  if (!key || !position?.symbol || !["BUY", "SELL"].includes(direction)) return null;

  const { data: existingJournal } = await supabase
    .from("trade_journal")
    .select("position_key")
    .eq("position_key", key)
    .maybeSingle();

  const row = {
    position_key: key,
    symbol: String(position.symbol).trim().toUpperCase(),
    side: direction === "SELL" ? "SHORT" : "LONG",
    entry_price: Number.isFinite(Number(position.entryPrice)) ? Number(position.entryPrice) : null,
    quantity: Number.isFinite(Number(position.quantity)) ? Number(position.quantity) : null,
    stop_loss: Number.isFinite(Number(position.stopLoss)) ? Number(position.stopLoss) : null,
    take_profit: Number.isFinite(Number(position.takeProfit)) ? Number(position.takeProfit) : null,
    ...(existingJournal ? {} : {
      ai_confidence_at_entry: analysis?.confidence != null
        ? Number(analysis.confidence)
        : null,
      ai_hold_time_min_minutes: analysis?.holdTimeMinMinutes != null
        ? Number(analysis.holdTimeMinMinutes)
        : null,
      ai_hold_time_max_minutes: analysis?.holdTimeMaxMinutes != null
        ? Number(analysis.holdTimeMaxMinutes)
        : null,
      ai_hold_time_reason: analysis?.holdTimeReason || null,
    }),
    last_price: Number.isFinite(Number(position.currentPrice ?? position.markPrice))
      ? Number(position.currentPrice ?? position.markPrice)
      : null,
    last_pnl: Number.isFinite(Number(position.unrealizedPnl))
      ? Number(position.unrealizedPnl)
      : null,
    last_pnl_percent: calculatePositionPnlPercent(position),
    status: "OPEN",
    source: String(position.source || "PIONEX_READ_ONLY"),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("trade_journal")
    .upsert(row, { onConflict: "position_key" })
    .select("*")
    .single();

  if (error) {
    console.error("Trade journal upsert failed:", error);
    return null;
  }

  return data;
}


async function analyzeSpotHoldingWithAI(supabase, holding, market) {
  const available = [];
  if (Deno.env.get("GROQ_API_KEY")) available.push("groq");
  if (Deno.env.get("OPENAI_API_KEY")) available.push("openai");
  if (!available.length) throw new Error("No AI provider is configured.");

  const systemPrompt = "You are the TradeMindMZ Spot exit-monitoring analyst. Analyze only the supplied Spot holding and market data. Do not place orders. Spot holdings are long-only. Return JSON only: {\\"recommendation\\":\\"HOLD|EXIT_CONSIDERATION|REDUCE_RISK\\",\\"confidence\\":0,\\"reasoning\\":\\"brief reason\\",\\"action\\":\\"brief practical guidance\\",\\"holdTimeMinMinutes\\":0,\\"holdTimeMaxMinutes\\":0,\\"holdTimeReason\\":\\"brief estimate\\"}. Never invent an entry price or P&L.";
  const userPrompt = "SPOT HOLDING:\\n" + JSON.stringify(holding) + "\\n\\nMARKET:\\n" + JSON.stringify(market);

  const errors = [];
  for (const provider of ["groq", "openai"]) {
    if (!available.includes(provider)) continue;
    try {
      const key = provider === "openai" ? Deno.env.get("OPENAI_API_KEY") : Deno.env.get("GROQ_API_KEY");
      const endpoint = provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions";
      const model = provider === "openai"
        ? Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini"
        : Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [{ role:"system", content:systemPrompt }, { role:"user", content:userPrompt }],
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(provider + " request failed: " + res.status + " " + text.slice(0, 300));
      const raw = JSON.parse(JSON.parse(text).choices?.[0]?.message?.content || "{}");
      const allowed = ["HOLD","EXIT_CONSIDERATION","REDUCE_RISK"];
      const recommendation = allowed.includes(String(raw?.recommendation || "").toUpperCase())
        ? String(raw.recommendation).toUpperCase()
        : "HOLD";
      const confidence = Math.max(0, Math.min(100, Math.round(Number(raw?.confidence) || 0)));
      const analysis = {
        recommendation,
        riskLevel: recommendation === "EXIT_CONSIDERATION" ? "HIGH" : recommendation === "REDUCE_RISK" ? "MEDIUM" : "LOW",
        confidence,
        reasoning: String(raw?.reasoning || "Spot holding analyzed."),
        action: String(raw?.action || "Continue monitoring."),
        holdTimeMinMinutes: Math.max(0, Math.round(Number(raw?.holdTimeMinMinutes) || 0)),
        holdTimeMaxMinutes: Math.max(0, Math.round(Number(raw?.holdTimeMaxMinutes) || 0)),
        holdTimeReason: String(raw?.holdTimeReason || ""),
      };
      const row = {
        position_id: null,
        user_id: null,
        recommendation,
        confidence,
        reasoning: analysis.reasoning,
        provider,
        market_price: Number.isFinite(Number(holding.currentPrice)) ? Number(holding.currentPrice) : null,
        symbol: holding.symbol,
        direction: "SELL",
        entry_price: Number.isFinite(Number(holding.entryPrice)) ? Number(holding.entryPrice) : null,
        source: "PIONEX_SPOT",
        risk_level: analysis.riskLevel,
        action: analysis.action,
        hold_time_min_minutes: analysis.holdTimeMinMinutes,
        hold_time_max_minutes: analysis.holdTimeMaxMinutes,
        hold_time_reason: analysis.holdTimeReason,
      };
      const { error } = await supabase.from("position_ai_analysis").insert(row);
      if (error) console.error("Spot AI history save failed:", error);
      return { success:true, provider, analysis };
    } catch (error) {
      errors.push({ provider, error:error?.message || String(error) });
    }
  }
  throw new Error("All Spot AI providers failed: " + errors.map(x => x.provider).join(", "));
}

async function runServerSpotMonitoring(supabase) {
  const [account, tickers] = await Promise.all([
    getAccountInfo(),
    getMarketTickers({ type:"SPOT" }),
  ]);
  const holdings = normalizeSpotHoldings(account, tickers);
  const currentKeys = new Set();
  const monitored = [];

  for (const holding of holdings.slice(0, 10)) {
    const key = "SPOT:" + holding.coin;
    currentKeys.add(key);
    let market = null;
    try {
      const symbol = holding.symbol;
      const tickerRows = Array.isArray(tickers?.data?.tickers) ? tickers.data.tickers : Array.isArray(tickers?.tickers) ? tickers.tickers : [];
      const ticker = tickerRows.find(row => String(row?.symbol ?? row?.market ?? "").toUpperCase() === symbol.toUpperCase()) || {};
      const klinePayload = await getMarketKlines({ symbol, interval:"15M", limit:100 });
      const candles = parsePionexKlines(klinePayload);
      market = scorePionexCandidate({
        symbol,
        candles,
        ticker,
        marketType:"SPOT",
        leverage:1,
        interval:"15M",
      }) || { symbol, price: holding.currentPrice, marketType:"SPOT" };

      const result = await analyzeSpotHoldingWithAI(supabase, holding, market);
      const analysis = result.analysis;
      const { data: existingSpotJournal } = await supabase
        .from("trade_journal")
        .select("entry_price,cost_basis,ai_confidence_at_entry,ai_hold_time_min_minutes,ai_hold_time_max_minutes,ai_hold_time_reason")
        .eq("position_key", key)
        .maybeSingle();

      await supabase.from("trade_journal").upsert({
        position_key:key,
        symbol,
        side:"LONG",
        entry_price: Number.isFinite(Number(holding.entryPrice))
          ? Number(holding.entryPrice)
          : (existingSpotJournal?.entry_price ?? null),
        quantity: Number(holding.quantity),
        last_price: Number.isFinite(Number(holding.currentPrice)) ? Number(holding.currentPrice) : null,
        last_pnl: null,
        last_pnl_percent: null,
        current_value: Number.isFinite(Number(holding.currentValueUsdt)) ? Number(holding.currentValueUsdt) : null,
        cost_basis: existingSpotJournal?.cost_basis ?? null,
        market_type:"SPOT",
        fee_rate: Number(Deno.env.get("PIONEX_SPOT_FEE_RATE") || 0.001),
        estimated_slippage_rate: Number(Deno.env.get("TRADEMIND_ESTIMATED_SLIPPAGE_RATE") || 0.0005),
        source: existingSpotJournal ? "MANUAL_PIONEX_SPOT" : "PIONEX_SPOT",
        ai_confidence_at_entry: existingSpotJournal?.ai_confidence_at_entry ?? null,
        ai_hold_time_min_minutes: existingSpotJournal?.ai_hold_time_min_minutes ?? null,
        ai_hold_time_max_minutes: existingSpotJournal?.ai_hold_time_max_minutes ?? null,
        ai_hold_time_reason: existingSpotJournal?.ai_hold_time_reason ?? null,
        ai_exit_recommendation: analysis.recommendation,
        ai_exit_confidence: analysis.confidence,
        ai_exit_reason: analysis.reasoning,
        updated_at:new Date().toISOString(),
        status:"OPEN",
      }, { onConflict:"position_key" });
      monitored.push({ key, symbol, holding, market, analysis, provider:result.provider });
    } catch (error) {
      monitored.push({ key, symbol:holding.symbol, holding, market, analysis:null, error:error?.message || String(error) });
    }
  }

  const { data: openRows } = await supabase.from("trade_journal").select("position_key,last_price,entry_price,quantity,market_type,status,fee_rate,estimated_slippage_rate").eq("market_type","SPOT").eq("status","OPEN").limit(100);
  for (const row of openRows || []) {
    if (currentKeys.has(row.position_key)) continue;
    const exitPrice = Number(row.last_price);
    const entryPrice = Number(row.entry_price);
    const quantity = Number(row.quantity);
    const grossPnl = Number.isFinite(exitPrice) && Number.isFinite(entryPrice) && Number.isFinite(quantity)
      ? (exitPrice - entryPrice) * quantity
      : null;
    const feeRate = Number.isFinite(Number(row.fee_rate)) ? Number(row.fee_rate) : 0.001;
    const slippageRate = Number.isFinite(Number(row.estimated_slippage_rate)) ? Number(row.estimated_slippage_rate) : 0.0005;
    const entryNotional = Number.isFinite(entryPrice) && Number.isFinite(quantity) ? entryPrice * quantity : null;
    const exitNotional = Number.isFinite(exitPrice) && Number.isFinite(quantity) ? exitPrice * quantity : null;
    const estimatedCosts = Number.isFinite(entryNotional) && Number.isFinite(exitNotional)
      ? (entryNotional + exitNotional) * feeRate + (entryNotional + exitNotional) * slippageRate
      : null;
    const netPnl = Number.isFinite(grossPnl) && Number.isFinite(estimatedCosts) ? grossPnl - estimatedCosts : grossPnl;
    await supabase.from("trade_journal").update({
      status:"CLOSED",
      exit_price:Number.isFinite(exitPrice) ? exitPrice : null,
      gross_pnl:Number.isFinite(grossPnl) ? grossPnl : null,
      net_pnl:Number.isFinite(netPnl) ? netPnl : null,
      realized_pnl:Number.isFinite(netPnl) ? netPnl : null,
      closed_at:new Date().toISOString(),
      close_reason:"Spot balance no longer returned by Pionex account endpoint.",
      updated_at:new Date().toISOString(),
    }).eq("position_key",row.position_key).eq("status","OPEN");
  }

  return { success:true, marketType:"SPOT", holdings, monitoredCount:monitored.length, holdings:holdings, positions:monitored, checkedAt:new Date().toISOString(), readOnly:true };
}

async function getServerSpotMonitoring(supabase) {
  const [account, tickers] = await Promise.all([getAccountInfo(), getMarketTickers({ type:"SPOT" })]);
  const holdings = normalizeSpotHoldings(account, tickers);
  const { data: analyses } = await supabase.from("position_ai_analysis")
    .select("symbol,recommendation,risk_level,confidence,reasoning,action,hold_time_min_minutes,hold_time_max_minutes,hold_time_reason,provider,created_at")
    .eq("source","PIONEX_SPOT")
    .order("created_at",{ascending:false})
    .limit(200);
  const latest = new Map();
  for (const row of analyses || []) {
    const key = String(row.symbol || "").toUpperCase();
    if (!latest.has(key)) latest.set(key,row);
  }
  return {
    success:true,
    serverSide:true,
    readOnly:true,
    marketType:"SPOT",
    updatedAt:new Date().toISOString(),
    holdings:holdings.map(h => ({
      ...h,
      monitor: latest.has(String(h.symbol).toUpperCase()) ? latest.get(String(h.symbol).toUpperCase()) : null,
    })),
  };
}

async function runServerPositionMonitoring(supabase, { marketSnapshot = null } = {}) {
  const raw = await getOpenPositions();
  const positions = normalizePositions(raw);
  const currentKeys = new Set();

  const candidates =
    Array.isArray(marketSnapshot?.snapshot?.candidates)
      ? marketSnapshot.snapshot.candidates
      : Array.isArray(marketSnapshot?.candidates)
        ? marketSnapshot.candidates
        : [];

  const monitored = [];
  const maxPositions = Math.min(5, positions.length);

  for (const position of positions.slice(0, maxPositions)) {
    const key = normalizedPositionKey(position);
    currentKeys.add(key);

    const market = candidates.find((candidate) =>
      String(candidate?.symbol || "").toUpperCase() ===
      String(position?.symbol || "").toUpperCase()
    ) || {};

    try {
      const result = await analyzePosition(supabase, {
        position,
        market,
        preferredProvider: "groq",
      });

      const analysis = result?.analysis || null;
      const journal = await upsertTradeJournalForPosition(
        supabase,
        position,
        analysis
      );

      monitored.push({
        key,
        symbol: position.symbol,
        direction: positionDirection(position),
        analysis,
        provider: result?.provider || null,
        journalId: journal?.position_key || null,
        analyzedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Server position monitoring failed:", error);
      const journal = await upsertTradeJournalForPosition(
        supabase,
        position,
        null
      );
      monitored.push({
        key,
        symbol: position.symbol,
        direction: positionDirection(position),
        analysis: null,
        provider: null,
        journalId: journal?.position_key || null,
        error: error?.message || String(error),
      });
    }
  }

  // Only close journal entries after a successful Pionex position request.
  // An API failure throws above, so a temporary outage cannot mark trades closed.
  const { data: openJournalRows, error: openJournalError } = await supabase
    .from("trade_journal")
    .select("*")
    .eq("status", "OPEN")
    .limit(100);

  if (!openJournalError) {
    for (const row of openJournalRows || []) {
      if (currentKeys.has(row.position_key)) continue;

      const exitPrice = Number(row.last_price);
      const entry = Number(row.entry_price);
      const quantity = Number(row.quantity);
      const side = String(row.side || "").toUpperCase();
      const realizedPnl = Number.isFinite(exitPrice) && Number.isFinite(entry) && Number.isFinite(quantity)
        ? (side === "SHORT" ? (entry - exitPrice) : (exitPrice - entry)) * quantity
        : null;

      await supabase
        .from("trade_journal")
        .update({
          status: "CLOSED",
          exit_price: Number.isFinite(exitPrice) ? exitPrice : null,
          realized_pnl: Number.isFinite(realizedPnl) ? realizedPnl : null,
          closed_at: new Date().toISOString(),
          close_reason: "Position no longer returned by Pionex open-position endpoint; exit price is last observed mark.",
          updated_at: new Date().toISOString(),
        })
        .eq("position_key", row.position_key)
        .eq("status", "OPEN");
    }
  }

  return {
    success: true,
    monitoredCount: monitored.length,
    positions: monitored,
    checkedAt: new Date().toISOString(),
    readOnly: true,
  };
}

async function getServerPositionMonitoring(supabase) {
  let positions = [];
  let positionFeedError = null;

  try {
    const raw = await getOpenPositions();
    positions = normalizePositions(raw);
  } catch (error) {
    positionFeedError = error?.message || String(error);
    console.error("Server position feed unavailable:", error);
  }

  const { data: analyses, error: analysisError } = await supabase
    .from("position_ai_analysis")
    .select("id,symbol,direction,recommendation,risk_level,confidence,reasoning,action,hold_time_min_minutes,hold_time_max_minutes,hold_time_reason,provider,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (analysisError) {
    console.error("Position monitoring analysis query failed:", analysisError);
  }

  const latestByKey = new Map();
  const previousByKey = new Map();

  for (const row of analyses || []) {
    const key = `${String(row.symbol || "").toUpperCase()}:${String(row.direction || "").toUpperCase()}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, row);
    } else if (!previousByKey.has(key)) {
      previousByKey.set(key, row);
    }
  }

  const enriched = positions.map((position) => {
    const key = `${String(position.symbol || "").toUpperCase()}:${positionDirection(position)}`;
    const current = latestByKey.get(key) || null;
    const previous = previousByKey.get(key) || null;
    const confidence = current?.confidence != null ? Number(current.confidence) : null;
    const previousConfidence = previous?.confidence != null ? Number(previous.confidence) : null;
    const confidenceDelta =
      Number.isFinite(confidence) && Number.isFinite(previousConfidence)
        ? confidence - previousConfidence
        : null;

    const recommendation = String(current?.recommendation || "WATCH").toUpperCase();
    const riskLevel = String(current?.risk_level || "MEDIUM").toUpperCase();
    const exitWarning =
      recommendation === "EXIT_CONSIDERATION" ||
      recommendation === "REDUCE_RISK" ||
      riskLevel === "CRITICAL" ||
      riskLevel === "HIGH" ||
      (Number.isFinite(confidenceDelta) && confidenceDelta <= -10);

    return {
      ...position,
      monitor: {
        recommendation,
        riskLevel,
        confidence,
        confidenceDelta,
        reasoning: current?.reasoning || null,
        action: current?.action || null,
        holdTimeMinMinutes: current?.hold_time_min_minutes != null ? Number(current.hold_time_min_minutes) : 0,
        holdTimeMaxMinutes: current?.hold_time_max_minutes != null ? Number(current.hold_time_max_minutes) : 0,
        holdTimeReason: current?.hold_time_reason || null,
        provider: current?.provider || null,
        analyzedAt: current?.created_at || null,
        exitWarning,
      },
    };
  });

  const { data: journal, error: journalError } = await supabase
    .from("trade_journal")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (journalError) {
    console.error("Trade journal query failed:", journalError);
  }

  const closed = (journal || []).filter((row) => row.status === "CLOSED");
  const closedPnl = closed.map((row) => Number(row.realized_pnl)).filter(Number.isFinite);
  const positiveCount = closedPnl.filter((value) => value > 0).length;
  const negativeCount = closedPnl.filter((value) => value < 0).length;
  const entryConfidence = (journal || [])
    .map((row) => Number(row.ai_confidence_at_entry))
    .filter(Number.isFinite);

  const winners = closedPnl.filter((value) => value > 0);
  const losers = closedPnl.filter((value) => value < 0);
  const grossProfit = winners.reduce((sum, value) => sum + value, 0);
  const grossLossAbs = Math.abs(losers.reduce((sum, value) => sum + value, 0));
  const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : null;
  const confidenceBuckets = [
    { label:"90-100", min:90, max:100 },
    { label:"80-89", min:80, max:89.999 },
    { label:"70-79", min:70, max:79.999 },
    { label:"<70", min:-Infinity, max:69.999 },
  ].map(bucket => {
    const rows = (journal || []).filter(row => {
      const confidence = Number(row.ai_confidence_at_entry);
      return Number.isFinite(confidence) && confidence >= bucket.min && confidence <= bucket.max && row.status === "CLOSED";
    });
    const pnl = rows.map(row => Number(row.realized_pnl)).filter(Number.isFinite);
    const wins = pnl.filter(value => value > 0).length;
    return {
      label: bucket.label,
      closed: pnl.length,
      winRate: pnl.length ? Math.round((wins / pnl.length) * 1000) / 10 : null,
      netPnl: pnl.reduce((sum,value) => sum + value, 0),
    };
  });

  return {
    success: true,
    serverSide: true,
    readOnly: true,
    positionFeedStatus: positionFeedError ? "ERROR" : "OK",
    positionFeedError,
    analysisQueryError: analysisError?.message || null,
    journalQueryError: journalError?.message || null,
    updatedAt: new Date().toISOString(),
    positions: enriched,
    journal: journal || [],
    journalStats: {
      total: (journal || []).length,
      open: (journal || []).filter((row) => row.status === "OPEN").length,
      closed: closed.length,
      closedPnl: closedPnl.reduce((sum, value) => sum + value, 0),
      closedCountWithPnl: closedPnl.length,
      positiveCount,
      negativeCount,
      positiveRate: closedPnl.length ? Math.round((positiveCount / closedPnl.length) * 1000) / 10 : null,
      averageAiConfidenceAtEntry: entryConfidence.length
        ? Math.round((entryConfidence.reduce((sum, value) => sum + value, 0) / entryConfidence.length) * 10) / 10
        : null,
      grossProfit,
      grossLoss: -grossLossAbs,
      profitFactor,
      averageWinner: winners.length ? grossProfit / winners.length : null,
      averageLoser: losers.length ? (-grossLossAbs) / losers.length : null,
      confidenceBuckets,
    },
  };
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
    minimumScore: Math.round(Math.max(0, Math.min(100, n(source.minimumScore,75)))),
    minimumConfidence: Math.round(Math.max(0, Math.min(100, n(source.minimumConfidence,80)))),
    minimumRiskReward: Number(Math.max(.1, Math.min(20, n(source.minimumRiskReward,2))).toFixed(2)),
    minimumRsi: Number(Math.max(0, Math.min(100, n(source.minimumRsi,35))).toFixed(2)),
    maximumRsi: Number(Math.max(0, Math.min(100, n(source.maximumRsi,70))).toFixed(2)),
    minimumVolumeRatio: Number(Math.max(0, Math.min(20, n(source.minimumVolumeRatio,.8))).toFixed(2)),
    highRisk: { minimumScore: Math.round(Math.max(0, Math.min(100, n(source.highRisk?.minimumScore,85)))), minimumConfidence: Math.round(Math.max(0, Math.min(100, n(source.highRisk?.minimumConfidence,90)))) },
  };
}

function evaluateCandidate(candidate, { marketType = "PERP" } = {}) {
  const criteria = normalizeTradeCriteria();
  const score = Number(candidate?.score ?? candidate?.engineScore);
  const confidence = Number(candidate?.confidence);
  const rr = Number(candidate?.riskReward);
  const rsi = Number(candidate?.rsi ?? candidate?.indicators?.rsi14);
  const volume = Number(candidate?.volumeRatio ?? candidate?.indicators?.volumeRatio);
  const entry = Number(candidate?.entry), sl = Number(candidate?.stopLoss), tp = Number(candidate?.takeProfit);
  const direction = String(candidate?.direction || "").toUpperCase();
  const risk = String(candidate?.riskLevel || candidate?.risk?.level || "UNKNOWN").toUpperCase();
  const normalizedMarketType = String(marketType || "PERP").toUpperCase() === "SPOT" ? "SPOT" : "PERP";
  const feeRate = normalizedMarketType === "SPOT"
    ? Number(Deno.env.get("PIONEX_SPOT_FEE_RATE") || 0.001)
    : Number(Deno.env.get("PIONEX_FUTURES_TAKER_FEE_RATE") || 0.0005);
  const slippageRate = Number(Deno.env.get("TRADEMIND_ESTIMATED_SLIPPAGE_RATE") || 0.0005);
  const roundTripCostRate = Math.max(0, feeRate * 2 + slippageRate * 2);
  const grossTargetRate = Number.isFinite(entry) && entry > 0 && Number.isFinite(tp) ? Math.abs(tp - entry) / entry : NaN;
  const netTargetRate = Number.isFinite(grossTargetRate) ? grossTargetRate - roundTripCostRate : NaN;
  const minimumNetEdgeRate = Number(Deno.env.get("TRADEMIND_MIN_NET_EDGE_RATE") || 0.003);
  const checks = [
    { key:"score",label:"Score",actual:score,target:criteria.minimumScore,operator:">=",passed:Number.isFinite(score)&&score>=criteria.minimumScore },
    { key:"confidence",label:"Confidence",actual:confidence,target:criteria.minimumConfidence,operator:">=",passed:Number.isFinite(confidence)&&confidence>=criteria.minimumConfidence },
    { key:"riskReward",label:"Risk / Reward",actual:rr,target:criteria.minimumRiskReward,operator:">=",passed:Number.isFinite(rr)&&rr>=criteria.minimumRiskReward },
    { key:"rsi",label:"RSI",actual:rsi,target:String(criteria.minimumRsi)+"–"+String(criteria.maximumRsi),operator:"RANGE",passed:Number.isFinite(rsi)&&rsi>=criteria.minimumRsi&&rsi<=criteria.maximumRsi },
    { key:"volumeRatio",label:"Volume ratio",actual:volume,target:criteria.minimumVolumeRatio,operator:">=",passed:Number.isFinite(volume)&&volume>=criteria.minimumVolumeRatio },
    { key:"tradeLevels",label:"Trade levels",actual:"",target:direction==="BUY"?"SL < Entry < TP":direction==="SELL"?"SL > Entry > TP":"Valid direction",operator:"STRUCTURE",passed:direction==="BUY"?sl<entry&&entry<tp:direction==="SELL"?sl>entry&&entry>tp:false },
    { key:"spotDirection",label:"Spot direction",actual:direction,target:"BUY",operator:"=",passed:normalizedMarketType==="PERP" || direction==="BUY" },
    { key:"netEdge",label:"Net edge after costs",actual:Number.isFinite(netTargetRate)?(netTargetRate*100).toFixed(2)+"%":"—",target:">= "+(minimumNetEdgeRate*100).toFixed(2)+"%",operator:">=",passed:Number.isFinite(netTargetRate)&&netTargetRate>=minimumNetEdgeRate },
    { key:"highRisk",label:"HIGH risk protection",actual:risk==="HIGH"?String(score)+" / "+String(confidence)+"%":"NOT REQUIRED",target:risk==="HIGH"?String(criteria.highRisk.minimumScore)+" / "+String(criteria.highRisk.minimumConfidence)+"%":"Only enforced for HIGH risk",operator:risk==="HIGH"?">=":"INFO",passed:risk==="HIGH"?Number.isFinite(score)&&Number.isFinite(confidence)&&score>=criteria.highRisk.minimumScore&&confidence>=criteria.highRisk.minimumConfidence:true },
  ];
  return { passed: checks.every((x)=>x.passed), checks, failedChecks: checks.filter((x)=>!x.passed), criteria, costs:{feeRate,slippageRate,roundTripCostRate,grossTargetRate,netTargetRate,minimumNetEdgeRate} };
}

async 
function calculateRiskSizing(body = {}) {
  const balance = Number(body?.balanceUsdt);
  const entry = Number(body?.entryPrice);
  const stop = Number(body?.stopLoss);
  const riskPercent = Math.max(0.1, Math.min(5, Number(body?.riskPercent) || 1));
  const maxAllocationPercent = Math.max(1, Math.min(100, Number(body?.maxAllocationPercent) || 10));
  const marketType = String(body?.marketType || "PERP").toUpperCase() === "SPOT" ? "SPOT" : "PERP";
  if (![balance, entry, stop].every(Number.isFinite) || balance <= 0 || entry <= 0 || stop <= 0 || entry === stop) {
    throw new Error("balanceUsdt, entryPrice and stopLoss are required.");
  }
  const stopDistancePct = Math.abs(entry - stop) / entry;
  const maxLoss = balance * (riskPercent / 100);
  const riskBasedNotional = stopDistancePct > 0 ? maxLoss / stopDistancePct : 0;
  const allocationCap = balance * (maxAllocationPercent / 100);
  const suggestedNotional = Math.min(riskBasedNotional, allocationCap);
  const quantity = suggestedNotional / entry;
  const feeRate = marketType === "SPOT"
    ? Number(Deno.env.get("PIONEX_SPOT_FEE_RATE") || 0.001)
    : Number(Deno.env.get("PIONEX_FUTURES_TAKER_FEE_RATE") || 0.0005);
  return {
    success: true,
    marketType,
    balanceUsdt: balance,
    riskPercent,
    maxAllocationPercent,
    maxLossUsdt: maxLoss,
    stopDistancePct: stopDistancePct * 100,
    riskBasedNotionalUsdt: riskBasedNotional,
    allocationCapUsdt: allocationCap,
    suggestedNotionalUsdt: suggestedNotional,
    suggestedQuantity: quantity,
    estimatedEntryFeeUsdt: suggestedNotional * feeRate,
    feeRate,
    readOnly: true,
    automaticTrading: false,
  };
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
        interval: url.searchParams.get("interval") || "15M",
        candleLimit: Number(url.searchParams.get("limit") || 100),
        maxMarkets: Number(url.searchParams.get("maxMarkets") || 25),
        marketType: url.searchParams.get("marketType") || "PERP",
        leverage: Number(url.searchParams.get("leverage") || 2),
      });
      return response({
        ...result,
        aiDecision: null,
        finalDecision: "ENGINE_ONLY",
        decisionPipeline: {
          marketSource: result.contractType || "PIONEX USDT-M PERPETUAL",
          engine: "TradeMindMZ Engine V2",
          ai: "WAITING FOR TOP 5",
          automaticTrading: false,
          readOnly: true,
        },
      });
    } catch (error) {
      const rateLimited = error?.status === 429 || error?.code === "PIONEX_RATE_LIMITED";
      return response({ success:false, scanned:0, candidates:[], status:rateLimited?"PIONEX_RATE_LIMITED":"PIONEX_MARKET_ERROR", retryable:true, error:error?.message||"Pionex market scan failed." }, rateLimited?429:502);
    }
  }

  if (path === "/api/ai/latest" && method === "GET") {
    try {
      const latest = await getLatestLiveAiSnapshot(
        supabaseAdmin(),
        {
          marketType:
            url.searchParams.get("marketType") || "PERP",
          interval:
            url.searchParams.get("interval") || "15M",
          leverage:
            Number(url.searchParams.get("leverage") || 2),
        }
      );

      return response({
        success: true,
        ...latest,
        serverSide: true,
        cadenceMinutes: 7,
      });
    } catch (error) {
      return response({
        success: false,
        available: false,
        snapshot: null,
        error:
          error?.message ||
          "Latest AI snapshot unavailable.",
      }, 500);
    }
  }

  if (path === "/api/ai/live-scan" && method === "GET") {
    try {
      const options = liveAiOptionsFromUrl(url);
      const force = url.searchParams.get("force") === "1";
      const payload = await runLiveAiAnalysis({
        ...options,
        force,
        persist: true,
      });

      const status =
        payload?.persistenceError
          ? 207
          : 200;

      return response(
        {
          ...payload,
          serverSide: true,
        },
        status
      );
    } catch (error) {
      const rateLimited =
        error?.status === 429 ||
        error?.code === "PIONEX_RATE_LIMITED";

      return response({
        success: false,
        scanned: 0,
        candidates: [],
        status:
          rateLimited
            ? "PIONEX_RATE_LIMITED"
            : "LIVE_AI_SCAN_ERROR",
        retryable: true,
        error:
          error?.message ||
          "Live AI scan failed.",
      }, rateLimited ? 429 : 502);
    }
  }

  if (
    path === "/api/ai/scheduled-scan" &&
    method === "POST"
  ) {
    let schedulerRunId = null;
    try {
      const admin = supabaseAdmin();

      if (
        !(await authorizeSchedulerRequest(
          req,
          admin
        ))
      ) {
        return response({
          success: false,
          error: "Unauthorized scheduler request.",
        }, 401);
      }

      const schedulerStartedAt = new Date().toISOString();
      const { data: schedulerRun } = await admin
        .from("trademind_scheduler_runs")
        .insert({ status:"RUNNING", started_at:schedulerStartedAt })
        .select("id")
        .single();
      schedulerRunId = schedulerRun?.id || null;

      const payload = await runLiveAiAnalysis({
        interval: "15M",
        candleLimit: 100,
        maxMarkets: 25,
        marketType: "PERP",
        leverage: 2,
        provider: "groq",
        force: true,
        persist: true,
      });

      if (payload?.persistenceError) {
        return response({
          success: false,
          status: "AI_SNAPSHOT_PERSISTENCE_ERROR",
          error: payload.persistenceError,
          latestAnalysis: payload,
        }, 500);
      }

      let spotSnapshot = null;
      let spotMonitoring = null;
      try {
        spotSnapshot = await runLiveAiAnalysis({
          interval:"15M",
          candleLimit:100,
          maxMarkets:25,
          marketType:"SPOT",
          leverage:1,
          provider:"groq",
          force:true,
          persist:true,
        });
        spotMonitoring = await runServerSpotMonitoring(admin);
      } catch (spotError) {
        console.error("Scheduled Spot monitoring failed:", spotError);
        spotMonitoring = { success:false, error:spotError?.message || String(spotError), readOnly:true };
      }

      let positionMonitoring = null;
      try {
        positionMonitoring = await runServerPositionMonitoring(admin, {
          marketSnapshot: payload,
        });
      } catch (positionError) {
        console.error("Scheduled position monitoring failed:", positionError);
        positionMonitoring = {
          success: false,
          error: positionError?.message || String(positionError),
          readOnly: true,
        };
      }

      if (schedulerRunId) {
        await admin.from("trademind_scheduler_runs").update({
          status:"SUCCESS",
          finished_at:new Date().toISOString(),
          perp_snapshot_at:payload?.persistedAt || payload?.updatedAt || null,
          spot_snapshot_at:spotSnapshot?.persistedAt || spotSnapshot?.updatedAt || null,
          position_monitoring_count:Number(positionMonitoring?.monitoredCount || 0),
          spot_monitoring_count:Number(spotMonitoring?.monitoredCount || 0),
        }).eq("id",schedulerRunId);
      }

      return response({
        success: true,
        status: "SCHEDULED_AI_SCAN_COMPLETE",
        serverSide: true,
        cadenceMinutes: 7,
        snapshot: payload,
        spotSnapshot,
        spotMonitoring,
        positionMonitoring,
      });
    } catch (error) {
      try {
        if (schedulerRunId) {
          const admin = supabaseAdmin();
          await admin.from("trademind_scheduler_runs").update({
            status:"ERROR",
            finished_at:new Date().toISOString(),
            error:error?.message || String(error),
          }).eq("id",schedulerRunId);
        }
      } catch {}

      const rateLimited =
        error?.status === 429 ||
        error?.code === "PIONEX_RATE_LIMITED";

      console.error(
        "Scheduled Live AI scan failed:",
        error
      );

      return response({
        success: false,
        status:
          rateLimited
            ? "PIONEX_RATE_LIMITED"
            : "SCHEDULED_AI_SCAN_ERROR",
        retryable: true,
        error:
          error?.message ||
          "Scheduled AI scan failed.",
      }, rateLimited ? 429 : 502);
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



  if (path === "/api/pionex/spot-holdings" && method === "GET") {
    try {
      const [account, tickers] = await Promise.all([
        getAccountInfo(),
        getMarketTickers({ type: "SPOT" }),
      ]);
      const holdings = normalizeSpotHoldings(account, tickers);
      return response({
        success: true,
        source: "PIONEX",
        marketType: "SPOT",
        holdings,
        count: holdings.length,
        readOnly: true,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return response({
        success: false,
        source: "PIONEX",
        marketType: "SPOT",
        holdings: [],
        count: 0,
        readOnly: true,
        error: error?.message || "Unable to fetch Pionex Spot holdings.",
      }, 502);
    }
  }

  if (path === "/api/pionex/wallet-balances" && method === "GET") {
    try { const wallet=await getWalletBalancesFull(); return wallet?.result ? response({success:true,source:"pionex",data:wallet.data,updatedAt:new Date().toISOString()}) : response({success:false,source:"pionex",data:null,error:wallet?.message||"Pionex wallet request failed.",code:wallet?.code||"PIONEX_WALLET_ERROR",data:wallet||null},502); }
    catch(error){ return response({success:false,source:"pionex",data:null,error:error?.message||"Pionex wallet request failed."},502); }
  }


  if (path === "/api/ai/risk-size" && method === "POST") {
    try {
      return response(calculateRiskSizing(body));
    } catch (error) {
      return response({ success:false, readOnly:true, automaticTrading:false, error:error?.message||"Risk sizing failed." },400);
    }
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


  if (path === "/api/ai/spot-monitoring" && method === "GET") {
    try {
      return response(await getServerSpotMonitoring(supabaseAdmin()));
    } catch (error) {
      return response({ success:false, serverSide:true, readOnly:true, marketType:"SPOT", holdings:[], error:error?.message||"Spot monitoring unavailable." },502);
    }
  }

  if (path === "/api/ai/position-monitoring" && method === "GET") {
    try {
      return response(await getServerPositionMonitoring(supabaseAdmin()));
    } catch (error) {
      return response({
        success: false,
        serverSide: true,
        positions: [],
        journal: [],
        journalStats: { total: 0, open: 0, closed: 0, closedPnl: 0, closedCountWithPnl: 0 },
        error: error?.message || "Server position monitoring unavailable.",
      }, 502);
    }
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


  if (path === "/api/positions/register-manual" && method === "POST") {
    try {
      return response(await registerManualTradeJournal(supabaseAdmin(), body));
    } catch (error) {
      return response({ success:false, readOnly:true, error:error?.message||"Manual trade journal registration failed." },400);
    }
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
    const startedAt = Date.now();
    const supabaseOk = Boolean(
      Deno.env.get("SUPABASE_URL") &&
      secretKey()
    );
    const pionexConfigured = Boolean(
      Deno.env.get("PIONEX_API_KEY") &&
      Deno.env.get("PIONEX_API_SECRET")
    );
    const groqOk = Boolean(
      Deno.env.get("GROQ_API_KEY")
    );

    let latestSnapshot = null;
    let snapshotError = null;
    let schedulerHeartbeat = null;
    if (supabaseOk) {
      try {
        const admin = supabaseAdmin();
        const { data } = await admin.from("trademind_scheduler_runs").select("id,status,started_at,finished_at,perp_snapshot_at,spot_snapshot_at,position_monitoring_count,spot_monitoring_count,error").order("created_at",{ascending:false}).limit(1).maybeSingle();
        schedulerHeartbeat = data || null;
      } catch (error) {
        schedulerHeartbeat = { status:"ERROR", error:error?.message || String(error) };
      }
    }

    if (supabaseOk) {
      try {
        latestSnapshot =
          await getLatestLiveAiSnapshot(
            supabaseAdmin(),
            {
              marketType: "PERP",
              interval: "15M",
              leverage: 2,
            }
          );
      } catch (error) {
        snapshotError =
          error?.message ||
          String(error);
      }
    }

    const persistedAt =
      latestSnapshot?.snapshot?.persistedAt || null;

    const snapshotAgeMs =
      persistedAt
        ? Math.max(
            0,
            Date.now() -
              new Date(persistedAt).getTime()
          )
        : null;

    const snapshotFresh =
      Boolean(
        latestSnapshot?.available &&
        Number.isFinite(snapshotAgeMs) &&
        snapshotAgeMs <=
          15 * 60 * 1000
      );

    const marketAiStatus =
      snapshotFresh
        ? "OK"
        : latestSnapshot?.available
          ? "STALE"
          : "ERROR";

    const diagnosticsOk =
      supabaseOk &&
      pionexConfigured &&
      groqOk &&
      snapshotFresh;

    return response({
      success: diagnosticsOk,
      status:
        diagnosticsOk
          ? "DIAGNOSTICS_OK"
          : "DIAGNOSTICS_WARNING",
      timestamp: new Date().toISOString(),
      totalDurationMs:
        Date.now() - startedAt,
      scheduler: schedulerHeartbeat,
      checks: [
        {
          name: "Backend",
          status: "OK",
          httpStatus: 200,
          details: {
            service: "Supabase Edge Function",
          },
          error: null,
        },
        {
          name: "Supabase",
          status:
            supabaseOk
              ? "OK"
              : "ERROR",
          httpStatus:
            supabaseOk
              ? 200
              : 500,
          details: {
            configured:
              supabaseOk,
          },
          error:
            supabaseOk
              ? null
              : "Supabase server credentials are not configured.",
        },
        {
          name: "Pionex",
          status:
            pionexConfigured
              ? snapshotFresh
                ? "OK"
                : "STALE"
              : "ERROR",
          httpStatus:
            pionexConfigured
              ? 200
              : 500,
          details: {
            configured:
              pionexConfigured,
            readOnly: true,
            marketSnapshotFresh:
              snapshotFresh,
          },
          error:
            pionexConfigured
              ? snapshotFresh
                ? null
                : "Pionex credentials are configured, but the latest server market snapshot is stale or unavailable."
              : "Pionex credentials are not configured.",
        },
        {
          name: "Market AI",
          status: marketAiStatus,
          httpStatus:
            marketAiStatus === "ERROR"
              ? 500
              : 200,
          details: {
            available:
              Boolean(
                latestSnapshot?.available
              ),
            scanned:
              Number(
                latestSnapshot?.snapshot?.scanned ||
                0
              ),
            candidates:
              Array.isArray(
                latestSnapshot?.snapshot?.candidates
              )
                ? latestSnapshot.snapshot.candidates.length
                : 0,
            finalDecision:
              latestSnapshot?.snapshot?.finalDecision ||
              "NO_TRADE",
            provider:
              latestSnapshot?.snapshot?.aiDecision?.provider ||
              null,
            updatedAt:
              latestSnapshot?.snapshot?.updatedAt ||
              persistedAt,
            snapshotAgeSeconds:
              snapshotAgeMs !== null
                ? Math.round(
                    snapshotAgeMs / 1000
                  )
                : null,
            cadenceMinutes: 7,
          },
          error:
            snapshotError ||
            (
              snapshotFresh
                ? null
                : "No fresh persisted server AI snapshot is available."
            ),
        },
        {
          name: "Groq AI",
          status:
            groqOk
              ? "CONFIGURED"
              : "ERROR",
          httpStatus:
            groqOk
              ? 200
              : 500,
          details: {
            configured:
              groqOk,
            activeProvider:
              "groq",
            probe: false,
          },
          error:
            groqOk
              ? null
              : "GROQ_API_KEY is not configured.",
        },
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
