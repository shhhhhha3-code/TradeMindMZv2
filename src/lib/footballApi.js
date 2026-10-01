export const FOOTBALL_AI_API = "https://imnnpilqjzfhvijhipzu.supabase.co/functions/v1/football-ai";
const DEFAULT_TIMEOUT_MS = 12000;

const asArray = value => Array.isArray(value) ? value : [];
const asObject = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};

async function request(path, { timeoutMs = DEFAULT_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(FOOTBALL_AI_API + path, {
      ...options,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(options.headers || {}) },
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!response.ok) {
      const detail = data?.error || data?.message || data?.raw || `HTTP ${response.status}`;
      throw new Error(`Football AI API ${response.status}: ${detail}`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Football AI API timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkFootballAiHealth() {
  return request("?action=health", { timeoutMs: 8000 });
}

export async function getFootballDiagnostics() {
  return request("?action=diagnostics", { timeoutMs: 30000 });
}

export async function getFootballDashboard(scope = "upcoming") {
  const data = await request("?action=dashboard&scope=" + encodeURIComponent(scope));
  return {
    ...data,
    matches: asArray(data?.matches),
    predictions: asArray(data?.predictions),
    engine: asObject(data?.engine),
  };
}

export async function syncFootballData(date = new Date().toISOString().slice(0, 10)) {
  return request(`?action=sync&date=${encodeURIComponent(date)}`, { timeoutMs: 30000 });
}

export async function getFootballHistory(from, to) {
  const params = new URLSearchParams({ action: "history" });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const data = await request("?" + params.toString(), { timeoutMs: 15000 });
  return {
    ...data,
    predictions: asArray(data?.predictions),
    leagues: asArray(data?.leagues),
    summary: asObject(data?.summary),
    model: asObject(data?.model),
  };
}

export async function trainFootballModel() {
  return request("?action=train", { timeoutMs: 30000 });
}
