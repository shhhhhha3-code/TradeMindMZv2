import {
  isPionexConfigured,
} from "./pionexConfig.js";

/**
 * Never expose API keys.
 *
 * This endpoint only reports configuration state.
 */

export function getPionexStatus() {
  return {
    configured:
      isPionexConfigured(),

    mode:
      "READ_ONLY",

    tradingEnabled:
      false,

    orderExecution:
      false,

    apiKeyExposed:
      false,

    apiSecretExposed:
      false,
  };
}
