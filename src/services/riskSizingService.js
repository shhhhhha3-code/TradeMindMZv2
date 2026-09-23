import { apiUrl } from "./apiBase.js";

export async function calculateRiskSizing({
  balanceUsdt,
  entryPrice,
  stopLoss,
  marketType = "PERP",
  riskPercent = 3,
  maxAllocationPercent = 100,
  leverage = 3,
} = {}) {
  const response = await fetch(apiUrl("/api/ai/risk-size"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      balanceUsdt,
      entryPrice,
      stopLoss,
      marketType,
      riskPercent,
      maxAllocationPercent,
      leverage,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || "Risk sizing unavailable.");
  }
  return data;
}
