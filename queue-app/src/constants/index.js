export const SERVICE_OPTIONS = {
  bank: [
    "Cash Deposit", "Cash Withdrawal", "New Account Opening", "KYC Update",
    "Passbook Update", "ATM Card Apply", "ATM Card Block", "PIN Generation / Change",
    "Loan Apply", "EMI / Loan Query", "Cheque Deposit", "Demand Draft",
    "Internet Banking Issue", "Account Statement", "Any Application (General)", "Other Services",
  ],
  hospital: ["OPD", "Lab Test", "Pharmacy", "Billing", "Emergency", "Other Services"],
  government: [
    "Certificate Application", "Certificate Collection", "Aadhaar Update",
    "Voter ID Service", "Ration Card Service", "Property Tax / House Tax",
    "Water Bill / Utility Payment", "Complaint / Grievance", "License / Permit Work",
    "Document Verification", "Form Submission", "General Inquiry", "Other Services",
  ],
  personal: ["Appointment", "Document Work", "Support", "Other Services"],
  general: ["General Service", "Other Services"],
};

export const DOMAIN_LOCATIONS = {
  bank: [
    "SBI Patansaongi Branch",
    "SBI Branch Mahal Nagpur",
    "SBI Branch West High Court Road Nagpur",
  ],
  hospital: [
    "GMCH Nagpur", "Mayo Hospital", "Max Hospitals", "Kingsway Hospitals",
    "AIIMS Nagpur", "Nagpur Municipal Corporation (NMC) Hospital",
  ],
  government: [
    "Nagpur Municipal Corporation", "Divisional Commissioner Office Nagpur",
    "Nagpur Collector Office", "Nagpur Improvement Trust",
    "Regional Passport Office Nagpur", "Reserve Bank of India Nagpur",
    "National Informatics Centre Nagpur", "Accountant General Office Nagpur",
    "Public Works Department Nagpur", "National Career Service Centre Nagpur",
  ],
};

export const LOCATION_DOMAINS = ["bank", "hospital", "government", "personal"];

export function slugify(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function formatTime12(time24) {
  if (!time24) return "";
  const parts = String(time24).split(":");
  if (parts.length < 2) return time24;
  const hour24 = Number(parts[0]);
  const minute = parts[1];
  if (!Number.isFinite(hour24)) return time24;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${ampm}`;
}

export function formatFullName(raw) {
  const cleaned = String(raw || "").trim().replace(/\s+/g, " ");
  const words = cleaned.split(" ");
  if (words.length < 2) return null;
  if (!/^[A-Za-z ]+$/.test(cleaned)) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function getTodayStr() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function normalizeDomain(value) {
  const v = String(value || "").toLowerCase().trim();
  if (v === "government office" || v === "gov office" || v === "govt" || v === "government") return "government";
  if (v === "personal organization" || v === "personal") return "personal";
  return v;
}
