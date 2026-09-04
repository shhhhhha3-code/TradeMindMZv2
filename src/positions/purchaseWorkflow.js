import {
  addManualPionexPosition,
} from "./manualPositionService.js";

export function registerManualPurchase(
  purchase
) {
  if (!purchase) {
    throw new Error(
      "Purchase information is required."
    );
  }

  const position =
    addManualPionexPosition(
      purchase
    );

  return {
    success: true,

    position,

    status:
      "POSITION_TRACKING_STARTED",
  };
}
