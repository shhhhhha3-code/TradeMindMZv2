import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const API_BASE = "https://v3.football.api-sports.io";
const DEFAULT_LEAGUES = [
  { id: 39, name: "Premier League" },
  { id: 140, name: "La Liga" },
  { id: 78, name: "Bundesliga" },
  { id: 135, name: "Serie A" },
  { id: 61, name: "Ligue 1" },
  { id: 2, name: "Champions League" },
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSecretKey() {
  const map = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (map) {
    try {
      const parsed = JSON.parse(map);
      if (parsed.default) return parsed.default;
    } catch (_) {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function getDate(offset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function footballApi(path: string, params: Record<string, string>) {
  const key = Deno.env.get("FOOTBALL_API_KEY");
  if (!key) throw new Error("FOOTBALL_API_KEY is not configured in Supabase secrets");

  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": key,
      Accept: "application/json",
    },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Football API HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  if (body?.errors && Object.keys(body.errors).length) {
    throw new Error(`Football API error: ${JSON.stringify(body.errors)}`);
  }
  return body;
}

function normalizeOdds(rows: any[]) {
  const result: any[] = [];
  for (const item of rows || []) {
    const fixtureId = item?.fixture?.id;
    const bookmakers = item?.bookmakers || [];
    for (const bookmaker of bookmakers) {
      for (const bet of bookmaker?.bets || []) {
        const market = bet?.name;
        if (!market) continue;
        for (const value of bet?.values || []) {
          const odd = Number(value?.odd);
          if (!Number.isFinite(odd) || odd <= 1) continue;
          result.push({
            fixtureId,
            bookmaker: bookmaker?.name || "Unknown",
            market,
            selection: value?.value || "",
            odds: odd,
          });
        }
      }
    }
  }
  return result;
}

function marketPrediction(odds: any[]) {
  const oneXtwo = odds.filter((o) => /match winner|1x2/i.test(o.market));
  if (!oneXtwo.length) return null;

  const best: Record<string, any> = {};
  for (const row of oneXtwo) {
    if (!best[row.selection] || row.odds < best[row.selection].odds) best[row.selection] = row;
  }

  const entries = Object.values(best);
  if (entries.length < 2) return null;

  const inv = entries.map((x: any) => 1 / x.odds);
  const total = inv.reduce((a, b) => a + b, 0);
  const ranked = entries
    .map((x: any, i: number) => ({
      ...x,
      probability: inv[i] / total,
    }))
    .sort((a: any, b: any) => b.probability - a.probability);

  const pick = ranked[0];
  return {
    prediction: pick.selection,
    confidence: Math.round(pick.probability * 1000) / 10,
    odds: pick.odds,
    implied_probability: Math.round((1 / pick.odds) * 1000) / 10,
    model_score: Math.round(pick.probability * 100),
    reasoning: {
      source: "market_baseline",
      selections: ranked.map((x: any) => ({
        selection: x.selection,
        odds: x.odds,
        normalized_probability: Math.round(x.probability * 1000) / 10,
      })),
    },
  };
}

async function syncMatches(supabase: any, date: string, leagueIds: number[]) {
  let matchesScanned = 0;
  let oddsStored = 0;
  const leagueMap = new Map(DEFAULT_LEAGUES.map((x) => [x.id, x.name]));

  for (const leagueId of leagueIds) {
    const leagueName = leagueMap.get(leagueId) || `League ${leagueId}`;
    const fixtures = await footballApi("/fixtures", {
      league: String(leagueId),
      season: String(new Date(date).getUTCFullYear()),
      date,
    });

    for (const f of fixtures?.response || []) {
      matchesScanned++;
      const fixture = f.fixture;
      const teams = f.teams;
      const league = f.league;

      const { data: match, error } = await supabase
        .from("football_matches")
        .upsert(
          {
            external_id: String(fixture.id),
            league: league?.name || leagueName,
            season: String(league?.season || new Date(date).getUTCFullYear()),
            kickoff_at: fixture.date,
            home_team: teams?.home?.name || "Unknown",
            away_team: teams?.away?.name || "Unknown",
            status: String(fixture?.status?.short || "SCHEDULED"),
            home_score: f.goals?.home ?? null,
            away_score: f.goals?.away ?? null,
            venue: fixture?.venue?.name || null,
            source: "api-football",
            raw: f,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "external_id" },
        )
        .select("id,external_id")
        .single();

      if (error || !match) continue;

      try {
        const oddsBody = await footballApi("/odds", {
          fixture: String(fixture.id),
        });
        const odds = normalizeOdds(oddsBody?.response || []);
        if (odds.length) {
          const payload = odds.map((o) => ({
            match_id: match.id,
            bookmaker: o.bookmaker,
            market: o.market,
            selection: o.selection,
            odds: o.odds,
            captured_at: new Date().toISOString(),
            raw: o,
          }));
          const { error: oddsError } = await supabase.from("football_odds").insert(payload);
          if (!oddsError) oddsStored += payload.length;
        }
      } catch (_) {
        // Odds can be unavailable for individual fixtures; keep the match.
      }
    }
  }

  return { matchesScanned, oddsStored };
}

async function createPredictions(supabase: any, date: string) {
  const start = new Date(date + "T00:00:00Z").toISOString();
  const end = new Date(date + "T23:59:59Z").toISOString();

  const { data: matches, error } = await supabase
    .from("football_matches")
    .select("id,home_team,away_team,league,kickoff_at")
    .gte("kickoff_at", start)
    .lte("kickoff_at", end);

  if (error) throw error;

  let created = 0;
  for (const match of matches || []) {
    const { data: odds } = await supabase
      .from("football_odds")
      .select("market,selection,odds,bookmaker,captured_at")
      .eq("match_id", match.id)
      .order("captured_at", { ascending: false })
      .limit(300);

    const prediction = marketPrediction(odds || []);
    if (!prediction) continue;

    const { data: existing } = await supabase
      .from("football_ai_predictions")
      .select("id")
      .eq("match_id", match.id)
      .eq("status", "OPEN")
      .limit(1);

    if (existing?.length) continue;

    const { error: insertError } = await supabase.from("football_ai_predictions").insert({
      match_id: match.id,
      prediction: prediction.prediction,
      confidence: prediction.confidence,
      implied_probability: prediction.implied_probability,
      odds: prediction.odds,
      value_percent: Math.round((prediction.confidence - prediction.implied_probability) * 100) / 100,
      model_score: prediction.model_score,
      reasoning: {
        ...prediction.reasoning,
        home_team: match.home_team,
        away_team: match.away_team,
        league: match.league,
      },
      provider: "market-baseline",
      model: "normalized-1x2",
      status: "OPEN",
    });
    if (!insertError) created++;
  }
  return created;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "sync";
    const date = url.searchParams.get("date") || getDate(0);
    const leagueParam = url.searchParams.get("leagues");
    const leagueIds = leagueParam
      ? leagueParam.split(",").map(Number).filter(Number.isFinite)
      : DEFAULT_LEAGUES.map((x) => x.id);

    const secretKey = getSecretKey();
    if (!secretKey) return json({ ok: false, error: "Supabase server key is not configured" }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey);

    if (action === "sync") {
      const started = new Date().toISOString();
      const synced = await syncMatches(supabase, date, leagueIds);
      const predictionsCreated = await createPredictions(supabase, date);

      await supabase.from("football_ai_runs").insert({
        run_type: "MATCH_SCAN",
        matches_scanned: synced.matchesScanned,
        predictions_created: predictionsCreated,
        provider: "api-football",
        status: "SUCCESS",
        started_at: started,
        finished_at: new Date().toISOString(),
      });

      return json({
        ok: true,
        action,
        date,
        leagues: leagueIds,
        ...synced,
        predictionsCreated,
      });
    }

    if (action === "health") {
      return json({
        ok: true,
        service: "football-ai",
        footballApiConfigured: Boolean(Deno.env.get("FOOTBALL_API_KEY")),
        aiProvidersConfigured: {
          groq: Boolean(Deno.env.get("GROQ_API_KEY")),
          openai: Boolean(Deno.env.get("OPENAI_API_KEY")),
        },
      });
    }

    return json({ ok: false, error: "Unknown action", supported: ["health", "sync"] }, 400);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
