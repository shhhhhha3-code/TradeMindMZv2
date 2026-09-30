export const FOOTBALL_AI_API = "https://imnnpilqjzfhvijhipzu.supabase.co/functions/v1/football-ai";

export async function getFootballDashboard(date = new Date().toISOString().slice(0, 10)) {
  const response = await fetch(`${FOOTBALL_AI_API}?action=dashboard&date=${date}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Football AI API ${response.status}`);
  return response.json();
}

export async function syncFootballData(date = new Date().toISOString().slice(0, 10)) {
  const response = await fetch(`${FOOTBALL_AI_API}?action=sync&date=${date}`, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Football AI sync ${response.status}`);
  }
  return response.json();
}
