import {
  getAccountInfo,
  getOpenPositions,
} from "./pionexClient.js";

/**
 * Pionex adapter.
 *
 * This is the ONLY layer that knows about
 * Pionex response structures.
 *
 * Everything above this layer uses the
 * TradeMindMZ normalized format.
 *
 * READ ONLY.
 */

export async function readPionexAccount() {
  const [account, positions] =
    await Promise.allSettled([
      getAccountInfo(),
      getOpenPositions(),
    ]);

  const accountData =
    account.status === "fulfilled"
      ? account.value
      : null;

  const positionData =
    positions.status === "fulfilled"
      ? positions.value
      : null;

  return {
    connected:
      Boolean(
        accountData ||
        positionData
      ),

    account: accountData,

    positions: positionData,

    errors: {
      account:
        account.status === "rejected"
          ? String(
              account.reason?.message ||
              account.reason
            )
          : null,

      positions:
        positions.status === "rejected"
          ? String(
              positions.reason?.message ||
              positions.reason
            )
          : null,
    },

    updatedAt:
      new Date().toISOString(),
  };
}
