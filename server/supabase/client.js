import { createClient } from "@supabase/supabase-js";

function getSupabaseConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  const secretKey =
    process.env.SUPABASE_SECRET_KEY;

  return {
    url,
    secretKey,
  };
}

export function getSupabaseStatus() {
  const config = getSupabaseConfig();

  return {
    urlConfigured: Boolean(config.url),
    serverKeyConfigured: Boolean(config.secretKey),
  };
}

export function getSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config.url || !config.secretKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY."
    );
  }

  return createClient(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
