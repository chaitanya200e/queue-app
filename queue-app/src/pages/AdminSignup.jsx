import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { showToast } from "../toast";

export default function AdminSignup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignup() {
    setError("");
    if (!name || !email || !pass || !passConfirm) { 
      setError("Please fill all fields.");
      showToast.error("Please fill all fields.");
      return;
    }
    if (pass.length < 6) { 
      setError("Password must be at least 6 characters.");
      showToast.error("Password must be at least 6 characters.");
      return;
    }
    if (pass !== passConfirm) { 
      setError("Passwords do not match.");
      showToast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      await setDoc(doc(db, "admin_profiles", cred.user.uid), {
        name, email: email.toLowerCase(), createdAt: serverTimestamp(),
      });
      showToast.success("Account created. Redirecting to request access...");
      setTimeout(() => navigate("/admin-request"), 1000);
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
              placeholder="Password (min 6 chars)"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
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
