import {
  savePositionToSupabase,
} from "./positionSupabase.js";

/*
 * TradeMindMZ V2
 *
 * LocalStorage remains the immediate/local fallback.
 * Supabase becomes the persistent database copy.
 *
 * IMPORTANT:
 * This function NEVER sends an order to Pionex.
 */

export function persistManualPosition(position) {
  if (!position?.symbol) {
    return Promise.resolve({
      success: false,
      skipped: true,
      reason: "INVALID_POSITION",
    });
  }

  // Browser only.
  // This prevents Node workflow tests from trying to call
  // a browser-relative /api endpoint.
  if (
    typeof window === "undefined" ||
    typeof window.fetch !== "function"
  ) {
    return Promise.resolve({
      success: false,
      skipped: true,
      reason: "NON_BROWSER_CONTEXT",
    });
  }

  return savePositionToSupabase(position)
    .then((savedPosition) => {
      console.log(
        "✅ Position persisted to Supabase:",
        savedPosition?.id || position.id
      );

      return {
        success: true,
        position: savedPosition,
      };
    })
    .catch((error) => {
      // LocalStorage remains the fallback.
      // Do NOT break the working purchase workflow
      // if Supabase is temporarily unavailable.
      console.warn(
        "⚠️ Supabase position persistence failed. Local position retained.",
        error?.message || error
      );

      return {
        success: false,
        fallback: "LOCAL_STORAGE",
        error: error?.message || String(error),
      };
    });
}
