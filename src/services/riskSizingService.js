import { apiUrl } from "./apiBase.js";

export async function calculateRiskSizing({
  balanceUsdt,
  entryPrice,
  stopLoss,
  marketType = "PERP",
  riskPercent = 1,
  maxAllocationPercent = 10,
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
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || "Risk sizing unavailable.");
  }
  return data;
}
