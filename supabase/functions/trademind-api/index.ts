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

function parseSchedulerSecretState(rawSecret) {
  const raw = String(rawSecret || "").trim();
  if (!raw) {
    return { schedulerSecret: "", fcmToken: null, lastQualifiedTradeKey: null, notificationsEnabled: true };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.schedulerSecret) {
      return {
        schedulerSecret: String(parsed.schedulerSecret),
        fcmToken: parsed.fcmToken ? String(parsed.fcmToken) : null,
        lastQualifiedTradeKey: parsed.lastQualifiedTradeKey
          ? String(parsed.lastQualifiedTradeKey)
          : null,
        notificationsEnabled: parsed.notificationsEnabled !== false,
      };
    }
  } catch {}

  return {
    schedulerSecret: raw,
    fcmToken: null,
    lastQualifiedTradeKey: null,
    notificationsEnabled: true,
  };
}

async function getSchedulerSecretState(supabase) {
  const { data, error } = await supabase
    .from("trademind_scheduler_secrets")
    .select("secret")
    .eq("id", true)
    .limit(1)
    .maybeSingle();

  if (error || !data?.secret) {
    throw new Error("TradeMindMZ scheduler secret is not configured.");
  }

  return parseSchedulerSecretState(data.secret);
}

async function saveSchedulerSecretState(supabase, state) {
  const secret = String(state?.schedulerSecret || "").trim();
  if (!secret) throw new Error("TradeMindMZ scheduler secret is empty.");

  const value = JSON.stringify({
    schedulerSecret: secret,
    fcmToken: state?.fcmToken || null,
    lastQualifiedTradeKey: state?.lastQualifiedTradeKey || null,
    notificationsEnabled: state?.notificationsEnabled !== false,
  });

  const { error } = await supabase
    .from("trademind_scheduler_secrets")
    .update({ secret: value })
    .eq("id", true);

  if (error) throw new Error("Failed to save TradeMindMZ notification state: " + error.message);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8Base64UrlEncode(value) {
  return base64UrlEncode(new TextEncoder().encode(String(value)));
}

function pemToArrayBuffer(pem) {
  const base64 = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

async function getFcmAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = utf8Base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = utf8Base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claim;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsigned)
  );

  const assertion = unsigned + "." + base64UrlEncode(new Uint8Array(signature));
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer" +
      "&assertion=" + encodeURIComponent(assertion),
  });

  const tokenText = await tokenResponse.text();
  if (!tokenResponse.ok) {
    throw new Error("Google OAuth token request failed: " + tokenText.slice(0, 300));
  }

  const tokenPayload = JSON.parse(tokenText);
  if (!tokenPayload?.access_token) {
    throw new Error("Google OAuth response did not contain an access token.");
  }

  return tokenPayload.access_token;
}

async function sendQualifiedTradePush(supabase, payload, marketType = "PERP") {
  if (String(payload?.finalDecision || "").toUpperCase() !== "TRADE") {
    return { sent: false, skipped: true, reason: "NOT_QUALIFIED" };
  }

  const serviceAccountRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountRaw) {
    return { sent: false, skipped: true, reason: "FCM_SERVICE_ACCOUNT_NOT_CONFIGURED" };
  }

  const state = await getSchedulerSecretState(supabase);
  if (state.notificationsEnabled === false) {
    return { sent: false, skipped: true, reason: "NOTIFICATIONS_DISABLED" };
  }
  if (!state.fcmToken) {
    return { sent: false, skipped: true, reason: "NO_REGISTERED_DEVICE" };
  }

  const candidates = Array.isArray(payload?.candidates)
    ? payload.candidates
    : Array.isArray(payload?.engineTop5)
      ? payload.engineTop5
      : [];

  const symbol = String(payload?.aiDecision?.symbol || "").toUpperCase();
  const candidate =
    candidates.find((item) => String(item?.symbol || "").toUpperCase() === symbol) ||
    candidates[0] ||
    {};

  const direction = String(
    candidate?.direction || payload?.aiDecision?.direction || "TRADE"
  ).toUpperCase();
  const entry = Number(candidate?.entry ?? candidate?.price);
  const takeProfit = Number(candidate?.takeProfit);
  const stopLoss = Number(candidate?.stopLoss);
  const engineScore = Number(candidate?.engineScore ?? candidate?.score);
  const confidence = Number(
    payload?.aiDecision?.confidence ?? candidate?.confidence
  );

  const tradeKey = [
    String(marketType || "PERP").toUpperCase(),
    symbol || String(candidate?.symbol || "").toUpperCase(),
    direction,
    Number.isFinite(entry) ? entry.toFixed(4) : "NA",
    Number.isFinite(takeProfit) ? takeProfit.toFixed(4) : "NA",
    Number.isFinite(stopLoss) ? stopLoss.toFixed(4) : "NA",
  ].join("|");

  if (state.lastQualifiedTradeKey === tradeKey) {
    return { sent: false, skipped: true, reason: "DUPLICATE_QUALIFIED_TRADE", tradeKey };
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch {
    return { sent: false, skipped: true, reason: "INVALID_FCM_SERVICE_ACCOUNT_JSON" };
  }

  if (!serviceAccount?.project_id || !serviceAccount?.client_email || !serviceAccount?.private_key) {
    return { sent: false, skipped: true, reason: "INVALID_FCM_SERVICE_ACCOUNT_JSON" };
  }

  const accessToken = await getFcmAccessToken(serviceAccount);
  const title = "🔥 QUALIFIED TRADE";
  const body = [
    symbol || "TradeMindMZ",
    direction,
    Number.isFinite(engineScore) ? "Engine " + Math.round(engineScore) : null,
    Number.isFinite(confidence) ? "AI " + Math.round(confidence) + "%" : null,
    Number.isFinite(entry) ? "Entry " + entry : null,
    "TP +3% / SL -3%",
  ].filter(Boolean).join(" • ");

  const fcmResponse = await fetch(
    "https://fcm.googleapis.com/v1/projects/" +
      encodeURIComponent(serviceAccount.project_id) +
      "/messages:send",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json; UTF-8",
      },
      body: JSON.stringify({
        message: {
          token: state.fcmToken,
          notification: { title, body },
          data: {
            type: "QUALIFIED_TRADE",
            symbol: symbol || String(candidate?.symbol || ""),
            direction,
            marketType: String(marketType || "PERP").toUpperCase(),
            entry: Number.isFinite(entry) ? String(entry) : "",
            takeProfit: Number.isFinite(takeProfit) ? String(takeProfit) : "",
            stopLoss: Number.isFinite(stopLoss) ? String(stopLoss) : "",
          },
          android: {
            priority: "HIGH",
            notification: {
              channelId: "qualified-trades",
              sound: "default",
            },
          },
        },
      }),
    }
  );

  const responseText = await fcmResponse.text();
  if (!fcmResponse.ok) {
    if (fcmResponse.status === 404 || responseText.includes("UNREGISTERED")) {
      await saveSchedulerSecretState(supabase, {
        ...state,
        fcmToken: null,
      });
    }
    throw new Error("FCM send failed: " + fcmResponse.status + " " + responseText.slice(0, 300));
  }

  await saveSchedulerSecretState(supabase, {
    ...state,
    lastQualifiedTradeKey: tradeKey,
  });

  return { sent: true, tradeKey, provider: "FCM" };
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

  try {
    const state = await getSchedulerSecretState(supabase);
    return provided === state.schedulerSecret;
  } catch (error) {
    console.error("Scheduler authorization lookup failed:", error);
    return false;
  }
}

function liveAiOptionsFromUrl(url) {
  return {
    interval: url.searchParams.get("interval") || "15M",
    candleLimit: Number(url.searchParams.get("limit") || 100),
    maxMarkets: Number(url.searchParams.get("maxMarkets") || 25),
    marketType: url.searchParams.get("marketType") || "PERP",
    leverage: Number(url.searchParams.get("leverage") || 3),
    provider: url.searchParams.get("provider") || "groq",
  };
}

