import { useState, useEffect } from "react";
import { supabase, ADMIN_EMAILS, SUPER_ADMIN_EMAILS } from "../supabase/config";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user || null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export function isListedAdmin(user) {
  if (!user?.email) return false;
  if (ADMIN_EMAILS.length === 0) return true;
  return ADMIN_EMAILS.map((x) => x.toLowerCase()).includes(user.email.toLowerCase());
}

export function isSuperAdmin(user) {
  if (!user?.email) return false;
  return SUPER_ADMIN_EMAILS.map((x) => x.toLowerCase()).includes(user.email.toLowerCase());
}

export async function checkAdminAccess(user) {
  if (!user?.email) return false;
  if (isListedAdmin(user)) return true;
  try {
    const { data, error } = await supabase
      .from("admins")
      .select("email")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function fetchAdminProfile(email) {
  if (!email) return { domain: "", scopeKey: "", scopeLabel: "" };
  try {
    const { data, error } = await supabase
      .from("admins")
      .select("domain, scope_key, scope_label")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    if (!data) return { domain: "", scopeKey: "", scopeLabel: "" };

    return {
      domain: data.domain || "",
      scopeKey: data.scope_key || "",
      scopeLabel: data.scope_label || "",
    };
  } catch {
    return { domain: "", scopeKey: "", scopeLabel: "" };
  }
}
