import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase/config";
import { showToast } from "../toast";

const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (value) => value.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { id: "lower", label: "One lowercase letter", test: (value) => /[a-z]/.test(value) },
  { id: "number", label: "One number", test: (value) => /\d/.test(value) },
  { id: "special", label: "One special character", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export default function AdminSignup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const passwordChecks = PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(pass) }));
  const passwordIsStrong = passwordChecks.every((rule) => rule.passed);

  async function handleSignup() {
    setError("");
    if (!name || !email || !pass || !passConfirm) { 
      setError("Please fill all fields.");
      showToast.error("Please fill all fields.");
      return;
    }
    if (!passwordIsStrong) { 
      setError("Password must meet all security requirements.");
      showToast.error("Password must meet all security requirements.");
      return;
    }
    if (pass !== passConfirm) { 
      setError("Passwords do not match.");
      showToast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: pass,
      });
      
      if (authError) throw authError;

      showToast.success("Account created. Redirecting to request access...");
      setTimeout(() => navigate("/admin-request", { state: { name, email: email.toLowerCase() } }), 1000);
    } catch (e) {
      const errorMsg = e?.message || "Signup failed";
      setError(errorMsg);
      showToast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSignup();
  };

  return (
    <div className="app">
      <div className="login-container">
        <div className="login-card">
          <h1>Admin Sign Up</h1>
          <p style={{ textAlign: "center", color: "#666", marginBottom: "24px", fontSize: "14px" }}>
            Create your admin login. Approval is still required.
          </p>

          {error && <div className="login-error">{error}</div>}

          <div className="login-inputs">
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <div className="password-rules">
              {passwordChecks.map((rule) => (
                <div key={rule.id} className={rule.passed ? "password-rule passed" : "password-rule"}>
                  <span>{rule.passed ? "✓" : "•"}</span>
                  {rule.label}
                </div>
              ))}
            </div>
            <input
              type="password"
              placeholder="Confirm Password"
              value={passConfirm}
              onChange={(e) => setPassConfirm(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
          </div>

          <div className="login-buttons">
            <button className="login-signup" onClick={handleSignup} disabled={loading}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <div className="spinner" style={{ width: "16px", height: "16px" }}></div>
                  Creating...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
            <button className="login-login" onClick={() => navigate("/admin-login")} disabled={loading}>
              Back to Admin Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
