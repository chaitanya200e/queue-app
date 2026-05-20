import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/config";
import { showToast } from "../toast";
import { slugify } from "../constants";

export default function AdminRequest() {
  const navigate = useNavigate();
  const location = useLocation();
  const [reqName, setReqName] = useState(location.state?.name || "");
  const [reqEmail, setReqEmail] = useState(location.state?.email || "");
  const [domain, setDomain] = useState("");
  const [fields, setFields] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFields({});
  }, [domain]);

  async function handleSubmit() {
    setError("");
    if (!reqName || !reqEmail || !domain) {
      const msg = "Please enter name, email, and select a domain.";
      setError(msg);
      showToast.error(msg);
      return;
    }

    setLoading(true);
    try {
      // Check if pending request exists
      const { data: existing, error: checkError } = await supabase
        .from("admin_requests")
        .select("*")
        .eq("email", reqEmail.toLowerCase())
        .eq("status", "pending")
        .single();
      
      if (existing) {
        const msg = "You already have a pending request. Please wait for approval.";
        setError(msg);
        showToast.error(msg);
        setLoading(false);
        return;
      }

      if (!fields.organizationName) {
        const msg = "Please enter organization / branch / office name.";
        setError(msg);
        showToast.error(msg);
        setLoading(false);
        return;
      }

      const organizationName = fields.organizationName.trim();
      const branchCity = fields.branchCity || "";
      const address = fields.address || "";
      const scopeLabel = organizationName;
      const scopeKey = slugify(organizationName);

      const { error: insertError } = await supabase
        .from("admin_requests")
        .insert([{
          name: reqName,
          email: reqEmail.toLowerCase(),
          domain,
          organization_name: organizationName,
          branch_city: branchCity,
          address,
          scope_key: scopeKey,
          scope_label: scopeLabel,
          status: "pending",
          created_at: new Date(),
        }]);
      
      if (insertError) throw insertError;
      
      showToast.success("Request submitted. Admin will review.");
      setTimeout(() => {
        setReqName(""); 
        setReqEmail(""); 
        setDomain(""); 
        setFields({});
      }, 500);
    } catch (e) {
      console.error("Error submitting admin request:", e);
      const msg = e?.message || "Failed to submit request";
      setError(msg);
      showToast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <div className="login-container">
        <div className="login-card" style={{ maxWidth: "500px" }}>
          <h1>Admin Access Request</h1>
          <p style={{ textAlign: "center", color: "#666", marginBottom: "24px", fontSize: "14px" }}>
            Request admin access for staff use
          </p>

          {error && <div className="login-error">{error}</div>}

          <div className="login-inputs">
            <input
              type="text"
              placeholder="Full Name"
              value={reqName}
              onChange={(e) => setReqName(e.target.value)}
              disabled={loading}
            />
            <input
              type="email"
              placeholder="Email Address"
              value={reqEmail}
              onChange={(e) => setReqEmail(e.target.value)}
              disabled={loading}
            />
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={loading}
              style={{ cursor: loading ? "not-allowed" : "pointer" }}
            >
              <option value="">Select Domain</option>
              <option value="bank">Bank</option>
              <option value="hospital">Hospital</option>
              <option value="government">Government Office</option>
              <option value="personal">Personal Organization</option>
            </select>

            {domain && (
              <>
                <input
                  type="text"
                  placeholder={
                    domain === "bank" ? "Bank / Branch Name"
                    : domain === "hospital" ? "Hospital Name"
                    : domain === "government" ? "Office / Department Name"
                    : "Organization Name"
                  }
                  value={fields.organizationName || ""}
                  onChange={(e) => setFields((prev) => ({ ...prev, organizationName: e.target.value }))}
                  disabled={loading}
                />
                <input
                  type="text"
                  placeholder="Branch / City (optional)"
                  value={fields.branchCity || ""}
                  onChange={(e) => setFields((prev) => ({ ...prev, branchCity: e.target.value }))}
                  disabled={loading}
                />
                <input
                  type="text"
                  placeholder="Address (optional)"
                  value={fields.address || ""}
                  onChange={(e) => setFields((prev) => ({ ...prev, address: e.target.value }))}
                  disabled={loading}
                />
              </>
            )}
          </div>

          <div className="login-buttons">
            <button className="login-signup" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <div className="spinner" style={{ width: "16px", height: "16px" }}></div>
                  Submitting...
                </span>
              ) : (
                "Submit Request"
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
