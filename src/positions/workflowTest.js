import {
  registerManualPurchase,
} from "./purchaseWorkflow.js";

export function runPurchaseWorkflowTest() {
  const result =
    registerManualPurchase({
      symbol: "TESTUSDT",
      side: "LONG",
      entryPrice: 100,
      quantity: 1,
      stopLoss: 95,
      takeProfit: 110,
    });

  if (
    !result.success ||
    result.status !==
      "POSITION_TRACKING_STARTED" ||
    result.position.symbol !==
      "TESTUSDT"
  ) {
    throw new Error(
      "Manual purchase workflow test failed."
    );
  }

  return result;
}
