import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { showToast } from "../toast";

const DOMAIN_FIELDS = {
  bank: [
    { id: "bankName", label: "Bank Name" },
    { id: "branchCity", label: "Branch / City" },
  ],
  hospital: [
    { id: "hospitalName", label: "Hospital Name" },
    { id: "hospitalAddress", label: "Address (optional)", required: false },
  ],
  government: [
    { id: "governmentOfficeName", label: "Government Office Name" },
    { id: "governmentDepartment", label: "Department / City" },
    { id: "governmentAddress", label: "Address (optional)", required: false },
  ],
  personal: [
    { id: "orgName", label: "Organization Name" },
    { id: "orgAddress", label: "Address (optional)", required: false },
  ],
};

export default function AdminRequest() {
  const navigate = useNavigate();
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [fields, setFields] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setFields({}); }, [domain]);

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
      const pending = await getDocs(
        query(collection(db, "admin_requests"),
          where("email", "==", reqEmail.toLowerCase()),
          where("status", "==", "pending"))
      );
      if (!pending.empty) {
        const msg = "You already have a pending request. Please wait for approval.";
        setError(msg);
        showToast.error(msg);
        setLoading(false);
        return;
      }

      let organizationName = "", branchCity = "", address = "";

      if (domain === "bank") {
        if (!fields.bankName || !fields.branchCity) { 
          const msg = "Please enter bank name and branch/city.";
          setError(msg);
          showToast.error(msg);
          setLoading(false);
          return;
        }
        organizationName = fields.bankName;
        branchCity = fields.branchCity;
      } else if (domain === "hospital") {
        if (!fields.hospitalName) { 
          const msg = "Please enter hospital name.";
          setError(msg);
          showToast.error(msg);
          setLoading(false);
          return;
        }
        organizationName = fields.hospitalName;
        address = fields.hospitalAddress || "";
      } else if (domain === "government") {
        if (!fields.governmentOfficeName || !fields.governmentDepartment) {
          const msg = "Please enter government office name and department/city.";
          setError(msg);
          showToast.error(msg);
          setLoading(false);
          return;
        }
        organizationName = fields.governmentOfficeName;
        branchCity = fields.governmentDepartment;
        address = fields.governmentAddress || "";
      } else if (domain === "personal") {
        if (!fields.orgName) { 
          const msg = "Please enter organization name.";
          setError(msg);
          showToast.error(msg);
          setLoading(false);
          return;
        }
        organizationName = fields.orgName;
        address = fields.orgAddress || "";
      }

      await addDoc(collection(db, "admin_requests"), {
        name: reqName, email: reqEmail.toLowerCase(),
        domain, organizationName, branchCity, address,
        status: "pending", createdAt: serverTimestamp(),
      });
      showToast.success("Request submitted. Admin will review.");
      setTimeout(() => {
        setReqName(""); 
        setReqEmail(""); 
        setDomain(""); 
        setFields({});
      }, 500);
    } catch (e) {
      const msg = "Failed to submit request";
      setError(msg);
      showToast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const domainFields = DOMAIN_FIELDS[domain] || [];

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

            {domainFields.map((f) => (
              <input
                key={f.id}
                type="text"
                placeholder={f.label}
                value={fields[f.id] || ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.id]: e.target.value }))}
                disabled={loading}
              />
            ))}
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
