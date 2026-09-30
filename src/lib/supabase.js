import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://imnnpilqjzfhvijhipzu.supabase.co";

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const SUPABASE_EDGE_API =
  "https://imnnpilqjzfhvijhipzu.supabase.co/functions/v1/trademind-api";

export async function checkSupabaseConnection() {
  try {
    const response = await fetch(
      `${SUPABASE_EDGE_API}/api/supabase/status`,
      { headers: { Accept: "application/json" } }
    );
    const data = await response.json();
    return {
      ok: Boolean(data?.ok),
      status: data?.status || "UNKNOWN",
      error: data?.error || null,
      provider: data?.provider || "supabase",
    };
  } catch (error) {
    return {
      ok: false,
      status: "CONNECTION_FAILED",
      error: error?.message || "Supabase connection failed",
      provider: "supabase",
    };
  }
}
