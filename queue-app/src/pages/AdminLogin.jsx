import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config";
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
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const allowed = await checkAdminAccess(cred.user);
      if (!allowed) {
        await auth.signOut();
        setError(t("auth.accountNotAllowed"));
        showToast.error(t("auth.accountNotAllowed"));
        return;
      }
      showToast.success(t("auth.loginSuccess"));
      navigate("/admin");
    } catch (err) {
      setError(t("auth.wrongCredentials"));
      showToast.error(t("auth.wrongCredentials"));
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
