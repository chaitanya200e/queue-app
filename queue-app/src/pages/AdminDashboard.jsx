import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase, SUPER_ADMIN_EMAILS } from "../supabase/config";
import { useAuth, checkAdminAccess, fetchAdminProfile } from "../hooks/useAuth";
import { showToast } from "../toast";
import AnalyticsChart from "../AnalyticsChart";
import { DOMAIN_LOCATIONS, LOCATION_DOMAINS, formatTime12, getTodayStr, slugify } from "../constants";

// ─── helpers ────────────────────────────────────────────────────────────────
function toMinutes12(hour, minute, ampm) {
  const h = Number(hour), m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  let hr = h % 12;
  if (ampm === "PM") hr += 12;
  return hr * 60 + m;
}
function minutesToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function parseTimeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
function normalizeTokenNumber(item) {
  const num = Number(item?.tokenNumber);
  if (Number.isFinite(num)) return num;
  const digits = String(item?.tokenId || "").replace(/\D/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}
function getTodayKey() { return getTodayStr(); }
function timestampToDateKey(v) {
  if (!v) return "";
  const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getScopeLabelFromData(data) {
  const domain = String(data?.domain || "").toLowerCase();
  const organizationName = data?.organization_name || data?.organizationName || "";
  const branchCity = data?.branch_city || data?.branchCity || "";
  if (domain === "government" || domain === "hospital") return String(organizationName).trim();
  if (domain === "bank") return String(branchCity || organizationName).trim();
  return "";
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function minutesTo12Parts(totalMinutes) {
  const mins = ((totalMinutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(mins / 60);
  const minute = mins % 60;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return {
    hour: String(hour12).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
    ampm,
  };
}

function getDefaultSlotTimes() {
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const roundedStart = Math.ceil(currentMins / 5) * 5;
  return {
    start: minutesTo12Parts(roundedStart),
    end: minutesTo12Parts(roundedStart + 30),
  };
}

function getDisplayScopeName(domain, scopeLabel) {
  if (scopeLabel) return scopeLabel;
  if (!domain) return "Admin Dashboard";
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function formatSlotOption(slot) {
  if (!slot) return "";
  return `${slot.date} | ${formatTime12(slot.start_time)} - ${formatTime12(slot.end_time)}`;
}

function slotCounterId(slotId) {
  return `slot:${slotId}`;
}

// ─── component ──────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const defaultSlotTimes = getDefaultSlotTimes();

  // Auth state
  const [adminReady, setAdminReady] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminDomain, setAdminDomain] = useState("");
  const [adminScopeKey, setAdminScopeKey] = useState("");
  const [adminScopeLabel, setAdminScopeLabel] = useState("");
  const isSuper = SUPER_ADMIN_EMAILS.map(x => x.toLowerCase()).includes(adminEmail.toLowerCase());
  const displayScopeName = isSuper ? "All Locations" : getDisplayScopeName(adminDomain, adminScopeLabel);

  // Queue state
  const [waiting, setWaiting] = useState([]);
  const [served, setServed] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statWaiting, setStatWaiting] = useState(0);
  const [statDoneToday, setStatDoneToday] = useState(0);
  const [statLastToken, setStatLastToken] = useState("Q000");
  const [currentServing, setCurrentServing] = useState("Q000");

  // Slots state
  const [slots, setSlots] = useState([]);
  const [queueSlotFilter, setQueueSlotFilter] = useState("all");
  const [approvedLocations, setApprovedLocations] = useState({});
  const [slotDate, setSlotDate] = useState(getTodayStr());
  const [slotCapacity, setSlotCapacity] = useState("");
  const [slotDomain, setSlotDomain] = useState("general");
  const [slotLocation, setSlotLocation] = useState("");
  const [startHour, setStartHour] = useState(defaultSlotTimes.start.hour);
  const [startMinute, setStartMinute] = useState(defaultSlotTimes.start.minute);
  const [startAmPm, setStartAmPm] = useState(defaultSlotTimes.start.ampm);
  const [endHour, setEndHour] = useState(defaultSlotTimes.end.hour);
  const [endMinute, setEndMinute] = useState(defaultSlotTimes.end.minute);
  const [endAmPm, setEndAmPm] = useState(defaultSlotTimes.end.ampm);
  const [slotLoading, setSlotLoading] = useState(false);

  const duration = (() => {
    const s = toMinutes12(startHour, startMinute, startAmPm);
    const e = toMinutes12(endHour, endMinute, endAmPm);
    return s !== null && e !== null && e > s ? e - s : null;
  })();
  const effectiveSlotDomain = isSuper ? slotDomain : adminDomain;
  const slotLocationOptions = approvedLocations[effectiveSlotDomain] || DOMAIN_LOCATIONS[effectiveSlotDomain] || [];
  const showSlotLocation = LOCATION_DOMAINS.includes(effectiveSlotDomain);
  const visibleSlots = slots.filter((slot) => String(slot.status || "active").toLowerCase() === "active");
  const queueSlots = visibleSlots.filter((slot) => !adminScopeKey || isSuper || String(slot.domain_location || "") === adminScopeKey);
  const filteredWaiting = queueSlotFilter === "all"
    ? waiting
    : waiting.filter((item) => String(item.slot_id || "") === queueSlotFilter);
  const filteredServed = queueSlotFilter === "all"
    ? served
    : served.filter((item) => String(item.slot_id || "") === queueSlotFilter);
  const recentServed = [...filteredServed]
    .sort((a, b) => new Date(b.served_at || b.created_at || 0) - new Date(a.served_at || a.created_at || 0))
    .slice(0, 20);
  const selectedSlotLabel = queueSlotFilter === "all"
    ? "All Slots"
    : formatSlotOption(slots.find((slot) => slot.id === queueSlotFilter));

  function applyCurrentSlotTime() {
    const next = getDefaultSlotTimes();
    setSlotDate(getTodayStr());
    setStartHour(next.start.hour);
    setStartMinute(next.start.minute);
    setStartAmPm(next.start.ampm);
    setEndHour(next.end.hour);
    setEndMinute(next.end.minute);
    setEndAmPm(next.end.ampm);
  }

  // Auth check
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/admin-login"); return; }

    (async () => {
      const allowed = await checkAdminAccess(user);
      if (!allowed) { 
        await supabase.auth.signOut(); 
        navigate("/admin-login"); 
        return; 
      }

      const email = user.email.toLowerCase();
      setAdminEmail(email);
      const superUser = SUPER_ADMIN_EMAILS.map(x => x.toLowerCase()).includes(email);
      if (!superUser) {
        const profile = await fetchAdminProfile(email);
        setAdminDomain(profile.domain || "");
        setAdminScopeKey(profile.scopeKey || "");
        setAdminScopeLabel(profile.scopeLabel || "");
        if (profile.domain) setSlotDomain(profile.domain);
        if (profile.scopeKey) setSlotLocation(profile.scopeKey);
      }
      setAdminReady(true);
    })();
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!adminReady) return;

    async function fetchApprovedLocations() {
      try {
        const { data, error } = await supabase
          .from("locations")
          .select("domain, scope_key, scope_label")
          .not("scope_key", "is", null);

        if (error) throw error;

        const grouped = {};
        (data || []).forEach((item) => {
          if (!item.domain || !item.scope_label) return;
          if (!grouped[item.domain]) grouped[item.domain] = [];
          if (!grouped[item.domain].includes(item.scope_label)) grouped[item.domain].push(item.scope_label);
        });
        setApprovedLocations(grouped);
      } catch (error) {
        console.error("Error fetching approved locations:", error);
      }
    }

    fetchApprovedLocations();
  }, [adminReady]);

  function isInAdminScope(item) {
    if (isSuper) return true;
    if (adminDomain && String(item?.domain || "").toLowerCase() !== adminDomain) return false;
    if (adminScopeKey) {
      const itemScope = String(item?.domain_location || item?.scope_key || "").toLowerCase();
      return itemScope === adminScopeKey;
    }
    return true;
  }

  // Fetch queue data
  useEffect(() => {
    if (!adminReady) return;

    async function fetchQueue() {
      try {
        const { data, error } = await supabase
          .from("queue")
          .select("*")
          .order("token_number", { ascending: true });
        
        if (error) throw error;

        const scoped = (data || []).filter(isInAdminScope);
        const w = scoped.filter((x) => x.status === "waiting");
        const s = scoped.filter((x) => x.status === "served");

        const sorted = [...w].sort((a, b) => {
          const an = normalizeTokenNumber(a), bn = normalizeTokenNumber(b);
          if (an === null && bn === null) return 0;
          if (an === null) return 1; if (bn === null) return -1;
          return an - bn;
        });

        setWaiting(sorted);
        setServed(s);
        setStatWaiting(queueSlotFilter === "all" ? w.length : w.filter((x) => String(x.slot_id || "") === queueSlotFilter).length);

        // Count today's served
        const now = new Date();
        const servedForStats = queueSlotFilter === "all" ? s : s.filter((x) => String(x.slot_id || "") === queueSlotFilter);
        const todayDone = servedForStats.filter((x) => {
          if (!x.served_at) return false;
          const d = new Date(x.served_at);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        });
        setStatDoneToday(todayDone.length);
      } catch (error) {
        console.error("Error fetching queue:", error);
      }
    }

    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [adminReady, isSuper, adminDomain, adminScopeKey, queueSlotFilter]);

  // Fetch current serving
  useEffect(() => {
    if (!adminReady) return;

    async function fetchCurrent() {
      try {
        const { data } = await supabase
          .from("meta")
          .select("*")
          .eq("id", "queue")
          .single();
        
        if (data) {
          setCurrentServing(data.current_token || "Q000");
        }
      } catch (error) {
        console.error("Error fetching current:", error);
      }
    }

    fetchCurrent();
    const interval = setInterval(fetchCurrent, 5000);
    return () => clearInterval(interval);
  }, [adminReady]);

  // Fetch last token
  useEffect(() => {
    if (!adminReady) return;

    async function fetchLastToken() {
      try {
        if (queueSlotFilter !== "all") {
          const { data } = await supabase
            .from("counters")
            .select("value")
            .eq("id", slotCounterId(queueSlotFilter))
            .maybeSingle();

          const val = Number(data?.value || 1);
          const last = Math.max((Number.isFinite(val) && val > 0 ? Math.floor(val) : 1) - 1, 0);
          setStatLastToken("Q" + String(last).padStart(3, "0"));
          return;
        }

        const scopedWaitingAndServed = [...waiting, ...served];
        const maxToken = scopedWaitingAndServed.reduce((max, item) => {
          const num = normalizeTokenNumber(item);
          return num === null ? max : Math.max(max, num);
        }, 0);
        setStatLastToken("Q" + String(maxToken).padStart(3, "0"));
      } catch (error) {
        console.error("Error fetching last token:", error);
      }
    }

    fetchLastToken();
  }, [adminReady, queueSlotFilter, waiting, served]);

  // Fetch slots
  useEffect(() => {
    if (!adminReady) return;

    async function fetchSlots() {
      try {
        let query = supabase
          .from("slots")
          .select("*")
          .order("date", { ascending: true });

        query = query.eq("domain", isSuper ? slotDomain : adminDomain);
        if (!isSuper && adminScopeKey) query = query.eq("domain_location", adminScopeKey);
        if (isSuper && LOCATION_DOMAINS.includes(slotDomain) && slotLocation) {
          query = query.eq("domain_location", slotLocation);
        }

        const { data, error } = await query;
        
        if (error) throw error;

        const filtered = (data || []).filter((s) => {
          const status = String(s.status || "").toLowerCase();
          if (status === "archived" || status === "deleted") return false;
          if (status !== "active" && Number(s.booked || 0) > 0) return false;
          return true;
        });

        setSlots(filtered);
        if (queueSlotFilter !== "all" && !filtered.some((slot) => slot.id === queueSlotFilter)) {
          setQueueSlotFilter("all");
        }
      } catch (error) {
        console.error("Error fetching slots:", error);
      }
    }

    fetchSlots();
  }, [adminReady, isSuper, adminDomain, adminScopeKey, slotDomain, slotLocation, queueSlotFilter]);

  // Fetch admin access requests for super admin
  useEffect(() => {
    if (!adminReady || !isSuper) return;

    async function fetchRequests() {
      try {
        const { data, error } = await supabase
          .from("admin_requests")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setRequests(data || []);
      } catch (error) {
        console.error("Error fetching admin requests:", error);
      }
    }

    fetchRequests();
    const interval = setInterval(fetchRequests, 5000);
    return () => clearInterval(interval);
  }, [adminReady, isSuper]);

  async function callToken(item) {
    try {
      const { error } = await supabase
        .from("meta")
        .update({
          current_token: item.token_id,
          current_name: item.name || "",
          current_slot_label: item.slot_label || "",
          current_slot_date: item.slot_date || null,
          updated_at: new Date(),
        })
        .eq("id", "queue");

      if (error) throw error;
      setCurrentServing(item.token_id);
      showToast.success(`${item.token_id} called`);
    } catch (error) {
      console.error("Error calling token:", error);
      showToast.error(error?.message || "Failed to call token");
    }
  }

  // Mark as served
  async function markServed(tokenId) {
    try {
      const { error } = await supabase
        .from("queue")
        .update({ status: "served", served_at: new Date() })
        .eq("token_id", tokenId);
      
      if (error) throw error;
      showToast.success(`${tokenId} marked as served`);

      // Update meta
      await supabase
        .from("meta")
        .update({ current_token: tokenId })
        .eq("id", "queue");
    } catch (error) {
      showToast.error("Failed to mark as served");
    }
  }

  // Mark as no-show
  async function markNoShow(tokenId) {
    try {
      const { error } = await supabase
        .from("queue")
        .update({ status: "no-show" })
        .eq("token_id", tokenId);
      
      if (error) throw error;
      showToast.success(`${tokenId} marked as no-show`);
    } catch (error) {
      showToast.error("Failed to mark as no-show");
    }
  }

  // Create slot
  async function createSlot() {
    if (!slotCapacity || slotCapacity <= 0) {
      showToast.error("Invalid capacity");
      return;
    }

    setSlotLoading(true);
    try {
      const startMins = toMinutes12(startHour, startMinute, startAmPm);
      const endMins = toMinutes12(endHour, endMinute, endAmPm);
      const effectiveDomain = (isSuper ? slotDomain : adminDomain) || slotDomain;
      const effectiveLocation = LOCATION_DOMAINS.includes(effectiveDomain)
        ? (isSuper ? slotLocation : adminScopeKey)
        : "";
      const locationLabel = (DOMAIN_LOCATIONS[effectiveDomain] || []).find((item) => slugify(item) === effectiveLocation) || adminScopeLabel || "";
      
      if (!startMins || !endMins || endMins <= startMins) {
        showToast.error("Invalid time range");
        setSlotLoading(false);
        return;
      }

      if (LOCATION_DOMAINS.includes(effectiveDomain) && !effectiveLocation) {
        showToast.error("Please select branch / hospital / office");
        setSlotLoading(false);
        return;
      }

      const newSlot = {
        id: crypto.randomUUID(),
        date: slotDate,
        domain: effectiveDomain,
        domain_location: effectiveLocation,
        domain_location_label: locationLabel,
        start_time: minutesToTime(startMins),
        end_time: minutesToTime(endMins),
        capacity: Number(slotCapacity),
        booked: 0,
        status: "active",
        created_at: new Date(),
      };

      const { error } = await supabase
        .from("slots")
        .insert([newSlot]);
      
      if (error) throw error;
      setSlots((prev) => [...prev, newSlot].sort((a, b) => (
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.start_time || "").localeCompare(String(b.start_time || ""))
      )));
      setQueueSlotFilter(newSlot.id);
      showToast.success("Slot created");
      setSlotCapacity("");
    } catch (error) {
      console.error("Error creating slot:", error);
      showToast.error(error?.message || "Failed to create slot");
    } finally {
      setSlotLoading(false);
    }
  }

  async function clearWaiting() {
    if (!filteredWaiting.length) {
      showToast.info("No waiting tokens");
      return;
    }

    try {
      const updates = await Promise.all(filteredWaiting.map((item) => (
        supabase.from("queue").update({ status: "cleared" }).eq("id", item.id)
      )));
      const failed = updates.find((result) => result.error);
      if (failed?.error) throw failed.error;
      setWaiting((prev) => prev.filter((item) => !filteredWaiting.some((token) => token.id === item.id)));
      setStatWaiting((prev) => Math.max(prev - filteredWaiting.length, 0));
      showToast.success("Waiting tokens cleared");
    } catch (error) {
      console.error("Error clearing waiting tokens:", error);
      showToast.error(error?.message || "Failed to clear waiting tokens");
    }
  }

  async function clearDone() {
    if (!filteredServed.length) {
      showToast.info("No done tokens");
      return;
    }

    try {
      const updates = await Promise.all(filteredServed.map((item) => (
        supabase.from("queue").update({ status: "archived" }).eq("id", item.id)
      )));
      const failed = updates.find((result) => result.error);
      if (failed?.error) throw failed.error;
      setServed((prev) => prev.filter((item) => !filteredServed.some((token) => token.id === item.id)));
      showToast.success("Done tokens cleared");
    } catch (error) {
      console.error("Error clearing done tokens:", error);
      showToast.error(error?.message || "Failed to clear done tokens");
    }
  }

  async function closeSlot(slotId) {
    try {
      const { error } = await supabase
        .from("slots")
        .update({ status: "closed" })
        .eq("id", slotId);

      if (error) throw error;
      setSlots((prev) => prev.map((slot) => (
        slot.id === slotId ? { ...slot, status: "closed" } : slot
      )));
      showToast.success("Slot closed");
    } catch (error) {
      console.error("Error closing slot:", error);
      showToast.error(error?.message || "Failed to close slot");
    }
  }

  async function deleteSlot(slotId) {
    try {
      const { error } = await supabase
        .from("slots")
        .update({ status: "deleted" })
        .eq("id", slotId);

      if (error) throw error;
      setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
      showToast.success("Slot deleted");
    } catch (error) {
      console.error("Error deleting slot:", error);
      showToast.error(error?.message || "Failed to delete slot");
    }
  }

  async function resetDay() {
    const targetSlots = queueSlotFilter === "all"
      ? queueSlots.filter((slot) => slot.date === slotDate)
      : queueSlots.filter((slot) => slot.id === queueSlotFilter);

    if (!targetSlots.length) {
      showToast.info("No slot selected for reset");
      return;
    }

    const ok = window.confirm(`Reset ${queueSlotFilter === "all" ? "today's slots" : selectedSlotLabel}? Token will start again from Q001.`);
    if (!ok) return;

    try {
      const targetIds = targetSlots.map((slot) => slot.id);
      const queueUpdates = await Promise.all(targetIds.map((id) => (
        supabase
          .from("queue")
          .update({ status: "archived" })
          .eq("slot_id", id)
          .in("status", ["waiting", "served", "no-show", "cleared"])
      )));
      const slotUpdates = await Promise.all(targetIds.map((id) => (
        supabase.from("slots").update({ booked: 0 }).eq("id", id)
      )));
      const counterUpdates = await Promise.all(targetIds.map((id) => (
        supabase.from("counters").upsert({ id: slotCounterId(id), value: 1 }, { onConflict: "id" })
      )));
      const failed = [...queueUpdates, ...slotUpdates, ...counterUpdates].find((result) => result.error);
      if (failed?.error) throw failed.error;

      setWaiting((prev) => prev.filter((item) => !targetIds.includes(item.slot_id)));
      setServed((prev) => prev.filter((item) => !targetIds.includes(item.slot_id)));
      setSlots((prev) => prev.map((slot) => targetIds.includes(slot.id) ? { ...slot, booked: 0 } : slot));
      setCurrentServing("Q000");
      setStatLastToken("Q000");
      showToast.success("Day reset. Next token will be Q001.");
    } catch (error) {
      console.error("Error resetting day:", error);
      showToast.error(error?.message || "Failed to reset day");
    }
  }

  async function approveRequest(item) {
    const emailKey = String(item.email || "").toLowerCase();
    if (!emailKey) {
      showToast.error("Missing request email");
      return;
    }

    const organizationName = item.organization_name || item.organizationName || "";
    const branchCity = item.branch_city || item.branchCity || "";
    const scopeLabel = item.scope_label || item.scopeLabel || getScopeLabelFromData(item);
    const scopeKey = item.scope_key || item.scopeKey || slugify(scopeLabel);

    try {
      const { error: adminError } = await supabase
        .from("admins")
        .upsert([{
          email: emailKey,
          name: item.name || "",
          domain: item.domain || "",
          organization_name: organizationName,
          branch_city: branchCity,
          address: item.address || "",
          scope_key: scopeKey,
          scope_label: scopeLabel,
          approved_by: adminEmail,
          approved_at: new Date(),
        }], { onConflict: "email" });

      if (adminError) throw adminError;

      if (scopeKey && scopeLabel) {
        const { error: locationError } = await supabase
          .from("locations")
          .upsert([{
            domain: item.domain || "",
            scope_key: scopeKey,
            scope_label: scopeLabel,
            address: item.address || "",
            created_by: adminEmail,
            created_at: new Date(),
          }], { onConflict: "domain,scope_key" });

        if (locationError) throw locationError;
      }

      const { error: requestError } = await supabase
        .from("admin_requests")
        .update({
          status: "approved",
        })
        .eq("id", item.id);

      if (requestError) throw requestError;

      setRequests((prev) => prev.map((request) => (
        request.id === item.id ? { ...request, status: "approved" } : request
      )));
      showToast.success("Request approved");
    } catch (error) {
      console.error("Error approving request:", error);
      showToast.error(error?.message || "Failed to approve request");
    }
  }

  async function rejectRequest(item) {
    try {
      const { error } = await supabase
        .from("admin_requests")
        .update({
          status: "rejected",
        })
        .eq("id", item.id);

      if (error) throw error;

      setRequests((prev) => prev.map((request) => (
        request.id === item.id ? { ...request, status: "rejected" } : request
      )));
      showToast.success("Request rejected");
    } catch (error) {
      console.error("Error rejecting request:", error);
      showToast.error(error?.message || "Failed to reject request");
    }
  }

  // Logout
  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/admin-login");
  }

  if (!adminReady) {
    return <div className="app"><p style={{ textAlign: "center", marginTop: "40px" }}>Loading...</p></div>;
  }

  return (
    <div className="app admin-dashboard-page">
      <div className="admin-header">
        <div>
          <h1>{displayScopeName}</h1>
          <p>{isSuper ? "Super admin control panel" : "Admin Dashboard"}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Waiting</h3>
          <p className="stat-value">{statWaiting}</p>
        </div>
        <div className="stat-card">
          <h3>Served Today</h3>
          <p className="stat-value">{statDoneToday}</p>
        </div>
        <div className="stat-card">
          <h3>Now Serving</h3>
          <p className="stat-value">{currentServing}</p>
        </div>
        <div className="stat-card">
          <h3>Last Token</h3>
          <p className="stat-value">{statLastToken}</p>
        </div>
      </div>

      <div className="admin-dashboard-grid">
        {/* Queue Management */}
        <div className="section queue-management-panel">
          <div className="section-title-row">
            <h2>Queue Management</h2>
            <div className="queue-toolbar">
              <button onClick={resetDay} className="btn-secondary">Reset Day</button>
              <button onClick={clearWaiting} className="btn-secondary">Clear Waiting</button>
              <button onClick={clearDone} className="btn-secondary">Clear Done</button>
            </div>
          </div>
          <div className="queue-filter-row">
            <label>
              <span>Token Queue</span>
              <select value={queueSlotFilter} onChange={(e) => setQueueSlotFilter(e.target.value)}>
                <option value="all">All Slots</option>
                {queueSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {formatSlotOption(slot)} ({Number(slot.booked || 0)}/{Number(slot.capacity || 0)})
                  </option>
                ))}
              </select>
            </label>
            <p>{selectedSlotLabel}</p>
          </div>
        
          {filteredWaiting.length > 0 ? (
            <div className="queue-section">
              <h3>Waiting Tokens</h3>
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Name</th>
                    <th>Service</th>
                    <th>Slot</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWaiting.map((item) => (
                    <tr key={item.id}>
                      <td>{item.token_id}</td>
                      <td>{item.name}</td>
                      <td>{item.service_type}</td>
                      <td>{item.slot_label}</td>
                      <td>
                        <button onClick={() => callToken(item)} className="btn-small btn-call-token">Call</button>
                        <button onClick={() => markServed(item.token_id)} className="btn-small btn-served">Done</button>
                        <button onClick={() => markNoShow(item.token_id)} className="btn-small btn-noshow">No-Show</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No waiting tokens</p>
          )}

          {recentServed.length > 0 && (
            <div className="queue-section">
              <h3>Recently Served</h3>
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Name</th>
                    <th>Service</th>
                  </tr>
                </thead>
                <tbody>
                  {recentServed.map((item) => (
                    <tr key={item.id}>
                      <td>{item.token_id}</td>
                      <td>{item.name}</td>
                      <td>{item.service_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Slot Management */}
        <div className="section slot-management-panel">
          <div className="section-title-row">
            <h2>Slot Management</h2>
            <button type="button" onClick={applyCurrentSlotTime} className="btn-secondary">Use Current Time</button>
          </div>
        
          <div className="slot-form">
            <label>
              <span>Date</span>
              <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
            </label>
            <label>
              <span>Domain</span>
              <select
                value={effectiveSlotDomain || slotDomain}
                onChange={(e) => { setSlotDomain(e.target.value); setSlotLocation(""); }}
                disabled={!isSuper}
              >
                <option value="general">General</option>
                <option value="bank">Bank</option>
                <option value="hospital">Hospital</option>
                <option value="government">Government</option>
                <option value="personal">Personal</option>
              </select>
            </label>

            {showSlotLocation && (
              <label>
                <span>Branch / Hospital / Office</span>
                <select
                  value={isSuper ? slotLocation : adminScopeKey}
                  onChange={(e) => setSlotLocation(e.target.value)}
                  disabled={!isSuper}
                >
                  <option value="">Select Location</option>
                  {slotLocationOptions.map((item) => (
                    <option key={item} value={slugify(item)}>{item}</option>
                  ))}
                </select>
              </label>
            )}
          
            <fieldset className="time-field">
              <legend>Start Time</legend>
              <select value={startHour} onChange={(e) => setStartHour(e.target.value)}>
                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <select value={startMinute} onChange={(e) => setStartMinute(e.target.value)}>
                {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={startAmPm} onChange={(e) => setStartAmPm(e.target.value)}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </fieldset>

            <fieldset className="time-field">
              <legend>End Time</legend>
              <select value={endHour} onChange={(e) => setEndHour(e.target.value)}>
                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <select value={endMinute} onChange={(e) => setEndMinute(e.target.value)}>
                {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={endAmPm} onChange={(e) => setEndAmPm(e.target.value)}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </fieldset>

            <label>
              <span>Capacity</span>
              <input 
                type="number" 
                placeholder="Capacity" 
                value={slotCapacity} 
                onChange={(e) => setSlotCapacity(e.target.value)} 
                min="1"
              />
            </label>
            <div className="slot-summary">
              {duration ? `${duration} min slot: ${startHour}:${startMinute} ${startAmPm} - ${endHour}:${endMinute} ${endAmPm}` : "Choose a valid time range"}
            </div>
            <button onClick={createSlot} disabled={slotLoading || !duration} className="btn-primary">
              {slotLoading ? "Creating..." : "Create Slot"}
            </button>
          </div>

          <div className="slots-list">
            <h3>Available Slots</h3>
            {slots.length > 0 ? (
              <table className="slots-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Domain</th>
                    <th>Capacity</th>
                    <th>Booked</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot.id}>
                      <td>{slot.date}</td>
                      <td>{formatTime12(slot.start_time)} - {formatTime12(slot.end_time)}</td>
                      <td>{slot.domain}</td>
                      <td>{slot.capacity}</td>
                      <td>{slot.booked}</td>
                      <td>
                        <button
                          onClick={() => closeSlot(slot.id)}
                          className="btn-small btn-call-token"
                          disabled={slot.status !== "active"}
                        >
                          {slot.status === "active" ? "Close" : "Closed"}
                        </button>
                        <button onClick={() => deleteSlot(slot.id)} className="btn-small btn-noshow">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">No slots available</p>
            )}
          </div>
        </div>
      </div>

      {isSuper && (
        <div className="section">
          <h2>Admin Requests</h2>
          {requests.length > 0 ? (
            <div className="queue-section">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Domain</th>
                    <th>Scope</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.email}</td>
                      <td>{item.domain}</td>
                      <td>
                        {item.scope_label || item.scopeLabel || item.organization_name || item.organizationName || "-"}
                        {(item.branch_city || item.branchCity) ? `, ${item.branch_city || item.branchCity}` : ""}
                      </td>
                      <td>{item.status || "pending"}</td>
                      <td>
                        {(item.status || "pending") === "pending" ? (
                          <>
                            <button onClick={() => approveRequest(item)} className="btn-small btn-served">Approve</button>
                            <button onClick={() => rejectRequest(item)} className="btn-small btn-noshow">Reject</button>
                          </>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No admin requests</p>
          )}
        </div>
      )}

      {/* Analytics */}
      <div className="section analytics-section">
        <div className="section-title-row">
          <div>
            <h2>Analytics</h2>
            <p className="section-subtitle">Tokens served over the last 7 days</p>
          </div>
        </div>
        <div className="chart-shell">
          <AnalyticsChart />
        </div>
      </div>

      <div className="admin-bottom-actions">
        <button onClick={() => navigate("/")} className="btn-secondary">Back to User Page</button>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>
    </div>
  );
}
