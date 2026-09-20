import { apiUrl } from "./apiBase.js";

export async function fetchServerPositionMonitoring() {
  const response = await fetch(
    apiUrl("/api/ai/position-monitoring"),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("Position monitoring returned invalid JSON (" + response.status + ").");
  }

  if (!response.ok || data?.success !== true) {
    throw new Error(
      data?.error || "Server position monitoring failed (" + response.status + ")."
    );
  }

  return data;
}

export async function fetchTradeJournal(limit = 50) {
  const monitoring = await fetchServerPositionMonitoring();
  return {
    success: true,
    journal: Array.isArray(monitoring?.journal)
      ? monitoring.journal.slice(0, Math.max(1, Number(limit) || 50))
      : [],
    stats: monitoring?.journalStats || null,
    updatedAt: monitoring?.updatedAt || null,
  };
}
