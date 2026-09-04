function extractError(data, fallback) {
  return (
    data?.error ||
    data?.message ||
    fallback
  );
}

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
      extractError(
        data,
        `${label}: request failed (${response.status})`
      )
    );
  }

  return data;
}

function toNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizePionexPosition(position, index) {
  const symbol =
    position?.symbol ??
    position?.market ??
    position?.contract ??
    position?.instrument ??
    null;

  const sideRaw =
    position?.side ??
    position?.positionSide ??
    position?.direction ??
    null;

  const side = sideRaw
    ? String(sideRaw).toUpperCase()
    : null;

  const quantity =
    toNumber(
      position?.quantity ??
      position?.qty ??
      position?.positionAmt ??
      position?.size ??
      position?.amount
    );

  const entryPrice =
    toNumber(
      position?.entryPrice ??
      position?.entry_price ??
      position?.avgEntryPrice ??
      position?.openPrice ??
      position?.averageEntryPrice
    );

  const markPrice =
    toNumber(
      position?.markPrice ??
      position?.mark_price ??
      position?.currentPrice ??
      position?.lastPrice ??
      position?.price
    );

  const unrealizedPnl =
    toNumber(
      position?.unrealizedPnl ??
      position?.unrealizedPNL ??
      position?.unrealized_profit ??
      position?.pnl ??
      position?.profit
    );

  const leverage =
    toNumber(
      position?.leverage ??
      position?.leverageValue
    );

  const margin =
    toNumber(
      position?.margin ??
      position?.initialMargin ??
      position?.marginUsed
    );

  const liquidationPrice =
    toNumber(
      position?.liquidationPrice ??
      position?.liquidation_price
    );

  return {
    id:
      position?.id ??
      position?.positionId ??
      `pionex-${index}-${symbol || "unknown"}`,

    source: "PIONEX",

    symbol,

    side,

    direction:
      side === "LONG"
        ? "BUY"
        : side === "SHORT"
          ? "SELL"
          : side,

    quantity,

    entryPrice,

    markPrice,

    currentPrice: markPrice,

    unrealizedPnl,

    leverage,

    margin,

    liquidationPrice,

    status: "OPEN",

    readOnly: true,

    raw: position
  };
}

function normalizePionexResponse(data) {
  const positions =
    Array.isArray(data?.positions)
      ? data.positions
      : [];

  return positions.map(
    normalizePionexPosition
  );
}

/**
 * Fetch actual currently-open positions
 * directly from Pionex.
 *
 * READ-ONLY.
 */
export async function fetchLivePionexPositions() {
  const response = await fetch(
    "/api/pionex/live-positions",
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    }
  );

  const data = await readJson(
    response,
    "Pionex live positions"
  );

  if (data?.success !== true) {
    throw new Error(
      extractError(
        data,
        "Pionex live positions unavailable"
      )
    );
  }

  return {
    success: true,

    source:
      data?.source || "PIONEX",

    method:
      data?.method || "getOpenPositions",

    count:
      Number(data?.count || 0),

    positions:
      normalizePionexResponse(data),

    readOnly: true,

    updatedAt:
      new Date().toISOString()
  };
}

/**
 * Primary frontend method.
 *
 * The Positions screen should use this.
 */
export async function fetchLivePositions() {
  return fetchLivePionexPositions();
}

/**
 * Explicit alias for future code.
 */
export async function fetchPionexPositions() {
  return fetchLivePionexPositions();
}

/**
 * Legacy-compatible method.
 */
export async function fetchPositions() {
  return fetchLivePionexPositions();
}

/**
 * Safe fallback for consumers that expect
 * a plain array.
 */
export async function fetchLivePositionList() {
  const result =
    await fetchLivePionexPositions();

  return result.positions;
}
