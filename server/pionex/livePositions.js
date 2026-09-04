import * as clientModule from "./pionexClient.js";
import * as adapterModule from "./pionexAdapter.js";

function findFunction(modules, names) {
  for (const module of modules) {
    for (const name of names) {
      if (
        module &&
        typeof module[name] === "function"
      ) {
        return {
          fn: module[name],
          name
        };
      }

      if (
        module?.default &&
        typeof module.default[name] === "function"
      ) {
        return {
          fn: module.default[name].bind(module.default),
          name: `default.${name}`
        };
      }
    }
  }

  return null;
}

function unwrapPositions(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.positions)) {
    return payload.positions;
  }

  if (
    payload.data &&
    Array.isArray(payload.data.positions)
  ) {
    return payload.data.positions;
  }

  if (
    payload.data &&
    Array.isArray(payload.data)
  ) {
    return payload.data;
  }

  if (
    payload.result &&
    Array.isArray(payload.result.positions)
  ) {
    return payload.result.positions;
  }

  if (
    payload.success === true &&
    payload.data &&
    Array.isArray(payload.data)
  ) {
    return payload.data;
  }

  return [];
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

function normalizePosition(position, index) {
  const symbol =
    position.symbol ??
    position.market ??
    position.contract ??
    position.instrument ??
    null;

  const sideRaw =
    position.side ??
    position.positionSide ??
    position.direction ??
    position.position_type ??
    null;

  const side = sideRaw
    ? String(sideRaw).toUpperCase()
    : null;

  const quantity =
    toNumber(
      position.quantity ??
      position.qty ??
      position.positionAmt ??
      position.size ??
      position.amount
    );

  const entryPrice =
    toNumber(
      position.entryPrice ??
      position.entry_price ??
      position.avgEntryPrice ??
      position.openPrice ??
      position.averageEntryPrice
    );

  const markPrice =
    toNumber(
      position.markPrice ??
      position.mark_price ??
      position.currentPrice ??
      position.lastPrice ??
      position.price
    );

  const unrealizedPnl =
    toNumber(
      position.unrealizedPnl ??
      position.unrealizedPNL ??
      position.unrealized_profit ??
      position.pnl ??
      position.profit
    );

  const leverage =
    toNumber(
      position.leverage ??
      position.leverageValue
    );

  const margin =
    toNumber(
      position.margin ??
      position.initialMargin ??
      position.marginUsed
    );

  const liquidationPrice =
    toNumber(
      position.liquidationPrice ??
      position.liquidation_price
    );

  return {
    id:
      position.id ??
      position.positionId ??
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

    raw: position
  };
}

const positionFunctionNames = [
  "getOpenPositions",
  "getPositions",
  "getAccountPositions",
  "getFuturesPositions",
  "fetchOpenPositions",
  "fetchPositions"
];

export async function fetchPionexLivePositions() {
  const modules = [
    clientModule,
    adapterModule
  ];

  const resolved =
    findFunction(
      modules,
      positionFunctionNames
    );

  if (!resolved) {
    const clientExports =
      Object.keys(clientModule);

    const adapterExports =
      Object.keys(adapterModule);

    throw new Error(
      [
        "Pionex position function not found.",
        `client exports: ${clientExports.join(", ")}`,
        `adapter exports: ${adapterExports.join(", ")}`
      ].join(" ")
    );
  }

  const payload =
    await resolved.fn();

  const positions =
    unwrapPositions(payload);

  return {
    success: true,
    source: "PIONEX",
    method: resolved.name,
    count: positions.length,
    positions:
      positions.map(normalizePosition)
  };
}
