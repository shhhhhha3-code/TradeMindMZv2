export async function saveLiveAiSnapshot(supabase, payload, metadata = {}) {
  const row = {
    status: "SUCCESS",
    market_type: payload?.marketType || metadata.marketType || "PERP",
    contract_type: payload?.contractType || metadata.contractType || "USDT-M PERPETUAL",
    interval: payload?.scanInterval || metadata.interval || "15M",
    leverage: Number(payload?.leverage ?? metadata.leverage ?? 2) || 2,
    scanned: Number(payload?.scanned ?? 0) || 0,
    candidates: Array.isArray(payload?.candidates) ? payload.candidates : [],
    ai_decision: payload?.aiDecision || null,
    final_decision: payload?.finalDecision || "NO_TRADE",
    provider: payload?.aiDecision?.provider || null,
    next_analysis_at: payload?.nextAnalysisAt || null,
    payload,
    error: null,
  };

  const { data, error } = await supabase
    .from("market_ai_snapshots")
    .insert(row)
    .select("id, created_at")
    .single();

  if (error) {
    throw new Error(`Live AI snapshot save failed: ${error.message}`);
  }

  return data;
}

export async function getLatestLiveAiSnapshot(supabase, options = {}) {
  let query = supabase
    .from("market_ai_snapshots")
    .select("*")
    .eq("status", "SUCCESS")
    .eq("market_type", options.marketType || "PERP")
    .eq("interval", options.interval || "15M")
    .eq("leverage", Number(options.leverage || 2))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await query;

  if (error) {
    throw new Error(`Latest Live AI snapshot query failed: ${error.message}`);
  }

  if (!data) {
    return {
      available: false,
      snapshot: null,
    };
  }

  const payload = data.payload || {
    success: true,
    candidates: data.candidates || [],
    aiDecision: data.ai_decision || null,
    finalDecision: data.final_decision || "NO_TRADE",
    marketType: data.market_type || "PERP",
    contractType: data.contract_type || "USDT-M PERPETUAL",
    leverage: Number(data.leverage || 2),
    scanInterval: data.interval || "15M",
    scanned: Number(data.scanned || 0),
  };

  return {
    available: true,
    snapshot: {
      ...payload,
      persistedAt: data.created_at,
      snapshotId: data.id,
      cached: true,
      nextAnalysisAt:
        data.next_analysis_at ||
        payload.nextAnalysisAt ||
        null,
    },
  };
}
