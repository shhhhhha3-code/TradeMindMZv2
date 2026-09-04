import { getSupabaseClient } from "../supabase/client.js";

function toDatabasePosition(position = {}) {
  return {
    user_id: position.userId || null,

    symbol: position.symbol,
    side: position.side,

    entry_price: Number(position.entryPrice),
    quantity: Number(position.quantity),

    stop_loss:
      position.stopLoss == null
        ? null
        : Number(position.stopLoss),

    take_profit:
      position.takeProfit == null
        ? null
        : Number(position.takeProfit),

    source: "MANUAL_PIONEX",

    status: position.status || "LIVE",

    current_price:
      position.currentPrice == null
        ? null
        : Number(position.currentPrice),

    unrealized_pnl:
      position.unrealizedPnl == null
        ? null
        : Number(position.unrealizedPnl),

    unrealized_pnl_percent:
      position.unrealizedPnlPercent == null
        ? null
        : Number(position.unrealizedPnlPercent),

    ai_recommendation:
      position.aiRecommendation ||
      position.recommendation ||
      null,

    ai_confidence:
      position.aiConfidence == null
        ? position.confidence == null
          ? null
          : Number(position.confidence)
        : Number(position.aiConfidence),

    ai_reasoning:
      position.aiReasoning ||
      position.reasoning ||
      null,

    opened_at:
      position.openedAt ||
      position.createdAt ||
      new Date().toISOString(),

    closed_at:
      position.closedAt ||
      null,
  };
}

export async function savePositionToSupabase(position) {
  if (!position?.symbol) {
    throw new Error("Position symbol is required.");
  }

  const supabase = getSupabaseClient();
  const payload = toDatabasePosition(position);

  const { data, error } = await supabase
    .from("tracked_positions")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Supabase position insert failed: ${error.message}`
    );
  }

  return data;
}

export async function getTrackedPositionsFromSupabase({
  userId = null,
  status = "LIVE",
} = {}) {
  const supabase = getSupabaseClient();

  let query = supabase
    .from("tracked_positions")
    .select("*")
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Supabase position read failed: ${error.message}`
    );
  }

  return data || [];
}

export async function updatePositionInSupabase(
  positionId,
  updates = {}
) {
  if (!positionId) {
    throw new Error("Position id is required.");
  }

  const supabase = getSupabaseClient();

  const payload = {};

  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  if (updates.currentPrice !== undefined) {
    payload.current_price = updates.currentPrice;
  }

  if (updates.unrealizedPnl !== undefined) {
    payload.unrealized_pnl = updates.unrealizedPnl;
  }

  if (updates.unrealizedPnlPercent !== undefined) {
    payload.unrealized_pnl_percent =
      updates.unrealizedPnlPercent;
  }

  if (updates.aiRecommendation !== undefined) {
    payload.ai_recommendation =
      updates.aiRecommendation;
  }

  if (updates.aiConfidence !== undefined) {
    payload.ai_confidence = updates.aiConfidence;
  }

  if (updates.aiReasoning !== undefined) {
    payload.ai_reasoning = updates.aiReasoning;
  }

  if (updates.closedAt !== undefined) {
    payload.closed_at = updates.closedAt;
  }

  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tracked_positions")
    .update(payload)
    .eq("id", positionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Supabase position update failed: ${error.message}`
    );
  }

  return data;
}
