import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const API_BASE = "https://api.footballsoccerapi.com/v1";

const EUROPEAN_COUNTRIES = new Set([
  "England","Spain","Italy","Germany","France","Netherlands","Portugal","Belgium",
  "Turkey","Greece","Austria","Switzerland","Scotland","Denmark","Norway","Sweden",
  "Finland","Poland","Czech Republic","Czechia","Croatia","Serbia","Ukraine",
  "Romania","Hungary","Slovakia","Slovenia","Bulgaria","Cyprus","Israel",
  "Republic of Ireland","Ireland","Iceland","Russia",
]);

const EUROPEAN_COMPETITIONS = [
  "Champions League","Europa League","Conference League",
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSecretKey() {
  return Deno.env.get("FOOTBALL_API_KEY") || "";
}

async function footballApi(path: string, params: Record<string, string> = {}) {
  const key = getSecretKey();
  if (!key) throw new Error("FOOTBALL_API_KEY is not configured in Supabase secrets");

  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url, {
    headers: { "X-API-Key": key, Accept: "application/json" },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Football Soccer API HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  if (body?.error) throw new Error(String(body.error));
  return body;
}

function isEuropeanMatch(match: any) {
  const country = match?.country_name || match?.country || "";
  const league = match?.league_name || match?.league || "";
  return EUROPEAN_COUNTRIES.has(country) ||
    EUROPEAN_COMPETITIONS.some((name) => String(league).toLowerCase().includes(name.toLowerCase()));
}

function pickPrice(m: any, side: "home" | "draw" | "away") {
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

function marketPrediction(match: any) {
  const prices = [
    { selection: "home", odds: pickPrice(match, "home") },
    { selection: "draw", odds: pickPrice(match, "draw") },
    { selection: "away", odds: pickPrice(match, "away") },
  ].filter((x) => x.odds);

  if (prices.length < 2) return null;
  const inv = prices.map((x) => 1 / Number(x.odds));
  const total = inv.reduce((a, b) => a + b, 0);
  const ranked = prices.map((x, i) => ({
    ...x,
    probability: inv[i] / total,
  })).sort((a, b) => b.probability - a.probability);

  const pick = ranked[0];
  const label = pick.selection === "home"
    ? String(match.home_team_name || match.home_team || "Hjemme")
    : pick.selection === "away"
      ? String(match.away_team_name || match.away_team || "Borte")
      : "Uavgjort";

  return {
    prediction: label,
    confidence: Math.round(pick.probability * 1000) / 10,
    odds: pick.odds,
    implied_probability: Math.round((1 / Number(pick.odds)) * 1000) / 10,
    model_score: Math.round(pick.probability * 100),
    reasoning: {
      source: "football-soccer-api-market",
      selections: ranked.map((x) => ({
        selection: x.selection,
        odds: x.odds,
        normalized_probability: Math.round(x.probability * 1000) / 10,
      })),
    },
  };
}

async function syncToday(supabase: any) {
  const body = await footballApi("/fixtures/today", { limit: "1000" });
  const all = Array.isArray(body?.data) ? body.data : [];
  const matches = all.filter(isEuropeanMatch);

  let matchesScanned = 0;
  let oddsStored = 0;
  let predictionsCreated = 0;

  for (const m of matches) {
    matchesScanned++;
    const externalId = String(m.match_id || m.id || "");
    if (!externalId) continue;

    const kickoff = m.kickoff_utc || m.kickoff || m.kickoff_at;
    if (!kickoff) continue;

    const { data: saved, error } = await supabase
      .from("football_matches")
      .upsert({
        external_id: externalId,
        league: m.league_name || "Unknown",
        season: m.season ? String(m.season) : null,
        kickoff_at: kickoff,
        home_team: m.home_team_name || m.home_team || "Unknown",
        away_team: m.away_team_name || m.away_team || "Unknown",
        status: m.status || "scheduled",
        home_score: m.home_goals ?? null,
        away_score: m.away_goals ?? null,
        venue: m.venue_name || null,
        source: "football-soccer-api",
        raw: m,
        updated_at: new Date().toISOString(),
      }, { onConflict: "external_id" })
      .select("id")
      .single();

    if (error || !saved) continue;

    const prices = [
      ["home", pickPrice(m, "home")],
      ["draw", pickPrice(m, "draw")],
      ["away", pickPrice(m, "away")],
    ];

    const oddsRows = prices.filter(([, odds]) => odds).map(([selection, odds]) => ({
      match_id: saved.id,
      bookmaker: "Football Soccer API / exchange",
      market: "1X2",
      selection,
      odds,
      captured_at: new Date().toISOString(),
      raw: m,
    }));

    if (oddsRows.length) {
      const { error: oddsError } = await supabase.from("football_odds").insert(oddsRows);
      if (!oddsError) oddsStored += oddsRows.length;
    }

    const prediction = marketPrediction(m);
    if (prediction) {
      const { data: existing } = await supabase
        .from("football_ai_predictions")
        .select("id")
        .eq("match_id", saved.id)
        .eq("status", "OPEN")
        .limit(1);

      if (!existing?.length) {
        const { error: predictionError } = await supabase.from("football_ai_predictions").insert({
          match_id: saved.id,
          prediction: prediction.prediction,
          confidence: prediction.confidence,
          implied_probability: prediction.implied_probability,
          odds: prediction.odds,
          value_percent: 0,
          model_score: prediction.model_score,
          reasoning: prediction.reasoning,
          provider: "football-soccer-api",
          model: "market-baseline-v1",
          status: "OPEN",
        });
        if (!predictionError) predictionsCreated++;
      }
    }
  }

  await supabase.from("football_ai_runs").insert({
    run_type: "DAILY_EUROPE_SCAN",
    matches_scanned: matchesScanned,
    predictions_created: predictionsCreated,
    provider: "football-soccer-api",
    status: "SUCCESS",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });

  return { matchesScanned, oddsStored, predictionsCreated };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "health";

    if (action === "health") {
      const keyConfigured = Boolean(getSecretKey());
      let api = null;
      if (keyConfigured) {
        try {
          const usage = await footballApi("/usage");
          api = usage?.data || null;
        } catch (error) {
          api = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      return json({
        ok: keyConfigured && !api?.error,
        service: "football-ai",
        provider: "football-soccer-api",
        footballApiConfigured: keyConfigured,
        usage: api,
      });
    }

    const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || getSecretKey();
    if (!secretKey) return json({ ok: false, error: "Supabase server key is not configured" }, 500);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey);

    if (action === "sync") {
      const synced = await syncToday(supabase);
      return json({ ok: true, action, ...synced });
    }

    if (action === "dashboard") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const { data: matches, error: matchError } = await supabase
        .from("football_matches")
        .select("id,league,kickoff_at,home_team,away_team,status,home_score,away_score")
        .gte("kickoff_at", start.toISOString())
        .lte("kickoff_at", end.toISOString())
        .order("kickoff_at", { ascending: true })
        .limit(100);

      if (matchError) throw matchError;

      const matchIds = (matches || []).map((m: any) => m.id);
      let predictions: any[] = [];
      if (matchIds.length) {
        const { data: rows, error } = await supabase
          .from("football_ai_predictions")
          .select("id,match_id,prediction,confidence,odds,value_percent,model_score,status,reasoning,provider,model,created_at")
          .in("match_id", matchIds)
          .order("created_at", { ascending: false });
        if (error) throw error;
        predictions = rows || [];
      }

      return json({ ok: true, matches: matches || [], predictions });
    }

    return json({ ok: false, error: "Unknown action", supported: ["health", "sync", "dashboard"] }, 400);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
