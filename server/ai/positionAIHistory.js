import { getSupabaseClient } from "../supabase/client.js";

function cleanNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function cleanUuid(value) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const valueTrimmed =
    value.trim();

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(
    valueTrimmed
  )
    ? valueTrimmed
    : null;
}

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const result =
    String(value).trim();

  return result
    ? result
    : null;
}

export async function savePositionAIAnalysis({
  position,
  analysis,
  provider
}) {
  const supabase =
    getSupabaseClient();

  if (!position) {
    throw new Error(
      "Position is required for history."
    );
  }

  const symbol =
    cleanText(
      position.symbol ??
      position.market ??
      position.contract ??
      position.instrument
    );

  const side =
    cleanText(
      position.side ??
      position.positionSide
    )?.toUpperCase();

  const direction =
    (
      cleanText(
        position.direction
      )?.toUpperCase()
    ) ||
    (
      side === "LONG"
        ? "BUY"
        : side === "SHORT"
          ? "SELL"
          : side || null
    );

  const entryPrice =
    cleanNumber(
      position.entryPrice ??
      position.entry_price ??
      position.avgEntryPrice ??
      position.openPrice
    );

  const currentPrice =
    cleanNumber(
      position.currentPrice ??
      position.markPrice ??
      position.lastPrice ??
      position.price
    );

  const source =
    cleanText(
      position.source
    ) || "PIONEX";

  const positionId =
    cleanUuid(
      position.supabaseId ??
      position.position_id ??
      position.positionId ??
      position.id
    );

  const userId =
    cleanUuid(
      position.userId ??
      position.user_id
    );

  /*
   * IMPORTANT:
   * These fields are intentionally built explicitly
   * from the supplied position object.
   */
  const row = {
    position_id:
      positionId,

    user_id:
      userId,

    recommendation:
      analysis?.recommendation ||
      "WATCH",

    confidence:
      cleanNumber(
        analysis?.confidence
      ),

    reasoning:
      analysis?.reasoning ||
      null,

    provider:
      provider ||
      "groq",

    market_price:
      currentPrice,

    symbol,

    direction,

    entry_price:
      entryPrice,

    source
  };

  console.log("");
  console.log(
    "============================================================"
  );
  console.log(
    "💾 POSITION AI HISTORY INSERT"
  );
  console.log(
    "============================================================"
  );

  console.log(
    "symbol:",
    row.symbol
  );

  console.log(
    "direction:",
    row.direction
  );

  console.log(
    "entry_price:",
    row.entry_price
  );

  console.log(
    "market_price:",
    row.market_price
  );

  console.log(
    "source:",
    row.source
  );

  console.log(
    "recommendation:",
    row.recommendation
  );

  console.log(
    "confidence:",
    row.confidence
  );

  console.log(
    "provider:",
    row.provider
  );

  const {
    data,
    error
  } = await supabase
    .from(
      "position_ai_analysis"
    )
    .insert(row)
    .select("*")
    .single();

  if (error) {

    console.error(
      "❌ Supabase INSERT failed:"
    );

    console.error(
      error
    );

    throw new Error(
      `Failed to save position AI analysis: ${error.message}`
    );
  }

  console.log(
    "✅ Saved row:"
  );

  console.log(
    "id:",
    data?.id
  );

  console.log(
    "saved symbol:",
    data?.symbol
  );

  console.log(
    "saved direction:",
    data?.direction
  );

  console.log(
    "saved entry_price:",
    data?.entry_price
  );

  console.log(
    "saved source:",
    data?.source
  );

  return data;
}
