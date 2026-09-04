async function readJson(
  response,
  label
) {
  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      `${label}: invalid JSON response (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `${label}: request failed (${response.status})`
    );
  }

  return data;
}

export async function fetchLiveAiSignal(
  options = {}
) {
  const maxMarkets =
    Number(
      options.maxMarkets
    ) > 0
      ? Number(options.maxMarkets)
      : 25;

  const scannerResponse =
    await fetch(
      `/api/pionex/market-scan?limit=100&maxMarkets=${maxMarkets}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

  const scanner =
    await readJson(
      scannerResponse,
      "Pionex market scan"
    );

  const candidates =
    Array.isArray(
      scanner?.candidates
    )
      ? scanner.candidates
      : [];

  const topCandidates =
    candidates
      .slice(0, 5);

  if (
    topCandidates.length === 0
  ) {
    throw new Error(
      "Pionex scanner returned no candidates."
    );
  }

  const aiResponse =
    await fetch(
      "/api/ai/top-candidates",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json"
        },

        cache: "no-store",

        body: JSON.stringify({
          candidates:
            topCandidates,

          preferredProvider:
            options.preferredProvider ||
            "groq"
        })
      }
    );

  const ai =
    await readJson(
      aiResponse,
      "Groq TOP5 analysis"
    );

  const recommendation =
    ai?.recommendation ||
    null;

  return {
    success: true,

    provider:
      ai?.provider ||
      "groq",

    candidates:
      topCandidates,

    recommendation,

    comparison:
      Array.isArray(
        ai?.comparison
      )
        ? ai.comparison
        : [],

    summary:
      ai?.summary ||
      ai?.reasoning ||
      "Live market analysis completed.",

    scannedAt:
      new Date().toISOString()
  };
}

export async function fetchLiveAiTop5(
  options = {}
) {
  return fetchLiveAiSignal(
    options
  );
}
