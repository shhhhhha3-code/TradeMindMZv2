import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://imnnpilqjzfhvijhipzu.supabase.co";

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Legacy compatibility export.
 * The app no longer uses the old /trademind-api service.
 * All live football/backend traffic goes through football-ai.
 */
export async function checkSupabaseConnection() {
  try {
    const response = await fetch(
      "https://imnnpilqjzfhvijhipzu.supabase.co/functions/v1/football-ai?action=health",
      { headers: { Accept: "application/json" } }
    );
    const data = await response.json().catch(() => ({}));
    return {
      ok: Boolean(response.ok && data?.ok),
      status: data?.status || (response.ok ? "UNKNOWN" : "HTTP_ERROR"),
      error: data?.error || (!response.ok ? `Football AI API ${response.status}` : null),
      provider: "football-ai",
      footballApiConfigured: Boolean(data?.footballApiConfigured),
      apiFootballOddsConfigured: Boolean(data?.apiFootballOddsConfigured),
      groqConfigured: Boolean(data?.groqConfigured),
      openaiConfigured: Boolean(data?.openaiConfigured),
      usage: data?.usage || null,
    };
  } catch (error) {
    return {
      ok: false,
      status: "CONNECTION_FAILED",
      error: error?.message || "Football AI health check failed",
      provider: "football-ai",
    };
  }
}
