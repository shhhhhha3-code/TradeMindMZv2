import { supabase } from "../db/supabase";

export async function getCurrentSession() {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("TradeMindMZ auth session error:", error);
    return null;
  }

  return data.session || null;
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user || null;
}

export async function signInWithEmail(email, password) {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase is not configured.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    session: data.session,
    user: data.user,
  };
}

export async function signUpWithEmail(email, password) {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase is not configured.",
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    session: data.session,
    user: data.user,
  };
}

export async function signOut() {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("TradeMindMZ sign out error:", error);
  }
}
