/**
 * TradeMindMZ V2 — Pionex normalized account model
 *
 * Internal representation only.
 *
 * No trading operations.
 */

export function createEmptyPionexAccount() {
  return {
    connected: false,

    spotBalances: [],

    futuresPositions: [],

    botPositions: [],

    totalAssets: null,

    updatedAt: null,
  };
}

export function normalizePionexBalance(balance = {}) {
  return {
    asset:
      balance.asset ||
      balance.coin ||
      balance.currency ||
      null,

    available:
      numberOrNull(
        balance.available ??
        balance.free ??
        balance.availableBalance
      ),

    frozen:
      numberOrNull(
        balance.frozen ??
        balance.locked ??
        balance.freeze
      ),

    total:
      numberOrNull(
        balance.total ??
        balance.balance
      ),
  };
}

export function normalizePionexBalances(
  balances = []
) {
  if (!Array.isArray(balances)) {
    return [];
  }

  return balances
    .map(normalizePionexBalance)
    .filter(
      (item) => item.asset
    );
}

function numberOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}
