import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabase/config";
import { showToast } from "../toast";
import { checkAdminAccess } from "../hooks/useAuth";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");
    if (!email || !password) { 
      setError(t("auth.fillAllFields"));
      showToast.error(t("auth.fillAllFields"));
      return;
    }
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });
      
      if (authError) throw authError;
      
      const allowed = await checkAdminAccess(data.user);
      if (!allowed) {
        await supabase.auth.signOut();
        setError(t("auth.accountNotAllowed"));
        showToast.error(t("auth.accountNotAllowed"));
        return;
      }
      showToast.success(t("auth.loginSuccess"));
      navigate("/admin");
    } catch (err) {
      console.error("Admin login error:", err);
      const rawMessage = err?.message || "";
      const lowerMessage = rawMessage.toLowerCase();
      let message = rawMessage || t("auth.wrongCredentials");

      if (lowerMessage.includes("invalid login credentials")) {
        message = "Invalid email or password. If this admin only submitted a request, create the account from Admin Sign Up first.";
      } else if (lowerMessage.includes("email not confirmed")) {
        message = "Email is not confirmed. Confirm this user in Supabase Authentication first.";
      }

      setError(message);
      showToast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="app">
      <div className="login-container">
        <div className="login-card">
          <h1>{t("auth.loginRequired")}</h1>
          <p style={{ textAlign: "center", color: "#666", marginBottom: "24px", fontSize: "14px" }}>
            {t("auth.authorizedAccessOnly")}
          </p>

          {error && <div className="login-error">{error}</div>}

          <div className="login-inputs">
            <input
              type="email"
              placeholder={t("auth.adminEmail")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <input
              type="password"
              placeholder={t("auth.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
          </div>

          <div className="login-buttons">
            <button className="login-login" onClick={handleLogin} disabled={loading}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <div className="spinner" style={{ width: "16px", height: "16px" }}></div>
                  {t("auth.loggingIn")}
                </span>
              ) : (
                t("auth.login")
              )}
            </button>
            <button className="login-signup" onClick={() => navigate("/admin-signup")} disabled={loading}>
              {t("auth.adminSignUp")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
