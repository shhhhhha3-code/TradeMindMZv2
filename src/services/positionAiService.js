async function readJson(response, label) {
  let data;

  try {
    data = await response.json();
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

function normalizeMarketPayload(market) {
  if (!market) {
    return null;
  }

  if (Array.isArray(market)) {
    return {
      candidates: market
    };
  }

  if (Array.isArray(market?.candidates)) {
    return {
      candidates: market.candidates
    };
  }

  if (
    market &&
    typeof market === "object"
  ) {
    return market;
  }

  return null;
}

/**
 * Runs AI analysis against one live Pionex position.
 *
 * Market data is explicitly supplied to the backend.
 *
 * READ-ONLY.
 */
export async function analyzeLivePosition(
  position,
  options = {}
) {
  if (!position) {
    throw new Error(
      "A position is required for AI analysis."
    );
  }

  if (!position.symbol) {
    throw new Error(
      "Position symbol is required for AI analysis."
    );
  }

  const market =
    normalizeMarketPayload(
      options.market
    );

  const response = await fetch(
    "/api/ai/position-analyze",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },

      cache: "no-store",

      body: JSON.stringify({
        position,

        market,

        preferredProvider:
          options.preferredProvider ||
          "groq"
      })
    }
  );

  return readJson(
    response,
    "Position AI"
  );
}

/**
 * Analyze all supplied live positions.
 *
 * The browser performs no trading action.
 */
export async function analyzeLivePositions(
  positions,
  options = {}
) {
  if (
    !Array.isArray(positions)
  ) {
    throw new Error(
      "positions must be an array."
    );
  }

  if (
    positions.length === 0
  ) {
    return {
      success: true,
      analyses: [],
      count: 0
    };
  }

  const analyses = [];

  for (
    const position of positions
  ) {

    try {

      const result =
        await analyzeLivePosition(
          position,
          options
        );

      analyses.push({
        positionId:
          position.id,

        symbol:
          position.symbol,

        success:
          result?.success === true,

        result
      });

    } catch (error) {

      analyses.push({
        positionId:
          position.id,

        symbol:
          position.symbol,

        success: false,

        error:
          error?.message ||
          "Position AI failed"
      });

    }
  }

  return {
    success: true,

    analyses,

    count:
      analyses.length
  };
}

/**
 * Backward-compatible frontend API.
 *
 * main.jsx already calls this function.
 *
 * READ-ONLY.
 */
export async function analyzePositionWithAI(
  position,
  market = null
) {
  return analyzeLivePosition(
    position,
    {
      preferredProvider: "groq",
      market
    }
  );
}
