import { getSupabaseClient } from "../supabase/client.js";

function cleanNumber(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

export async function getSignalHistory(
  limit = 50
) {
  const supabase =
    getSupabaseClient();

  const safeLimit =
    Math.max(
      1,
      Math.min(
        100,
        Number(limit) || 50
      )
    );

  const [
    positionResult,
    signalResult
  ] = await Promise.all([
    supabase
      .from(
        "position_ai_analysis"
      )
      .select(
        "*"
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(
        safeLimit
      ),

    supabase
      .from(
        "ai_signals"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(
        safeLimit
      )
  ]);

  if (
    positionResult.error
  ) {
    throw new Error(
      `Position history query failed: ${positionResult.error.message}`
    );
  }

  if (
    signalResult.error
  ) {
    throw new Error(
      `AI signal history query failed: ${signalResult.error.message}`
    );
  }

  const positionHistory =
    Array.isArray(
      positionResult.data
    )
      ? positionResult.data.map(
          row => ({
            id:
              row.id,

            type:
              "POSITION",

            symbol:
              row.symbol ??
              null,

            direction:
              row.direction ??
              null,

            recommendation:
              row.recommendation ||
              "WATCH",

            confidence:
              row.confidence != null
                ? Number(
                    row.confidence
                  )
                : null,

            reasoning:
              row.reasoning ||
              "",

            provider:
              row.provider ||
              null,

            price:
              row.market_price != null
                ? Number(
                    row.market_price
                  )
                : null,

            entryPrice:
              row.entry_price != null
                ? Number(
                    row.entry_price
                  )
                : null,

            source:
              row.source ||
              "PIONEX",

            createdAt:
              row.created_at
          })
        )
      : [];

  const signalHistory =
    Array.isArray(
      signalResult.data
    )
      ? signalResult.data.map(
          row => ({
            id:
              row.id,

            type:
              "SIGNAL",

            symbol:
              row.symbol ||
              null,

            direction:
              row.direction ||
              row.side ||
              null,

            recommendation:
              row.recommendation ||
              row.signal ||
              row.direction ||
              "WATCH",

            confidence:
              row.confidence != null
                ? cleanNumber(
                    row.confidence
                  )
                : null,

            reasoning:
              row.reasoning ||
              row.ai_reasoning ||
              "",

            provider:
              row.provider ||
              row.ai_provider ||
              null,

            price:
              row.market_price != null
                ? Number(
                    row.market_price
                  )
                : (
                    row.entry_price != null
                      ? Number(
                          row.entry_price
                        )
                      : null
                  ),

            entryPrice:
              row.entry_price != null
                ? Number(
                    row.entry_price
                  )
                : null,

            source:
              row.source ||
              "TRADEMINDMZ",

            createdAt:
              row.created_at ||
              row.captured_at ||
              null
          })
        )
      : [];

  const history = [
    ...positionHistory,
    ...signalHistory
  ]
    .filter(
      item =>
        item.createdAt
    )
    .sort(
      (a, b) =>
        new Date(
          b.createdAt
        ).getTime() -
        new Date(
          a.createdAt
        ).getTime()
    )
    .slice(
      0,
      safeLimit
    );

  return {
    success: true,

    history,

    count:
      history.length
  };
}
