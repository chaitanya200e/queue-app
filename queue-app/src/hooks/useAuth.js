import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, ADMIN_EMAILS, SUPER_ADMIN_EMAILS } from "../firebase/config";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
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
    const snap = await getDoc(doc(db, "admins", user.email.toLowerCase()));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function fetchAdminProfile(email) {
  if (!email) return { domain: "", scopeKey: "", scopeLabel: "" };
  try {
    const snap = await getDoc(doc(db, "admins", email.toLowerCase()));
    if (!snap.exists()) return { domain: "", scopeKey: "", scopeLabel: "" };
    const data = snap.data() || {};
    return {
      domain: data.domain || "",
      scopeKey: data.scopeKey || "",
      scopeLabel: data.scopeLabel || "",
    };
  } catch {
    return { domain: "", scopeKey: "", scopeLabel: "" };
  }
}
