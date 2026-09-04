import { getSupabaseClient } from "../supabase/client.js";

export async function getLearningStats() {
  const supabase = getSupabaseClient();

  const {
    data,
    error
  } = await supabase
    .from("position_ai_analysis")
    .select(
      "recommendation,confidence,provider,created_at"
    );

  if (error) {
    throw new Error(
      `Learning stats query failed: ${error.message}`
    );
  }

  const rows = Array.isArray(data)
    ? data
    : [];

  const total = rows.length;

  const confidenceValues = rows
    .map(row => Number(row.confidence))
    .filter(Number.isFinite);

  const averageConfidence =
    confidenceValues.length
      ? confidenceValues.reduce(
          (sum, value) => sum + value,
          0
        ) / confidenceValues.length
      : 0;

  const recommendations = {
    HOLD: 0,
    WATCH: 0,
    REDUCE_RISK: 0,
    EXIT_CONSIDERATION: 0
  };

  for (const row of rows) {
    const recommendation =
      String(
        row.recommendation || ""
      ).toUpperCase();

    if (
      Object.prototype.hasOwnProperty.call(
        recommendations,
        recommendation
      )
    ) {
      recommendations[recommendation]++;
    }
  }

  const providers = {};

  for (const row of rows) {
    const provider =
      String(
        row.provider || "unknown"
      );

    providers[provider] =
      (providers[provider] || 0) + 1;
  }

  return {
    success: true,
    totalAnalyses: total,
    averageConfidence:
      Math.round(averageConfidence * 10) / 10,
    recommendations,
    providers,
    latest:
      rows.length
        ? rows
            .slice()
            .sort(
              (a,b) =>
                new Date(b.created_at) -
                new Date(a.created_at)
            )[0]
        : null
  };
}
