import { apiUrl } from "./apiBase.js";

export async function fetchTradePerformanceSummary() {
  const response = await fetch(apiUrl("/api/ai/performance-summary"), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Invalid performance response (${response.status})`);
  }

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `Performance request failed (${response.status})`);
  }

  return data;
}