function applyFixedTradePlan(candidates = [], { marketType = "PERP" } = {}) {
  const normalizedMarketType =
    String(marketType || "PERP").toUpperCase() === "SPOT"
      ? "SPOT"
      : "PERP";

  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const entry = Number(candidate?.entry ?? candidate?.price);
    const direction = String(
      candidate?.direction || candidate?.side || candidate?.trend || ""
    ).toUpperCase();

    if (!Number.isFinite(entry) || entry <= 0) {
      return candidate;
    }

    const isShort =
      normalizedMarketType === "PERP" &&
      (direction === "SHORT" || direction === "SELL");

    const stopLoss = isShort
      ? entry * 1.03
      : entry * 0.97;
    const takeProfit = isShort
      ? entry * 0.97
      : entry * 1.03;

    return {
      ...candidate,
      entry,
      stopLoss,
      takeProfit,
      riskReward: 1,
      strategyPlan: {
        allocationPercent: 100,
        takeProfitPercent: 3,
        stopLossPercent: 3,
        leverage: normalizedMarketType === "PERP"
          ? Number(candidate?.leverage) || 3
          : 1,
      },
    };
  });
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
  leverage = 3,
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

      const strategyCandidates = applyFixedTradePlan(
        result.engineTop5,
        { marketType }
      );

      const aiDecision = await runDecision(
        strategyCandidates,
        provider,
        { marketType }
      );

      const selectedCandidate = strategyCandidates.find(
        (candidate) =>
          String(candidate?.symbol || "").toUpperCase() ===
          String(aiDecision?.symbol || "").toUpperCase()
      ) || null;

      const tradeQuality = selectedCandidate
        ? evaluateCandidate(selectedCandidate, { marketType })
        : null;

      const marketRegime = deriveMarketRegime(strategyCandidates);

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
        engineTop5: strategyCandidates,
        candidates: strategyCandidates,
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
          leverage: result.leverage || 3,
          automaticTrading: false,
          readOnly: true,
          persistedServerSide: true,
          riskFilter: "ENGINE SCORE 90+ + AI CONFIDENCE + RSI + VOLUME + NET EDGE + FIXED 3% TP/SL",
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

    analysisPromise
      .then(
        () => {
          if (liveAiInFlight.get(cacheKey) === analysisPromise) {
            liveAiInFlight.delete(cacheKey);
          }
        },
        () => {
          if (liveAiInFlight.get(cacheKey) === analysisPromise) {
            liveAiInFlight.delete(cacheKey);
          }
        }
      );
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
      const entryPrice = Number(
        row?.avgCost ??
        row?.averageCost ??
        row?.costPrice ??
        row?.average_cost ??
        row?.avg_cost
      );
      const reportedPnl = Number(
        row?.cmlPnl ??
        row?.cumulativePnl ??
        row?.unrealizedPnl
      );
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
        entryPrice: Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : null,
        costBasis: Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice * quantity : null,
        unrealizedPnl: Number.isFinite(reportedPnl)
          ? reportedPnl
          : Number.isFinite(entryPrice) && Number.isFinite(price)
            ? (price - entryPrice) * quantity
            : null,
        unrealizedPercent: Number.isFinite(entryPrice) && entryPrice > 0 && Number.isFinite(price)
          ? ((price - entryPrice) / entryPrice) * 100
          : null,
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
    const quantity = n(position?.quantity ?? position?.qty ?? position?.netSize ?? position?.positionAmt ?? position?.size ?? position?.amount);
    const rawEntryPrice = n(position?.entryPrice ?? position?.entry_price ?? position?.avgEntryPrice ?? position?.avgPrice ?? position?.averagePrice ?? position?.openPrice ?? position?.averageEntryPrice);
    const rawMarkPrice = n(position?.markPrice ?? position?.mark_price ?? position?.currentPrice ?? position?.lastPrice ?? position?.price);
    const entryPrice = Number.isFinite(rawEntryPrice) && rawEntryPrice > 0 ? rawEntryPrice : null;
    const markPrice = Number.isFinite(rawMarkPrice) && rawMarkPrice > 0 ? rawMarkPrice : null;
    const reportedUnrealizedPnl = n(
      position?.unrealizedPnl ??
      position?.unrealizedPNL ??
      position?.unrealizedProfit ??
      position?.unrealized_profit ??
      position?.unrealizedProfitLoss ??
      position?.unrealized_pnl ??
      position?.pnl ??
      position?.profit
    );
    const calculatedUnrealizedPnl =
      reportedUnrealizedPnl == null &&
      Number.isFinite(entryPrice) &&
      Number.isFinite(markPrice) &&
      Number.isFinite(quantity)
        ? (sideUpper === "SHORT" ? entryPrice - markPrice : markPrice - entryPrice) * Math.abs(quantity)
        : null;
    const unrealizedPnl = reportedUnrealizedPnl ?? calculatedUnrealizedPnl;
    const unrealizedPnlPercent =
      Number.isFinite(entryPrice) &&
      entryPrice > 0 &&
      Number.isFinite(markPrice)
        ? (sideUpper === "SHORT"
            ? ((entryPrice - markPrice) / entryPrice) * 100
            : ((markPrice - entryPrice) / entryPrice) * 100)
        : null;
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
      unrealizedPnlPercent,
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

  const marketIndicators = market?.indicators || {};
  const normalizedMarket = {
    symbol: market?.symbol || position?.symbol || null,
    timeframe: market?.timeframe || "15M",
    price: Number.isFinite(Number(market?.price)) ? Number(market.price) : null,
    engineScore: Number.isFinite(Number(market?.score ?? market?.engineScore))
      ? Number(market?.score ?? market?.engineScore)
      : null,
    confidence: Number.isFinite(Number(market?.confidence))
      ? Number(market.confidence)
      : null,
    direction: market?.direction || null,
    riskReward: Number.isFinite(Number(market?.riskReward))
      ? Number(market.riskReward)
      : null,
    stopLoss: Number.isFinite(Number(market?.stopLoss))
      ? Number(market.stopLoss)
      : null,
    takeProfit: Number.isFinite(Number(market?.takeProfit))
      ? Number(market.takeProfit)
      : null,
    rsi: Number.isFinite(Number(market?.rsi ?? marketIndicators?.rsi14))
      ? Number(market?.rsi ?? marketIndicators?.rsi14)
      : null,
    volumeRatio: Number.isFinite(Number(market?.volumeRatio ?? marketIndicators?.volumeRatio))
      ? Number(market?.volumeRatio ?? marketIndicators?.volumeRatio)
      : null,
    ema9: Number.isFinite(Number(market?.ema9 ?? marketIndicators?.ema9))
      ? Number(market?.ema9 ?? marketIndicators?.ema9)
      : null,
    ema21: Number.isFinite(Number(market?.ema21 ?? marketIndicators?.ema21))
      ? Number(market?.ema21 ?? marketIndicators?.ema21)
      : null,
    macd: Number.isFinite(Number(market?.macd ?? marketIndicators?.macd))
      ? Number(market?.macd ?? marketIndicators?.macd)
      : null,
    change24h: Number.isFinite(Number(market?.change24h ?? marketIndicators?.change24h))
      ? Number(market?.change24h ?? marketIndicators?.change24h)
      : null,
    scannedAt: market?.scannedAt || market?.updatedAt || null,
  };
  const hasMarketData = Number.isFinite(Number(normalizedMarket.price)) ||
    Number.isFinite(Number(normalizedMarket.engineScore)) ||
    Number.isFinite(Number(normalizedMarket.rsi));

  const prompt = {
    systemPrompt: `You are TradeMindMZ position risk analyst. Analyze ONLY the supplied Pionex position and supplied market data. Do not place trades and do not invent missing information. The position is USDT-M perpetual and read-only.

IMPORTANT DATA RULES:
- The MARKET DATA SUMMARY below is authoritative for this analysis when values are present.
- If hasMarketData=true, market data IS available. Do not say "market data is unavailable".
- If position stop-loss/take-profit fields are missing but MARKET DATA SUMMARY contains suggested stopLoss/takeProfit, explicitly distinguish "no user-defined SL/TP" from the available market-derived levels.
- Use the actual current position price and supplied market price. Do not invent values.
- Base confidence and risk on the supplied position, market score, RSI, volume, R/R, momentum, EMA/MACD and price distance.
- Return ONLY JSON: {"recommendation":"HOLD|WATCH|REDUCE_RISK|EXIT_CONSIDERATION","riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","confidence":0,"reasoning":"brief explanation","action":"brief practical guidance","holdTimeMinMinutes":0,"holdTimeMaxMinutes":0,"holdTimeReason":"brief explanation of expected remaining hold time"}. Hold time is an estimate, not a guarantee.

MARKET DATA AVAILABLE: ${hasMarketData ? "YES" : "NO"}`,
    userPrompt: `OPEN POSITION:
${JSON.stringify(position, null, 2)}

MARKET DATA SUMMARY:
${JSON.stringify(normalizedMarket, null, 2)}

RAW MARKET DATA:
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

  const rawReasoning = String(
    raw?.reasoning ||
    "AI did not provide reasoning."
  );
  const rawAction = String(
    raw?.action ||
    "Continue monitoring."
  );
  const rawHoldReason = String(
    raw?.holdTimeReason ||
    ""
  );

  const marketContextLine = hasMarketData
    ? [
        Number.isFinite(Number(normalizedMarket.engineScore))
          ? `Engine Score ${Number(normalizedMarket.engineScore)}/100`
          : null,
        Number.isFinite(Number(normalizedMarket.confidence))
          ? `market confidence ${Number(normalizedMarket.confidence)}%`
          : null,
        Number.isFinite(Number(normalizedMarket.riskReward))
          ? `R/R ${Number(normalizedMarket.riskReward)}:1`
          : null,
        Number.isFinite(Number(normalizedMarket.rsi))
          ? `RSI ${Number(normalizedMarket.rsi)}`
          : null,
        Number.isFinite(Number(normalizedMarket.volumeRatio))
          ? `volume ${Number(normalizedMarket.volumeRatio)}x`
          : null,
        Number.isFinite(Number(normalizedMarket.price))
          ? `market price ${Number(normalizedMarket.price)}`
          : null,
      ].filter(Boolean).join(", ")
    : "";

  const sanitizeMarketText = (value) => {
    let text = String(value || "");
    if (!hasMarketData) return text;

    text = text
      .replace(/market data (?:is )?unavailable/gi, "supplied market data is available")
      .replace(/market data (?:is )?not available/gi, "supplied market data is available")
      .replace(/no market data (?:is )?available/gi, "supplied market data is available");

    if (Number.isFinite(Number(normalizedMarket.stopLoss)) ||
        Number.isFinite(Number(normalizedMarket.takeProfit))) {
      text = text.replace(
        /no stop[- ]loss or take[- ]profit (?:levels )?are defined/gi,
        "no user-defined stop-loss/take-profit levels are attached to the position; market-derived levels are available"
      );
    }

    return text;
  };

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

    reasoning: [
      sanitizeMarketText(rawReasoning),
      marketContextLine ? `Market context: ${marketContextLine}.` : null,
    ].filter(Boolean).join(" "),

    action: sanitizeMarketText(rawAction),

    holdTimeMinMinutes:
      holdMin,

    holdTimeMaxMinutes:
      holdMax,

    holdTimeReason:
      sanitizeMarketText(rawHoldReason),
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
    analyzedAt: history?.created_at || new Date().toISOString(),
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
    .select("*")
    .eq("position_key", key)
    .maybeSingle();

  const currentEntryPrice = Number(position?.entryPrice);
  const existingEntryPrice = Number(existingJournal?.entry_price);
  const effectiveEntryPrice = Number.isFinite(currentEntryPrice) && currentEntryPrice > 0
    ? currentEntryPrice
    : Number.isFinite(existingEntryPrice) && existingEntryPrice > 0
      ? existingEntryPrice
      : null;
  const currentQuantity = Number(position?.quantity);
  const existingQuantity = Number(existingJournal?.quantity);
  const effectiveQuantity = Number.isFinite(currentQuantity) && currentQuantity > 0
    ? currentQuantity
    : Number.isFinite(existingQuantity) && existingQuantity > 0
      ? existingQuantity
      : null;
  const currentPrice = Number(position?.currentPrice ?? position?.markPrice);
  const effectiveLastPrice = Number.isFinite(currentPrice) && currentPrice > 0
    ? currentPrice
    : Number(existingJournal?.last_price);
  const effectiveLastPnl = Number.isFinite(currentPrice) && currentPrice > 0 && Number.isFinite(effectiveEntryPrice) && effectiveEntryPrice > 0
    ? Number(position?.unrealizedPnl)
    : null;
  const effectiveLastPnlPercent = Number.isFinite(currentPrice) && currentPrice > 0 && Number.isFinite(effectiveEntryPrice) && effectiveEntryPrice > 0
    ? calculatePositionPnlPercent({ ...position, entryPrice: effectiveEntryPrice, currentPrice })
    : null;
  const row = {
    position_key: key,
    symbol: String(position.symbol).trim().toUpperCase(),
    side: direction === "SELL" ? "SHORT" : "LONG",
    entry_price: effectiveEntryPrice,
    quantity: effectiveQuantity,
    stop_loss: Number.isFinite(Number(position.stopLoss)) ? Number(position.stopLoss) : null,
    take_profit: Number.isFinite(Number(position.takeProfit)) ? Number(position.takeProfit) : null,
    ai_confidence_at_entry:
      Number.isFinite(Number(existingJournal?.ai_confidence_at_entry))
        ? Number(existingJournal.ai_confidence_at_entry)
        : (analysis?.confidence != null && Number.isFinite(Number(analysis.confidence))
          ? Number(analysis.confidence)
          : null),
    ai_hold_time_min_minutes:
      existingJournal?.ai_hold_time_min_minutes != null
        ? Number(existingJournal.ai_hold_time_min_minutes)
        : (analysis?.holdTimeMinMinutes != null ? Number(analysis.holdTimeMinMinutes) : null),
    ai_hold_time_max_minutes:
      existingJournal?.ai_hold_time_max_minutes != null
        ? Number(existingJournal.ai_hold_time_max_minutes)
        : (analysis?.holdTimeMaxMinutes != null ? Number(analysis.holdTimeMaxMinutes) : null),
    ai_hold_time_reason:
      existingJournal?.ai_hold_time_reason || analysis?.holdTimeReason || null,
    last_price: Number.isFinite(effectiveLastPrice) && effectiveLastPrice > 0
      ? effectiveLastPrice
      : null,
    last_pnl: Number.isFinite(effectiveLastPnl)
      ? effectiveLastPnl
      : null,
    last_pnl_percent: effectiveLastPnlPercent,
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

  const systemPrompt = 'You are the TradeMindMZ Spot exit-monitoring analyst. Analyze only the supplied Spot holding and market data. Do not place orders. Spot holdings are long-only. Return JSON only: {"recommendation":"HOLD|EXIT_CONSIDERATION|REDUCE_RISK","confidence":0,"reasoning":"brief reason","action":"brief practical guidance","holdTimeMinMinutes":0,"holdTimeMaxMinutes":0,"holdTimeReason":"brief estimate"}. Never invent an entry price or P&L.';
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

  for (const holding of holdings.slice(0, 5)) {
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
        ai_confidence_at_entry:
          existingSpotJournal?.ai_confidence_at_entry != null
            ? Number(existingSpotJournal.ai_confidence_at_entry)
            : (analysis?.confidence != null ? Number(analysis.confidence) : null),
        ai_hold_time_min_minutes:
          existingSpotJournal?.ai_hold_time_min_minutes != null
            ? Number(existingSpotJournal.ai_hold_time_min_minutes)
            : (analysis?.holdTimeMinMinutes != null ? Number(analysis.holdTimeMinMinutes) : null),
        ai_hold_time_max_minutes:
          existingSpotJournal?.ai_hold_time_max_minutes != null
            ? Number(existingSpotJournal.ai_hold_time_max_minutes)
            : (analysis?.holdTimeMaxMinutes != null ? Number(analysis.holdTimeMaxMinutes) : null),
        ai_hold_time_reason:
          existingSpotJournal?.ai_hold_time_reason || analysis?.holdTimeReason || null,
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

async function getPositionMarketContexts(positions = [], fallbackCandidates = []) {
  const contexts = new Map();
  const fallback = Array.isArray(fallbackCandidates) ? fallbackCandidates : [];

  for (const candidate of fallback) {
    const symbol = String(candidate?.symbol || "").toUpperCase();
    if (symbol) contexts.set(symbol, candidate);
  }

  const missing = (Array.isArray(positions) ? positions : []).filter((position) => {
    const symbol = String(position?.symbol || "").toUpperCase();
    return symbol && !contexts.has(symbol);
  });

  if (!missing.length) {
    return contexts;
  }

  let tickerMap = new Map();
  try {
    const tickerPayload = await getMarketTickers({ type: "PERP" });
    const tickers =
      tickerPayload?.data?.tickers ??
      tickerPayload?.data ??
      tickerPayload?.tickers ??
      [];

    for (const ticker of Array.isArray(tickers) ? tickers : []) {
      const symbol = String(
        ticker?.symbol ??
        ticker?.market ??
        ""
      ).toUpperCase();
      if (symbol) tickerMap.set(symbol, ticker);
    }
  } catch (error) {
    console.warn("Position market ticker lookup failed:", error);
  }

  await Promise.all(
    missing.map(async (position) => {
      const symbol = String(position?.symbol || "").toUpperCase();
      if (!symbol) return;

      try {
        const payload = await getMarketKlines({
          symbol,
          interval: "15M",
          limit: 100,
        });
        const candles = parsePionexKlines(payload);
        const candidate = scorePionexCandidate({
          symbol,
          candles,
          ticker: tickerMap.get(symbol) || {},
          marketType: "PERP",
          leverage: Number(position?.leverage) || 2,
          interval: "15M",
        });

        if (candidate) {
          contexts.set(symbol, {
            ...candidate,
            scannedAt: candidate.scannedAt || new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn(
          `Position market context lookup failed for ${symbol}:`,
          error?.message || error
        );
      }
    })
  );

  return contexts;
}

async function runServerPositionMonitoring(supabase, { marketSnapshot = null } = {}) {
  const raw = await getOpenPositions();
  const positions = normalizePositions(raw);
  const currentKeys = new Set();

  const snapshotTimestamp =
    marketSnapshot?.snapshot?.updatedAt ||
    marketSnapshot?.snapshot?.persistedAt ||
    marketSnapshot?.updatedAt ||
    marketSnapshot?.persistedAt ||
    null;

  const rawCandidates =
    Array.isArray(marketSnapshot?.snapshot?.candidates)
      ? marketSnapshot.snapshot.candidates
      : Array.isArray(marketSnapshot?.candidates)
        ? marketSnapshot.candidates
        : [];

  const candidates = rawCandidates.map(candidate => (
    candidate && typeof candidate === "object" && snapshotTimestamp && !candidate.scannedAt
      ? { ...candidate, scannedAt: snapshotTimestamp }
      : candidate
  ));

  const monitored = [];
  const maxPositions = Math.min(5, positions.length);
  const positionList = positions.slice(0, maxPositions);
  const marketContexts = await getPositionMarketContexts(
    positionList,
    candidates
  );

  for (const position of positionList) {
    const key = normalizedPositionKey(position);
    currentKeys.add(key);

    const market =
      marketContexts.get(String(position?.symbol || "").toUpperCase()) ||
      {};

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
        market,
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

  let { data: analyses, error: analysisError } = await supabase
    .from("position_ai_analysis")
    .select("id,symbol,direction,recommendation,risk_level,confidence,reasoning,action,hold_time_min_minutes,hold_time_max_minutes,hold_time_reason,provider,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (analysisError) {
    console.error("Position monitoring analysis query failed:", analysisError);
  }

  // The market card can be fresh while the stored AI reasoning is old.
  // If an open position has no recent analysis, refresh it server-side before
  // returning the monitoring payload so stale reasoning cannot be shown beside
  // fresh market metrics.
  const analysisByKey = new Map();
  for (const row of analyses || []) {
    const key = `${String(row.symbol || "").toUpperCase()}:${String(row.direction || "").toUpperCase()}`;
    if (!analysisByKey.has(key)) analysisByKey.set(key, row);
  }

  const staleOrMissingAnalysis = positions.some((position) => {
    const key = `${String(position.symbol || "").toUpperCase()}:${positionDirection(position)}`;
    const row = analysisByKey.get(key);
    if (!row?.created_at) return true;
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    return !Number.isFinite(ageMs) || ageMs > 15 * 60 * 1000;
  });

  if (staleOrMissingAnalysis && positions.length) {
    try {
      await runServerPositionMonitoring(supabase);
      const refreshed = await supabase
        .from("position_ai_analysis")
        .select("id,symbol,direction,recommendation,risk_level,confidence,reasoning,action,hold_time_min_minutes,hold_time_max_minutes,hold_time_reason,provider,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      analyses = refreshed.data || analyses;
      analysisError = refreshed.error || analysisError;
    } catch (refreshError) {
      console.error("Fresh position AI monitoring refresh failed:", refreshError);
    }
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

  const marketContexts = await getPositionMarketContexts(positions, []);

  const enriched = positions.map((position) => {
    const key = `${String(position.symbol || "").toUpperCase()}:${positionDirection(position)}`;
    const market =
      marketContexts.get(String(position?.symbol || "").toUpperCase()) ||
      {};
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
    const analyzedAt = current?.created_at || null;
    const analyzedTimestamp = analyzedAt ? new Date(analyzedAt).getTime() : NaN;
    const analysisAgeSeconds = Number.isFinite(analyzedTimestamp)
      ? Math.max(0, Math.floor((Date.now() - analyzedTimestamp) / 1000))
      : null;
    const analysisFresh = Number.isFinite(analysisAgeSeconds)
      ? analysisAgeSeconds <= 15 * 60
      : false;

    const exitWarning =
      recommendation === "EXIT_CONSIDERATION" ||
      recommendation === "REDUCE_RISK" ||
      riskLevel === "CRITICAL" ||
      riskLevel === "HIGH" ||
      (Number.isFinite(confidenceDelta) && confidenceDelta <= -10);

    return {
      ...position,
      engineScore: Number.isFinite(Number(market?.engineScore ?? market?.score))
        ? Number(market?.engineScore ?? market?.score)
        : null,
      rsi: Number.isFinite(Number(market?.rsi ?? market?.indicators?.rsi14))
        ? Number(market?.rsi ?? market?.indicators?.rsi14)
        : null,
      volumeRatio: Number.isFinite(Number(market?.volumeRatio ?? market?.indicators?.volumeRatio))
        ? Number(market?.volumeRatio ?? market?.indicators?.volumeRatio)
        : null,
      marketConfidence: Number.isFinite(Number(market?.confidence))
        ? Number(market.confidence)
        : null,
      marketRiskReward: Number.isFinite(Number(market?.riskReward))
        ? Number(market.riskReward)
        : null,
      marketUpdatedAt: market?.scannedAt || market?.updatedAt || null,
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
        analyzedAt,
        analysisAgeSeconds,
        analysisFresh,
        exitWarning,
      },
    };
  });

  const { data: journalRows, error: journalError } = await supabase
    .from("trade_journal")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (journalError) {
    console.error("Trade journal query failed:", journalError);
  }

  const journal = await Promise.all((journalRows || []).map(async (row) => {
    const rowEntry = Number(row?.entry_price);
    const rowConfidence = Number(row?.ai_confidence_at_entry);
    const direction = String(row?.side || "").toUpperCase() === "SHORT" ? "SELL" : "BUY";
    const analysisMatch = (analyses || []).find((analysis) =>
      String(analysis?.symbol || "").toUpperCase() === String(row?.symbol || "").toUpperCase() &&
      String(analysis?.direction || "").toUpperCase() === direction &&
      Number.isFinite(Number(analysis?.entry_price)) && Number(analysis.entry_price) > 0
    );
    const recoveredEntry = Number.isFinite(rowEntry) && rowEntry > 0
      ? rowEntry
      : Number.isFinite(Number(analysisMatch?.entry_price)) && Number(analysisMatch.entry_price) > 0
        ? Number(analysisMatch.entry_price)
        : null;
    const recoveredConfidence = Number.isFinite(rowConfidence)
      ? rowConfidence
      : Number.isFinite(Number(analysisMatch?.confidence))
        ? Number(analysisMatch.confidence)
        : null;
    const needsBackfill =
      (recoveredEntry !== null && (!Number.isFinite(rowEntry) || rowEntry <= 0)) ||
      (recoveredConfidence !== null && !Number.isFinite(rowConfidence));
    if (needsBackfill) {
      const patch = {};
      if (recoveredEntry !== null && (!Number.isFinite(rowEntry) || rowEntry <= 0)) patch.entry_price = recoveredEntry;
      if (recoveredConfidence !== null && !Number.isFinite(rowConfidence)) patch.ai_confidence_at_entry = recoveredConfidence;
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        await supabase.from("trade_journal").update(patch).eq("position_key", row.position_key);
        return { ...row, ...patch };
      }
    }
    return row;
  }));

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

function buildPerformanceWindow(rows = [], days = 7) {
  const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
  const scoped = rows.filter((row) => {
    const closedAt = new Date(row.closed_at || row.updated_at || row.created_at || 0).getTime();
    return Number.isFinite(closedAt) && closedAt >= cutoff;
  });

  let wins = 0;
  let losses = 0;
  let netPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let pnlSamples = 0;
  let confidenceSum = 0;
  let confidenceSamples = 0;
  let stopLossLike = 0;

  const confidenceBuckets = {
    "<60": { trades: 0, wins: 0, netPnl: 0 },
    "60-74": { trades: 0, wins: 0, netPnl: 0 },
    "75-89": { trades: 0, wins: 0, netPnl: 0 },
    "90+": { trades: 0, wins: 0, netPnl: 0 },
  };

  for (const row of scoped) {
    const pnl = Number(row.net_pnl ?? row.realized_pnl);
    const entry = Number(row.entry_price);
    const quantity = Number(row.quantity);
    const pnlPercent = Number(row.last_pnl_percent);
    const fallbackPercent = Number.isFinite(pnl) && Number.isFinite(entry) && entry > 0 && Number.isFinite(quantity) && quantity > 0
      ? (pnl / (entry * quantity)) * 100
      : pnlPercent;

    if (Number.isFinite(pnl)) {
      netPnl += pnl;
      pnlSamples += 1;
      if (pnl > 0) { wins += 1; grossProfit += pnl; }
      else if (pnl < 0) { losses += 1; grossLoss += Math.abs(pnl); }
    } else if (Number.isFinite(fallbackPercent)) {
      if (fallbackPercent > 0) wins += 1;
      else if (fallbackPercent < 0) losses += 1;
    }

    const confidence = Number(row.ai_confidence_at_entry);
    if (Number.isFinite(confidence)) {
      confidenceSum += confidence;
      confidenceSamples += 1;
      const bucket = confidence < 60 ? confidenceBuckets["<60"] : confidence < 75 ? confidenceBuckets["60-74"] : confidence < 90 ? confidenceBuckets["75-89"] : confidenceBuckets["90+"];
      bucket.trades += 1;
      if (Number.isFinite(pnl) && pnl > 0) bucket.wins += 1;
      if (Number.isFinite(pnl)) bucket.netPnl += pnl;
    }

    const reason = String(row.close_reason || "").toLowerCase();
    const stop = Number(row.stop_loss);
    const exit = Number(row.exit_price);
    const nearStop = Number.isFinite(stop) && stop > 0 && Number.isFinite(exit) && Math.abs(exit - stop) / stop <= 0.003;
    if (reason.includes("stop-loss") || reason.includes("stop loss") || reason.includes("stop_loss") || nearStop) {
      stopLossLike += 1;
    }
  }

  const closed = scoped.length;
  const winRate = closed ? Math.round((wins / closed) * 1000) / 10 : null;
  const avgPnl = pnlSamples ? netPnl / pnlSamples : null;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0;
  const averageConfidence = confidenceSamples ? confidenceSum / confidenceSamples : null;

  for (const bucket of Object.values(confidenceBuckets)) {
    bucket.winRate = bucket.trades ? Math.round((bucket.wins / bucket.trades) * 1000) / 10 : null;
    bucket.avgPnl = bucket.trades ? bucket.netPnl / bucket.trades : null;
  }

  return {
    days,
    closed,
    wins,
    losses,
    winRate,
    netPnl,
    avgPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    averageConfidence,
    stopLossLike,
    confidenceBuckets,
  };
}

async function getTradePerformanceSummary(supabase) {
  const { data, error } = await supabase
    .from("trade_journal")
    .select("position_key,symbol,side,entry_price,quantity,stop_loss,take_profit,ai_confidence_at_entry,last_pnl_percent,realized_pnl,net_pnl,exit_price,closed_at,close_reason,created_at,updated_at,status")
    .eq("status", "CLOSED")
    .gte("closed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("closed_at", { ascending: false })
    .limit(1000);

  if (error) throw new Error("Performance summary query failed: " + error.message);

  const rows = Array.isArray(data) ? data : [];
  const windows = {
    "24h": buildPerformanceWindow(rows, 1),
    "7d": buildPerformanceWindow(rows, 7),
    "30d": buildPerformanceWindow(rows, 30),
  };

  const recent = windows["7d"];
  const priorCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const priorRows = rows.filter((row) => {
    const closedAt = new Date(row.closed_at || 0).getTime();
    return Number.isFinite(closedAt) && closedAt < Date.now() - 7 * 24 * 60 * 60 * 1000 && closedAt >= priorCutoff;
  });
  const prior = buildPerformanceWindow(priorRows, 7);

  const trend = recent.closed < 3 || prior.closed < 3
    ? "INSUFFICIENT_DATA"
    : recent.netPnl > prior.netPnl * 1.05
      ? "IMPROVING"
      : recent.netPnl < prior.netPnl * 0.95
        ? "WEAKENING"
        : "STABLE";

  const status = recent.closed < 3
    ? "INSUFFICIENT_DATA"
    : recent.netPnl > 0 && recent.winRate >= 50
      ? "POSITIVE"
      : recent.netPnl < 0 && recent.winRate < 50
        ? "UNDER_PRESSURE"
        : "MIXED";

  const learning = {
    mode: "OBSERVE_ONLY",
    signalOverride: false,
    automaticTrading: false,
    samples: recent.closed,
    averageConfidence: recent.averageConfidence,
    actualWinRate: recent.winRate,
    confidenceGap: Number.isFinite(recent.averageConfidence) && Number.isFinite(recent.winRate)
      ? Math.round((recent.averageConfidence - recent.winRate) * 10) / 10
      : null,
    confidenceBuckets: recent.confidenceBuckets,
    trend,
    note: "TradeMindMZ uses closed trade outcomes as feedback for calibration and analysis. This layer does not automatically change signal thresholds or place trades.",
  };

  return {
    success: true,
    updatedAt: new Date().toISOString(),
    status,
    trend,
    windows,
    learning,
    recentLosses: rows.filter((row) => {
      const t = new Date(row.closed_at || 0).getTime();
      const pnl = Number(row.net_pnl ?? row.realized_pnl);
      return Number.isFinite(t) && t >= Date.now() - 24 * 60 * 60 * 1000 && Number.isFinite(pnl) && pnl < 0;
    }).slice(0, 8).map((row) => ({
      symbol: row.symbol,
      side: row.side,
      pnl: Number(row.net_pnl ?? row.realized_pnl),
      confidence: Number.isFinite(Number(row.ai_confidence_at_entry)) ? Number(row.ai_confidence_at_entry) : null,
      closeReason: row.close_reason || null,
      closedAt: row.closed_at,
    })),
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
    minimumScore: Math.round(Math.max(0, Math.min(100, n(source.minimumScore,90)))),
    minimumConfidence: Math.round(Math.max(0, Math.min(100, n(source.minimumConfidence,80)))),
    minimumRiskReward: Number(Math.max(.1, Math.min(20, n(source.minimumRiskReward,1))).toFixed(2)),
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
    { key:"rsi",label:"RSI",actual:rsi,target:String(criteria.minimumRsi)+"–"+String(criteria.maximumRsi),operator:"RANGE",passed:Number.isFinite(rsi)&&rsi>=criteria.minimumRsi&&rsi<=criteria.maximumRsi },
    { key:"volumeRatio",label:"Volume ratio",actual:volume,target:criteria.minimumVolumeRatio,operator:">=",passed:Number.isFinite(volume)&&volume>=criteria.minimumVolumeRatio },
    { key:"tradeLevels",label:"Trade levels",actual:"",target:direction==="BUY"?"SL < Entry < TP":direction==="SELL"?"SL > Entry > TP":"Valid direction",operator:"STRUCTURE",passed:direction==="BUY"?sl<entry&&entry<tp:direction==="SELL"?sl>entry&&entry>tp:false },
    { key:"spotDirection",label:"Spot direction",actual:direction,target:"BUY",operator:"=",passed:normalizedMarketType==="PERP" || direction==="BUY" },
    { key:"netEdge",label:"Net edge after costs",actual:Number.isFinite(netTargetRate)?(netTargetRate*100).toFixed(2)+"%":"—",target:">= "+(minimumNetEdgeRate*100).toFixed(2)+"%",operator:">=",passed:Number.isFinite(netTargetRate)&&netTargetRate>=minimumNetEdgeRate },
    { key:"highRisk",label:"HIGH risk protection",actual:risk==="HIGH"?String(score)+" / "+String(confidence)+"%":"NOT REQUIRED",target:risk==="HIGH"?String(criteria.highRisk.minimumScore)+" / "+String(criteria.highRisk.minimumConfidence)+"%":"Only enforced for HIGH risk",operator:risk==="HIGH"?">=":"INFO",passed:risk==="HIGH"?Number.isFinite(score)&&Number.isFinite(confidence)&&score>=criteria.highRisk.minimumScore&&confidence>=criteria.highRisk.minimumConfidence:true },
  ];
  return { passed: checks.every((x)=>x.passed), checks, failedChecks: checks.filter((x)=>!x.passed), criteria, costs:{feeRate,slippageRate,roundTripCostRate,grossTargetRate,netTargetRate,minimumNetEdgeRate} };
}

function calculateRiskSizing(body = {}) {
  const balance = Number(body?.balanceUsdt);
  const entry = Number(body?.entryPrice);
  const stop = Number(body?.stopLoss);
  const riskPercent = Math.max(0.1, Math.min(10, Number(body?.riskPercent) || 3));
  const maxAllocationPercent = Math.max(1, Math.min(100, Number(body?.maxAllocationPercent) || 100));
  const leverage = Math.max(1, Math.min(10, Number(body?.leverage) || 3));
  const marketType = String(body?.marketType || "PERP").toUpperCase() === "SPOT" ? "SPOT" : "PERP";
  if (![balance, entry, stop].every(Number.isFinite) || balance <= 0 || entry <= 0 || stop <= 0 || entry === stop) {
    throw new Error("balanceUsdt, entryPrice and stopLoss are required.");
  }
  const stopDistancePct = Math.abs(entry - stop) / entry;
  const allocationCap = balance * (maxAllocationPercent / 100);
  const suggestedMargin = Math.min(balance, allocationCap);
  const suggestedNotional = marketType === "PERP" ? suggestedMargin * leverage : suggestedMargin;
  const riskBasedNotional = suggestedNotional;
  const maxLoss = suggestedNotional * stopDistancePct;
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
    leverage: marketType === "PERP" ? leverage : 1,
    allocationUsdt: suggestedMargin,
    allocationPercent: maxAllocationPercent,
    maxLossUsdt: maxLoss,
    stopDistancePct: stopDistancePct * 100,
    takeProfitPercent: 3,
    stopLossPercent: 3,
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
        leverage: Number(url.searchParams.get("leverage") || 3),
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
            Number(url.searchParams.get("leverage") || 3),
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


  if (path === "/api/ai/copilot" && method === "POST") {
    try {
      const admin = supabaseAdmin();
      const marketType = String(body?.marketType || "PERP").toUpperCase() === "SPOT" ? "SPOT" : "PERP";
      const action = String(body?.action || "ASK").toUpperCase();
      const userMessage = String(body?.message || "").trim().slice(0, 700);
      const allowedActions = new Set([
        "ASK",
        "LIVE_SIGNAL",
        "BEST_SETUP",
        "WHAT_NOW",
        "POSITION_CHECK",
        "DEEP_ANALYSIS",
        "STATUS",
        "DIAGNOSTICS",
      ]);
      if (!allowedActions.has(action)) {
        return response({ success:false, error:"Unsupported AI Copilot action." },400);
      }

      const leverage = marketType === "SPOT" ? 1 : 3;
      const needsFreshScan =
        action === "LIVE_SIGNAL" ||
        action === "BEST_SETUP" ||
        action === "WHAT_NOW" ||
        action === "DEEP_ANALYSIS";

      let snapshot = null;
      if (needsFreshScan) {
        snapshot = await runLiveAiAnalysis({
          interval:"15M",
          candleLimit:100,
          maxMarkets:25,
          marketType,
          leverage,
          provider:"groq",
          force:true,
          persist:true,
        });
      } else {
        const { data } = await admin
          .from("market_ai_snapshots")
          .select("market_type,interval,leverage,scanned,candidates,ai_decision,final_decision,provider,next_analysis_at,payload,created_at")
          .eq("market_type",marketType)
          .eq("interval","15M")
          .eq("leverage",leverage)
          .order("created_at",{ascending:false})
          .limit(1)
          .maybeSingle();
        snapshot = data || null;
      }

      let livePositions = [];
      let positionFeedError = null;
      try {
        livePositions = normalizePositions(await getOpenPositions());
      } catch (positionError) {
        positionFeedError = positionError?.message || String(positionError);
      }

      let diagnostics = null;
      if (action === "STATUS" || action === "DIAGNOSTICS" || action === "ASK" || action === "WHAT_NOW" || action === "DEEP_ANALYSIS") {
        const { data } = await admin
          .from("trademind_scheduler_runs")
          .select("id,status,started_at,finished_at,duration_ms,perp_duration_ms,spot_duration_ms,monitoring_duration_ms,current_stage,position_monitoring_count,spot_monitoring_count,perp_scanned,perp_candidates,perp_provider,perp_decision,perp_push_status,spot_scanned,spot_candidates,spot_provider,spot_decision,spot_push_status,error")
          .order("created_at",{ascending:false})
          .limit(1)
          .maybeSingle();
        diagnostics = data || null;
      }

      let performanceSummary = null;
      try {
        performanceSummary = await getTradePerformanceSummary(admin);
      } catch (performanceError) {
        console.warn("Copilot performance summary unavailable:", performanceError?.message || performanceError);
      }

      const snapshotPayload = snapshot?.payload || snapshot || null;

      const compactCandidate = (candidate) => {
        if (!candidate || typeof candidate !== "object") return null;
        return {
          symbol: candidate.symbol || candidate.market || null,
          direction: candidate.direction || candidate.side || null,
          score: candidate.engineScore ?? candidate.score ?? null,
          confidence: candidate.confidence ?? null,
          entry: candidate.entry ?? null,
          stopLoss: candidate.stopLoss ?? null,
          takeProfit: candidate.takeProfit ?? null,
          riskReward: candidate.riskReward ?? null,
          change24h: candidate.change24h ?? candidate.priceChange24h ?? null,
          rsi: candidate.rsi ?? candidate.indicators?.rsi14 ?? null,
          volumeRatio: candidate.volumeRatio ?? candidate.indicators?.volumeRatio ?? null,
        };
      };

      const compactPosition = (position) => {
        if (!position || typeof position !== "object") return null;
        return {
          symbol: position.symbol || null,
          side: position.side || position.direction || null,
          quantity: position.quantity ?? null,
          entryPrice: position.entryPrice ?? null,
          currentPrice: position.currentPrice ?? position.markPrice ?? null,
          unrealizedPnl: position.unrealizedPnl ?? null,
          unrealizedPnlPercent: position.unrealizedPnlPercent ?? null,
          leverage: position.leverage ?? null,
          margin: position.margin ?? null,
          liquidationPrice: position.liquidationPrice ?? null,
          status: position.status || "OPEN",
        };
      };

      const compactSnapshot = snapshotPayload ? {
        marketType: snapshotPayload.marketType || snapshot?.market_type || marketType,
        interval: snapshotPayload.interval || snapshot?.interval || "15M",
        leverage: snapshotPayload.leverage ?? snapshot?.leverage ?? leverage,
        scanned: snapshotPayload.scanned ?? snapshot?.scanned ?? null,
        createdAt: snapshot?.created_at || snapshotPayload.createdAt || snapshotPayload.updatedAt || null,
        persistedAt: snapshotPayload.persistedAt || null,
        updatedAt: snapshotPayload.updatedAt || null,
        marketRegime: snapshotPayload.marketRegime?.regime || null,
        marketRegimeDetail: snapshotPayload.marketRegime ? {
          change24h: snapshotPayload.marketRegime.change24h ?? null,
          emaAligned: snapshotPayload.marketRegime.emaAligned ?? null,
          score: snapshotPayload.marketRegime.score ?? null,
        } : null,
        finalDecision: snapshotPayload.finalDecision || snapshot?.final_decision || "NO_TRADE",
        aiDecision: snapshotPayload.aiDecision ? {
          decision: snapshotPayload.aiDecision.decision || null,
          confidence: snapshotPayload.aiDecision.confidence ?? null,
          provider: snapshotPayload.aiDecision.provider || snapshot?.provider || null,
          reasoning: String(snapshotPayload.aiDecision.reasoning || "").slice(0, 900),
          engineReasons: Array.isArray(snapshotPayload.aiDecision.engineReasons)
            ? snapshotPayload.aiDecision.engineReasons.slice(0, 8)
            : [],
        } : {
          decision: snapshot?.ai_decision || null,
          provider: snapshot?.provider || null,
        },
        recommended: compactCandidate(snapshotPayload.recommended),
        topCandidates: Array.isArray(snapshotPayload.candidates)
          ? snapshotPayload.candidates.slice(0, 5).map(compactCandidate).filter(Boolean)
          : [],
        criteria: snapshotPayload.criteria ? {
          passed: snapshotPayload.criteria.passed ?? null,
          failedChecks: Array.isArray(snapshotPayload.criteria.failedChecks)
            ? snapshotPayload.criteria.failedChecks.slice(0, 8).map((check) =>
                typeof check === "object"
                  ? { key: check.key, label: check.label, actual: check.actual, target: check.target, operator: check.operator }
                  : String(check)
              )
            : [],
        } : null,
      } : null;

      const compactScheduler = diagnostics ? {
        status: diagnostics.status,
        currentStage: diagnostics.current_stage,
        startedAt: diagnostics.started_at,
        finishedAt: diagnostics.finished_at,
        durationMs: diagnostics.duration_ms,
        perpDurationMs: diagnostics.perp_duration_ms,
        spotDurationMs: diagnostics.spot_duration_ms,
        monitoringDurationMs: diagnostics.monitoring_duration_ms,
        perpScanned: diagnostics.perp_scanned,
        perpCandidates: diagnostics.perp_candidates,
        perpProvider: diagnostics.perp_provider,
        perpDecision: diagnostics.perp_decision,
        perpPushStatus: diagnostics.perp_push_status,
        spotScanned: diagnostics.spot_scanned,
        spotCandidates: diagnostics.spot_candidates,
        spotProvider: diagnostics.spot_provider,
        spotDecision: diagnostics.spot_decision,
        spotPushStatus: diagnostics.spot_push_status,
        positionMonitoringCount: diagnostics.position_monitoring_count,
        spotMonitoringCount: diagnostics.spot_monitoring_count,
        error: diagnostics.error ? String(diagnostics.error).slice(0, 700) : null,
      } : null;

      const compactPerformance = performanceSummary ? {
        status: performanceSummary.status,
        trend: performanceSummary.trend,
        windows: Object.fromEntries(
          Object.entries(performanceSummary.windows || {}).map(([key, value]) => [key, {
            closed: value.closed,
            wins: value.wins,
            losses: value.losses,
            winRate: value.winRate,
            netPnl: value.netPnl,
            avgPnl: value.avgPnl,
            profitFactor: value.profitFactor,
            averageConfidence: value.averageConfidence,
            stopLossLike: value.stopLossLike,
          }])
        ),
        learning: performanceSummary.learning ? {
          mode: performanceSummary.learning.mode,
          samples: performanceSummary.learning.samples,
          actualWinRate: performanceSummary.learning.actualWinRate,
          averageConfidence: performanceSummary.learning.averageConfidence,
          confidenceGap: performanceSummary.learning.confidenceGap,
          trend: performanceSummary.learning.trend,
          confidenceBuckets: performanceSummary.learning.confidenceBuckets || null,
        } : null,
        recentLosses: Array.isArray(performanceSummary.recentLosses)
          ? performanceSummary.recentLosses.slice(0, 5).map((loss) => ({
              symbol: loss.symbol,
              side: loss.side,
              pnl: loss.pnl,
              confidence: loss.confidence,
              closeReason: loss.closeReason,
              closedAt: loss.closedAt,
            }))
          : [],
      } : null;

      const context = {
        action,
        marketType,
        userMessage,
        snapshot: compactSnapshot,
        openPositions: livePositions.map(compactPosition).filter(Boolean),
        positionFeedError,
        scheduler: compactScheduler,
        performance: compactPerformance,
        safety: {
          readOnly:true,
          automaticTrading:false,
          noOrderPlacement:true,
        },
      };

      const systemPrompt = [
        "You are TradeMind AI Copilot V2 inside TradeMindMZ.",
        "Act like a disciplined senior trading analyst and system-aware copilot, not a generic chatbot.",
        "Your job is to turn supplied live TradeMindMZ telemetry into clear, conservative, actionable advice.",
        "Use ONLY supplied TradeMindMZ data plus clearly identified web facts when web search is available. Never invent prices, scores, PNL, trades, diagnostics, timestamps, providers, indicators, positions, or historical results.",
        "The Pionex position feed is authoritative for current open-position facts. Never replace reported unrealized PNL with an estimate when Pionex supplies it.",
        "FINAL DECISION is authoritative for the configured TradeMindMZ signal: only describe a qualified trade when finalDecision is exactly TRADE. If it is NO_TRADE, say there is no confirmed TradeMindMZ trade.",
        "AI confidence is model confidence, not a probability and not trade approval.",
        "Engine score, AI confidence, trade criteria, final decision, and your advice are different concepts. Never merge them.",
        "For an existing position, first assess current unrealized PNL, direction, entry/current price, risk levels if supplied, market regime, and current signal. Do not tell the user to add to a position unless the supplied evidence explicitly supports it.",
        "If a position is losing and the supplied data shows weakening confirmation or elevated risk, explain the risk clearly and consider REDUCE_RISK or EXIT_CONSIDERATION. Do not invent an exit trigger.",
        "If a position is profitable but confirmation is weakening, distinguish HOLD from taking action and explain the evidence.",
        "WAIT is a valid and often preferable recommendation when evidence conflicts, data is stale, or risk/reward is inadequate.",
        "For 'what should I do now' questions, prioritize the user's current open positions first, then the strongest current setup, then explain if no action is warranted.",
        "For BEST_SETUP, compare the supplied TOP candidates using score, confidence, direction, RSI, volume, risk/reward, market regime, and criteria. Do not choose a winner if the data is insufficient; say so.",
        "For DEEP_ANALYSIS, synthesize market regime, current signal, open positions, risk, recent performance, and historical confidence calibration. Be explicit about conflicts and uncertainty.",
        "For performance, summarize 24h, 7d and 30d results factually. Treat learning as observational calibration only; never claim the model weights or engine thresholds changed unless explicitly supplied.",
        "Recent losses are context, not proof of what will happen next.",
        "Do not use past performance to promise future returns.",
        "If web search is available, use it only for current external facts/news/market context that are not contained in TradeMindMZ telemetry. Clearly label web-sourced facts versus internal TradeMindMZ data.",
        "Never place trades, never provide guaranteed profit claims, and never imply automatic execution.",
        'Return JSON only with this exact shape: {"answer":"...","headline":"...","severity":"INFO|SUCCESS|WARNING|ERROR","action":"NONE|LIVE_SIGNAL|BEST_SETUP|WHAT_NOW|POSITION_CHECK|DEEP_ANALYSIS|STATUS|DIAGNOSTICS","advice":"WAIT|HOLD|CONSIDER_TRADE|REDUCE_RISK|EXIT_CONSIDERATION|NO_ACTION","confidence":0,"keyFactors":["..."],"risks":["..."]}.',
        "Keep answer concise but substantive: normally 3-7 sentences. keyFactors and risks should each contain at most 4 short items.",
      ].join("\n");

      const openAiKey = Deno.env.get("OPENAI_API_KEY");
      const model = Deno.env.get("OPENAI_COPILOT_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna";

      let providerUsed = "openai";
      let webSearchUsed = true;
      let raw = null;
      let outputText = "";

      if (openAiKey) {
        const openAiPayload = {
          model,
          tools:[{type:"web_search"}],
          input:[
            {
              role:"system",
              content:systemPrompt + "\nYou have web search access. Use it selectively; do not search when the supplied live telemetry is sufficient."
            },
            {role:"user",content:JSON.stringify(context)}
          ],
          max_output_tokens:1100,
        };

        const res = await fetch("https://api.openai.com/v1/responses",{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+openAiKey},
          body:JSON.stringify(openAiPayload),
        });
        const text = await res.text();

        if (res.ok) {
          const parsed = JSON.parse(text);
          outputText = String(
            parsed.output_text ||
            parsed.output?.flatMap(item=>item.content||[])
              .filter(part=>part.type==="output_text")
              .map(part=>part.text)
              .join("\n") ||
            ""
          ).trim();
          try { raw = JSON.parse(outputText); } catch {}
        } else {
          let openAiError = null;
          try { openAiError = JSON.parse(text)?.error; } catch {}
          const quotaExhausted = res.status === 429 && (
            openAiError?.code === "credit_balance_exhausted" ||
            /no credits remaining|insufficient.*quota/i.test(String(openAiError?.message || text))
          );
          if (!quotaExhausted) {
            throw new Error("OpenAI request failed: "+res.status+" "+text.slice(0,360));
          }
        }
      }

      if (!raw) {
        const groqKey = Deno.env.get("GROQ_API_KEY");
        if (!groqKey) {
          throw new Error(
            openAiKey
              ? "OpenAI credits are exhausted and no Groq fallback is configured."
              : "No AI provider is configured for TradeMind AI Copilot."
          );
        }

        providerUsed = "groq";
        webSearchUsed = false;
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions",{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+groqKey},
          body:JSON.stringify({
            model:Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b",
            temperature:0.1,
            response_format:{type:"json_object"},
            messages:[
              {
                role:"system",
                content:systemPrompt+"\nOpenAI web search is unavailable. Do not claim to have browsed the internet or cite web facts."
              },
              {role:"user",content:JSON.stringify(context)}
            ],
          }),
        });
        const groqText = await groqRes.text();
        if (!groqRes.ok) {
          throw new Error("TradeMind AI fallback failed: "+groqRes.status+" "+groqText.slice(0,300));
        }
        const groqParsed = JSON.parse(groqText);
        outputText = String(groqParsed.choices?.[0]?.message?.content || "").trim();
        try { raw = JSON.parse(outputText || "{}"); } catch {}
      }

      const allowedAdvice = new Set([
        "WAIT",
        "HOLD",
        "CONSIDER_TRADE",
        "REDUCE_RISK",
        "EXIT_CONSIDERATION",
        "NO_ACTION",
      ]);
      const allowedSuggestedActions = new Set([
        "NONE",
        "LIVE_SIGNAL",
        "BEST_SETUP",
        "WHAT_NOW",
        "POSITION_CHECK",
        "DEEP_ANALYSIS",
        "STATUS",
        "DIAGNOSTICS",
      ]);

      const confidence = Math.max(
        0,
        Math.min(100, Math.round(Number(raw?.confidence) || 0))
      );

      return response({
        success:true,
        provider:providerUsed,
        model:providerUsed === "openai" ? model : (Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b"),
        webSearch:webSearchUsed,
        action,
        marketType,
        headline:String(raw?.headline || "TRADEMIND AI"),
        answer:String(raw?.answer || outputText || "I could not produce an answer from the available TradeMindMZ data."),
        severity:["INFO","SUCCESS","WARNING","ERROR"].includes(raw?.severity) ? raw.severity : "INFO",
        suggestedAction:allowedSuggestedActions.has(String(raw?.action || "").toUpperCase()) ? String(raw.action).toUpperCase() : action,
        advice:allowedAdvice.has(String(raw?.advice || "").toUpperCase()) ? String(raw.advice).toUpperCase() : "NO_ACTION",
        confidence,
        keyFactors:Array.isArray(raw?.keyFactors) ? raw.keyFactors.slice(0,4).map(String) : [],
        risks:Array.isArray(raw?.risks) ? raw.risks.slice(0,4).map(String) : [],
        dataAgeSeconds:snapshot?.created_at
          ? Math.max(0,Math.round((Date.now()-new Date(snapshot.created_at).getTime())/1000))
          : null,
        finalDecision:snapshotPayload?.finalDecision || snapshot?.final_decision || null,
        openPositionCount:livePositions.length,
        readOnly:true,
        automaticTrading:false,
        noOrderPlacement:true,
      });
    } catch (error) {
      return response({
        success:false,
        error:error?.message || "TradeMind AI Copilot failed.",
        readOnly:true,
        automaticTrading:false,
        noOrderPlacement:true,
      },500);
    }
  }

  if (
    path === "/api/ai/scheduled-scan" &&
    method === "POST"
  ) {
    let schedulerRunId = null;
    const schedulerRequestStartedAt = Date.now();
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
      const requestedSchedulerRunId = Number(body?.schedulerRunId);

      if (Number.isFinite(requestedSchedulerRunId) && requestedSchedulerRunId > 0) {
        const { data: queuedRun } = await admin
          .from("trademind_scheduler_runs")
          .select("id,status")
          .eq("id", requestedSchedulerRunId)
          .maybeSingle();

        if (queuedRun?.id) {
          schedulerRunId = queuedRun.id;
          await admin
            .from("trademind_scheduler_runs")
            .update({
              status:"RUNNING",
              started_at:schedulerStartedAt,
              error:null,
            })
            .eq("id", schedulerRunId);
        }
      }

      if (!schedulerRunId) {
        const { data: schedulerRun } = await admin
          .from("trademind_scheduler_runs")
          .insert({ status:"RUNNING", started_at:schedulerStartedAt })
          .select("id")
          .single();
        schedulerRunId = schedulerRun?.id || null;
      }

      const schedulerPhaseStartedAt = schedulerRequestStartedAt;
      const updateSchedulerStage = async (stage) => {
        if (!schedulerRunId) return;
        try {
          await admin.from("trademind_scheduler_runs")
            .update({ current_stage: stage })
            .eq("id", schedulerRunId);
        } catch (stageError) {
          console.warn("Scheduler stage update failed:", stageError?.message || stageError);
        }
      };

      await updateSchedulerStage("PERP_SCAN");
      const perpStartedAt = Date.now();
      const payload = await runLiveAiAnalysis({
        interval: "15M",
        candleLimit: 100,
        maxMarkets: 25,
        marketType: "PERP",
        leverage: 3,
        provider: "groq",
        force: true,
        persist: true,
      });
      const perpDurationMs = Date.now() - perpStartedAt;

      if (payload?.persistenceError) {
        return response({
          success: false,
          status: "AI_SNAPSHOT_PERSISTENCE_ERROR",
          error: payload.persistenceError,
          latestAnalysis: payload,
        }, 500);
      }

      await updateSchedulerStage("PERP_PUSH");
      let pushNotification = null;
      try {
        pushNotification = await sendQualifiedTradePush(admin, payload, "PERP");
      } catch (pushError) {
        console.error("Qualified trade push failed:", pushError);
        pushNotification = {
          sent:false,
          skipped:false,
          error:pushError?.message || String(pushError),
        };
      }

      await updateSchedulerStage("SPOT_SCAN");
      const spotStartedAt = Date.now();
      let spotSnapshot = null;
      let spotMonitoring = null;
      let spotPushNotification = null;
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
        try {
          const spotPush = await sendQualifiedTradePush(admin, spotSnapshot, "SPOT");
          spotMonitoring = { ...spotMonitoring, pushNotification: spotPush };
        } catch (spotPushError) {
          console.error("Qualified Spot trade push failed:", spotPushError);
          spotPushNotification = { sent:false, skipped:false, error:spotPushError?.message || String(spotPushError) };
        }
      } catch (spotError) {
        console.error("Scheduled Spot monitoring failed:", spotError);
        spotMonitoring = { success:false, error:spotError?.message || String(spotError), readOnly:true };
      }
      const spotDurationMs = Date.now() - spotStartedAt;
      const spotPushStatus = spotPushNotification?.sent ? "SENT" : spotPushNotification?.skipped ? String(spotPushNotification.reason || "SKIPPED") : spotPushNotification?.error ? "ERROR" : "NOT_TRIGGERED";

      await updateSchedulerStage("POSITION_MONITORING");
      const monitoringStartedAt = Date.now();
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
      const monitoringDurationMs = Date.now() - monitoringStartedAt;
      const schedulerDurationMs = Date.now() - schedulerPhaseStartedAt;

      if (schedulerRunId) {
        await admin.from("trademind_scheduler_runs").update({
          status:"SUCCESS",
          finished_at:new Date().toISOString(),
          perp_snapshot_at:payload?.persistedAt || payload?.updatedAt || null,
          spot_snapshot_at:spotSnapshot?.persistedAt || spotSnapshot?.updatedAt || null,
          position_monitoring_count:Number(positionMonitoring?.monitoredCount || 0),
          spot_monitoring_count:Number(spotMonitoring?.monitoredCount || 0),
          duration_ms:schedulerDurationMs,
          perp_duration_ms:perpDurationMs,
          spot_duration_ms:spotDurationMs,
          monitoring_duration_ms:monitoringDurationMs,
          current_stage:"COMPLETE",
          perp_scanned:Number(payload?.scanned || 0),
          perp_candidates:Array.isArray(payload?.candidates) ? payload.candidates.length : 0,
          perp_provider:payload?.aiDecision?.provider || "groq",
          perp_decision:payload?.finalDecision || "NO_TRADE",
          perp_push_status:perpPushStatus,
          spot_scanned:Number(spotSnapshot?.scanned || 0),
          spot_candidates:Array.isArray(spotSnapshot?.candidates) ? spotSnapshot.candidates.length : 0,
          spot_provider:spotSnapshot?.aiDecision?.provider || "groq",
          spot_decision:spotSnapshot?.finalDecision || "NO_TRADE",
          spot_push_status:spotPushStatus,
        }).eq("id",schedulerRunId);
      }

      return response({
        success: true,
        status: "SCHEDULED_AI_SCAN_COMPLETE",
        serverSide: true,
        cadenceMinutes: 7,
        snapshot: payload,
        spotSnapshot,
        pushNotification,
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
            duration_ms:Date.now() - schedulerRequestStartedAt,
            current_stage:"ERROR",
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

  if (path === "/api/notifications/register" && method === "POST") {
    try {
      const token = String(body?.token || "").trim();
      if (!token || token.length > 4096) {
        return response({ success:false, error:"A valid push registration token is required." },400);
      }

      const admin = supabaseAdmin();
      const state = await getSchedulerSecretState(admin);
      await saveSchedulerSecretState(admin, {
        ...state,
        fcmToken: token,
        notificationsEnabled: true,
      });

      return response({
        success:true,
        registered:true,
        provider:"FCM",
        platform: body?.platform || "android",
        notificationsEnabled:true,
        readOnly:true,
      });
    } catch (error) {
      return response({
        success:false,
        registered:false,
        error:error?.message || "Push registration failed.",
      },500);
    }
  }

  if (path === "/api/notifications/preferences" && method === "POST") {
    try {
      const enabled = body?.enabled !== false;
      const admin = supabaseAdmin();
      const state = await getSchedulerSecretState(admin);

      await saveSchedulerSecretState(admin, {
        ...state,
        notificationsEnabled: enabled,
      });

      return response({
        success: true,
        notificationsEnabled: enabled,
        provider: "FCM",
        platform: body?.platform || "android",
      });
    } catch (error) {
      return response({
        success: false,
        notificationsEnabled: false,
        error: error?.message || "Push preference update failed.",
      }, 500);
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

  if (path === "/api/ai/performance-summary" && method === "GET") {
    try {
      return response(await getTradePerformanceSummary(supabaseAdmin()));
    } catch (error) {
      return response({
        success:false,
        status:"PERFORMANCE_UNAVAILABLE",
        error:error?.message || "Performance summary failed.",
      }, 500);
    }
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
        const schedulerFields = "id,status,created_at,started_at,finished_at,duration_ms,perp_duration_ms,spot_duration_ms,monitoring_duration_ms,current_stage,perp_snapshot_at,spot_snapshot_at,position_monitoring_count,spot_monitoring_count,perp_scanned,perp_candidates,perp_provider,perp_decision,perp_push_status,spot_scanned,spot_candidates,spot_provider,spot_decision,spot_push_status,error";
        const [{ data: latestRun }, { data: latestSuccess }, { data: latestActive }] = await Promise.all([
          admin.from("trademind_scheduler_runs").select(schedulerFields).order("created_at",{ascending:false}).limit(1).maybeSingle(),
          admin.from("trademind_scheduler_runs").select(schedulerFields).eq("status","SUCCESS").order("created_at",{ascending:false}).limit(1).maybeSingle(),
          admin.from("trademind_scheduler_runs").select(schedulerFields).in("status",["QUEUED","RUNNING"]).order("created_at",{ascending:false}).limit(1).maybeSingle(),
        ]);

        // A queued/running scheduler run is healthy activity, not a stale heartbeat.
        // Use the latest completed SUCCESS run as the heartbeat baseline and expose
        // the active run separately so diagnostics can show live scheduler progress.
        schedulerHeartbeat = latestSuccess || latestRun || null;
        if (latestActive) {
          schedulerHeartbeat = {
            ...(schedulerHeartbeat || {}),
            activeRun: latestActive,
            activeStatus: latestActive.status,
            activeStage: latestActive.current_stage || null,
            activeStartedAt: latestActive.started_at || latestActive.created_at || null,
          };
        }
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
              leverage: 3,
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

    const schedulerFinishedAt = schedulerHeartbeat?.finished_at || null;
    const schedulerAgeMs = schedulerFinishedAt
      ? Math.max(0, Date.now() - new Date(schedulerFinishedAt).getTime())
      : null;
    const schedulerDurationMs = Number(schedulerHeartbeat?.duration_ms);
    const schedulerSlow = Number.isFinite(schedulerDurationMs) && schedulerDurationMs >= 90000;
    const activeScheduler = schedulerHeartbeat?.activeRun || null;
    const activeSchedulerAgeMs = activeScheduler?.started_at
      ? Math.max(0, Date.now() - new Date(activeScheduler.started_at).getTime())
      : null;
    const schedulerFresh = Boolean(
      schedulerHeartbeat?.status === "SUCCESS" &&
      Number.isFinite(schedulerAgeMs) &&
      schedulerAgeMs <= 15 * 60 * 1000
    );
    const schedulerActive = Boolean(
      activeScheduler &&
      Number.isFinite(activeSchedulerAgeMs) &&
      activeSchedulerAgeMs <= 12 * 60 * 1000
    );

    const diagnosticsOk =
      supabaseOk &&
      pionexConfigured &&
      groqOk &&
      snapshotFresh &&
      schedulerFresh;

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
          name: "Scheduler",
          status: schedulerHeartbeat?.status === "ERROR"
            ? "ERROR"
            : schedulerActive
              ? "OK"
              : schedulerFresh
                ? schedulerSlow
                  ? "SLOW"
                  : "OK"
                : "STALE",
          httpStatus: (schedulerActive || schedulerFresh) ? 200 : 503,
          details: {
            lastRun: schedulerFinishedAt,
            ageSeconds: Number.isFinite(schedulerAgeMs) ? Math.round(schedulerAgeMs / 1000) : null,
            activeStatus: activeScheduler?.status || null,
            activeStage: activeScheduler?.current_stage || null,
            activeAgeSeconds: Number.isFinite(activeSchedulerAgeMs) ? Math.round(activeSchedulerAgeMs / 1000) : null,
            spotMonitored: Number(schedulerHeartbeat?.spot_monitoring_count || 0),
            futuresMonitored: Number(schedulerHeartbeat?.position_monitoring_count || 0),
            durationMs: Number(schedulerHeartbeat?.duration_ms || 0),
            perpDurationMs: Number(schedulerHeartbeat?.perp_duration_ms || 0),
            spotDurationMs: Number(schedulerHeartbeat?.spot_duration_ms || 0),
            monitoringDurationMs: Number(schedulerHeartbeat?.monitoring_duration_ms || 0),
            currentStage: activeScheduler?.current_stage || schedulerHeartbeat?.current_stage || null,
            cadenceMinutes: 7,
          },
          error:
            schedulerActive
              ? null
              : schedulerFresh
                ? schedulerSlow
                  ? "Scheduler completed, but runtime is approaching the 120s request budget."
                  : null
                : "Server scheduler heartbeat is missing, stale, or failed.",
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