import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  collection, query, orderBy, onSnapshot, doc, getDoc, getDocs,
  where, updateDoc, setDoc, deleteDoc, runTransaction,
  serverTimestamp, writeBatch,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db, SUPER_ADMIN_EMAILS } from "../firebase/config";
import { useAuth, checkAdminAccess, fetchAdminProfile, isSuperAdmin } from "../hooks/useAuth";
import { showToast } from "../toast";
import AnalyticsChart from "../AnalyticsChart";
import { DOMAIN_LOCATIONS, LOCATION_DOMAINS, formatTime12, normalizeDomain, slugify, getTodayStr } from "../constants";

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
  if (domain === "government" || domain === "hospital") return String(data?.organizationName || "").trim();
  if (domain === "bank") return String(data?.branchCity || data?.organizationName || "").trim();
  return "";
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

// ─── component ──────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();

  // Auth state
  const [adminReady, setAdminReady] = useState(false);
  const [adminDomain, setAdminDomain] = useState("");
  const [adminScopeKey, setAdminScopeKey] = useState("");
  const [adminScopeLabel, setAdminScopeLabel] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const isSuper = SUPER_ADMIN_EMAILS.map(x => x.toLowerCase()).includes(adminEmail.toLowerCase());

  // Queue state
  const [waiting, setWaiting] = useState([]);
  const [served, setServed] = useState([]);
  const [requests, setRequests] = useState([]);
  const [slotFilter, setSlotFilter] = useState("");
  const [statWaiting, setStatWaiting] = useState(0);
  const [statDoneToday, setStatDoneToday] = useState(0);
  const [statLastToken, setStatLastToken] = useState("Q000");
  const [currentServing, setCurrentServing] = useState("Q000");

  // Slots state
  const [slots, setSlots] = useState([]);
  const [slotAdminDate, setSlotAdminDate] = useState(getTodayKey());
  const [slotCapacity, setSlotCapacity] = useState("");
  const [slotDomain, setSlotDomain] = useState("general");
  const [slotLocation, setSlotLocation] = useState("");
  const [startHour, setStartHour] = useState("09");
  const [startMinute, setStartMinute] = useState("00");
  const [startAmPm, setStartAmPm] = useState("AM");
  const [endHour, setEndHour] = useState("09");
  const [endMinute, setEndMinute] = useState("30");
  const [endAmPm, setEndAmPm] = useState("AM");

  const firstTokenIdRef = useRef("");
  const firstTokenNumberRef = useRef(null);

  const duration = (() => {
    const s = toMinutes12(startHour, startMinute, startAmPm);
    const e = toMinutes12(endHour, endMinute, endAmPm);
    return s !== null && e !== null && e > s ? e - s : null;
  })();

  // ── scope filtering ──────────────────────────────────────────────────────
  function isInScope(item) {
    const rowDomain = normalizeDomain(item?.domain || "");
    const rowScope = String(item?.domainLocation || item?.scopeKey || slugify(item?.domainLocationLabel || "") || "").toLowerCase();
    const rowSlotId = String(item?.slotId || "");
    if (adminDomain && rowDomain !== adminDomain) return false;
    if (adminScopeKey && rowScope !== adminScopeKey) return false;
    if (slotFilter && rowSlotId && rowSlotId !== slotFilter) return false;
    return true;
  }

  // ── auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/admin-login"); return; }

    (async () => {
      const allowed = await checkAdminAccess(user);
      if (!allowed) { await signOut(auth); navigate("/admin-login"); return; }

      setAdminEmail(user.email.toLowerCase());
      if (isSuperAdmin(user)) {
        setAdminDomain(""); setAdminScopeKey(""); setAdminScopeLabel("");
        await runDailyArchiveAndReset();
      } else {
        const profile = await fetchAdminProfile(user.email);
        setAdminDomain(profile.domain);
        setAdminScopeKey(profile.scopeKey);
        setAdminScopeLabel(profile.scopeLabel);
        if (profile.domain) setSlotDomain(profile.domain);
        if (profile.scopeKey) setSlotLocation(profile.scopeKey);
      }
      setAdminReady(true);
    })();
  }, [user, authLoading]);

  // ── daily archive ────────────────────────────────────────────────────────
  async function runDailyArchiveAndReset() {
    const todayKey = getTodayKey();
    const sysRef = doc(db, "meta", "system");
    const sysSnap = await getDoc(sysRef);
    if (sysSnap.exists() && sysSnap.data()?.lastResetDate === todayKey) return;

    const qSnap = await getDocs(collection(db, "queue"));
    const oldDocs = qSnap.docs.filter((d) => {
      const data = d.data();
      if (data.status === "archived") return false;
      const slotDate = String(data.slotDate || "");
      if (slotDate) return slotDate < todayKey;
      const created = timestampToDateKey(data.createdAt);
      return created ? created < todayKey : false;
    });

    while (oldDocs.length) {
      const batch = writeBatch(db);
      oldDocs.splice(0, 350).forEach((d) => batch.update(d.ref, { status: "archived", archivedAt: serverTimestamp(), archivedReason: "daily-reset" }));
      await batch.commit();
    }
    await setDoc(sysRef, { lastResetDate: todayKey, updatedAt: serverTimestamp() }, { merge: true });
  }

  // ── listeners ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!adminReady) return;
    const q = query(collection(db, "queue"), orderBy("tokenNumber", "asc"));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const scoped = rows.filter(isInScope);
      const w = scoped.filter((x) => x.status === "waiting");
      const s = scoped.filter((x) => x.status === "served");

      const sorted = [...w].sort((a, b) => {
        const an = normalizeTokenNumber(a), bn = normalizeTokenNumber(b);
        if (an === null && bn === null) return 0;
        if (an === null) return 1; if (bn === null) return -1;
        return an - bn;
      });
      if (sorted.length) {
        firstTokenIdRef.current = sorted[0].tokenId;
        firstTokenNumberRef.current = normalizeTokenNumber(sorted[0]);
      } else {
        firstTokenIdRef.current = "";
        firstTokenNumberRef.current = null;
      }
      setWaiting(sorted);
      setServed(s.slice(-20).reverse());

      // stats
      setStatWaiting(w.length);
      const now = new Date();
      const todayDone = s.filter((x) => {
        if (!x.servedAt) return false;
        const d = typeof x.servedAt?.toDate === "function" ? x.servedAt.toDate() : new Date(x.servedAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      });
      setStatDoneToday(todayDone.length);
    });
  }, [adminReady, adminDomain, adminScopeKey, slotFilter]);

  useEffect(() => {
    if (!adminReady) return;
    return onSnapshot(doc(db, "meta", "queue"), (snap) => {
      setCurrentServing(snap.exists() ? snap.data()?.currentToken || "Q000" : "Q000");
    });
  }, [adminReady]);

  useEffect(() => {
    if (!adminReady) return;
    return onSnapshot(doc(db, "counters", "tokenCounter"), (snap) => {
      const val = snap.exists() ? Number(snap.data()?.value) : 1;
      const last = Math.max((Number.isFinite(val) && val > 0 ? Math.floor(val) : 1) - 1, 0);
      setStatLastToken("Q" + String(last).padStart(3, "0"));
    });
  }, [adminReady]);

  useEffect(() => {
    if (!adminReady) return;
    let q = query(collection(db, "slots"));
    if (adminDomain) q = query(collection(db, "slots"), where("domain", "==", adminDomain));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isInScope);
      all.sort((a, b) => {
        const dc = String(a.date || "").localeCompare(String(b.date || ""));
        return dc !== 0 ? dc : String(a.startTime || "").localeCompare(String(b.startTime || ""));
      });
      setSlots(all.filter((s) => {
        const status = String(s.status || "").toLowerCase();
        if (s.hiddenFromAdmin) return false;
        if (status === "archived" || status === "deleted") return false;
        if (status !== "active" && Number(s.booked || 0) > 0) return false;
        return true;
      }));
    });
  }, [adminReady, adminDomain, adminScopeKey]);

  useEffect(() => {
    if (!adminReady || !isSuperAdmin(user)) return;
    const q = query(collection(db, "admin_requests"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [adminReady]);

  // ── slot auto-close ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!adminReady) return;
    const interval = setInterval(async () => {
      const today = getTodayKey();
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      try {
        let q = query(collection(db, "slots"), where("status", "==", "active"));
        if (adminDomain) q = query(q, where("domain", "==", adminDomain));
        const snap = await getDocs(q);
        const updates = snap.docs
          .filter((d) => isInScope(d.data()) && d.data().date === today)
          .filter((d) => { const e = parseTimeToMinutes(d.data().endTime); return e !== null && nowMins >= e; })
          .map((d) => updateDoc(d.ref, { status: "closed" }));
        await Promise.all(updates);
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [adminReady]);

  // ── queue actions ─────────────────────────────────────────────────────────
  async function callToken(item) {
    if (String(item.tokenId) !== firstTokenIdRef.current) {
      showToast.warning(t("admin.pleaseCallEarliest")); return;
    }
    await setDoc(doc(db, "meta", "queue"), {
      currentToken: item.tokenId, currentName: item.name,
      currentSlotLabel: item.slotLabel || "", currentSlotDate: item.slotDate || "",
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async function markDone(item) {
    if (String(item.tokenId) !== firstTokenIdRef.current) {
      showToast.warning(t("admin.pleaseFinishEarliest")); return;
    }
    await updateDoc(doc(db, "queue", item.id), { status: "served", servedAt: serverTimestamp() });
    await setDoc(doc(db, "meta", "queue"), {
      currentToken: item.tokenId, currentName: item.name,
      currentSlotLabel: item.slotLabel || "", currentSlotDate: item.slotDate || "",
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async function nextToken() {
    if (!waiting.length) { showToast.info(t("admin.noWaitingToken")); return; }
    await markDone(waiting[0]);
  }

  async function clearQueue() {
    const snap = await getDocs(query(collection(db, "queue"), where("status", "==", "waiting")));
    const docs = snap.docs;
    while (docs.length) {
      const batch = writeBatch(db);
      docs.splice(0, 350).forEach((d) => batch.update(d.ref, { status: "cleared", clearedAt: serverTimestamp() }));
      await batch.commit();
    }
    showToast.success(t("admin.queueCleared"));
  }

  async function clearDone() {
    const snap = await getDocs(query(collection(db, "queue"), where("status", "==", "served")));
    const docs = snap.docs;
    while (docs.length) {
      const batch = writeBatch(db);
      docs.splice(0, 350).forEach((d) => batch.update(d.ref, { status: "archived", archivedAt: serverTimestamp() }));
      await batch.commit();
    }
    showToast.success("Done tokens cleared");
  }

  async function resetDay() {
    if (!window.confirm("Reset waiting queue and restart token from Q001?")) return;
    await clearQueue();
    await setDoc(doc(db, "counters", "tokenCounter"), { value: 1 }, { merge: true });
    await setDoc(doc(db, "meta", "queue"), { currentToken: "Q000", currentName: "", currentSlotLabel: "", currentSlotDate: "", updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, "meta", "system"), { lastResetDate: getTodayKey(), updatedAt: serverTimestamp() }, { merge: true });
    showToast.success("Reset complete. Next token will be Q001.");
  }

  // ── slot actions ──────────────────────────────────────────────────────────
  async function createSlots() {
    if (!slotAdminDate || !slotCapacity) { showToast.error("Please fill all slot fields."); return; }
    if (LOCATION_DOMAINS.includes(slotDomain) && !slotLocation) { showToast.error("Please select office / branch / hospital."); return; }

    const startMin = toMinutes12(startHour, startMinute, startAmPm);
    const endMin = toMinutes12(endHour, endMinute, endAmPm);
    if (startMin === null || endMin === null || endMin <= startMin) { showToast.error("Invalid time range."); return; }

    const dur = endMin - startMin;
    const locationOptions = DOMAIN_LOCATIONS[slotDomain] || [];
    const locationLabel = locationOptions.find((l) => slugify(l) === slotLocation) || "";

    const batch = writeBatch(db);
    let created = 0;
    for (let t = startMin; t + dur <= endMin; t += dur) {
      const sStart = minutesToTime(t);
      const sEnd = minutesToTime(t + dur);
      const slotId = `${slotAdminDate}_${sStart}_${slotDomain}_${slotLocation || "all"}`.replace(/:/g, "-");
      batch.set(doc(db, "slots", slotId), {
        date: slotAdminDate, startTime: sStart, endTime: sEnd, duration: dur,
        capacity: Number(slotCapacity), booked: 0, domain: slotDomain,
        domainLocation: slotLocation, domainLocationLabel: locationLabel,
        status: "active", createdAt: serverTimestamp(),
      }, { merge: true });
      created++;
    }
    if (!created) { showToast.error("No slots created."); return; }
    await batch.commit();
    showToast.success(`Created ${created} slot(s).`);
  }

  async function closeSlot(slotId) {
    await updateDoc(doc(db, "slots", slotId), { status: "closed" });
  }

  async function deleteSlot(slot) {
    if (!window.confirm("Delete this slot?")) return;
    const linked = await getDocs(query(collection(db, "queue"), where("slotId", "==", slot.id)));
    if (!linked.empty || Number(slot.booked || 0) > 0) {
      await setDoc(doc(db, "slots", slot.id), { status: "archived", hiddenFromAdmin: true, archivedAt: serverTimestamp() }, { merge: true });
      showToast.info("Booked expired slot removed from admin panel.");
      return;
    }
    await deleteDoc(doc(db, "slots", slot.id));
  }

  // ── request actions ───────────────────────────────────────────────────────
  async function approveRequest(item) {
    const emailKey = String(item.email || "").toLowerCase();
    if (!emailKey) { showToast.error("Missing email."); return; }
    const scopeLabel = getScopeLabelFromData(item);
    const scopeKey = slugify(scopeLabel);
    await updateDoc(doc(db, "admin_requests", item.id), { status: "approved", approvedBy: adminEmail, approvedAt: serverTimestamp(), scopeLabel, scopeKey });
    await setDoc(doc(db, "admins", emailKey), { email: emailKey, name: item.name || "", domain: item.domain || "", organizationName: item.organizationName || "", branchCity: item.branchCity || "", address: item.address || "", scopeLabel, scopeKey, approvedBy: adminEmail, approvedAt: serverTimestamp() }, { merge: true });
    showToast.success("Request approved");
  }

  async function rejectRequest(item) {
    await updateDoc(doc(db, "admin_requests", item.id), { status: "rejected", rejectedBy: adminEmail, rejectedAt: serverTimestamp() });
    showToast.success("Request rejected");
  }

  const slotLocationOptions = DOMAIN_LOCATIONS[slotDomain] || [];
  const showSlotLocation = LOCATION_DOMAINS.includes(slotDomain);
  const activeSlots = slots.filter((s) => s.status === "active");

  const domainLabel = adminDomain
    ? `${adminDomain.charAt(0).toUpperCase() + adminDomain.slice(1)}${adminScopeLabel ? " - " + adminScopeLabel : " Domain"}`
    : "All Domains";

  if (authLoading || !adminReady) {
    return <div className="app"><p>Loading...</p></div>;
  }

  return (
    <div className="app admin-app">
      <h1>{t("admin.title")}</h1>
      <p className="subtitle">{t("admin.subtitle")}</p>
      <p className="subtitle"><strong>{t("admin.scope")}</strong> {domainLabel}</p>

      <div className="stats-grid">
        <div className="stat-card"><p className="stat-label">{t("admin.waiting")}</p><h3>{statWaiting}</h3></div>
        <div className="stat-card"><p className="stat-label">{t("admin.doneToday")}</p><h3>{statDoneToday}</h3></div>
        <div className="stat-card"><p className="stat-label">{t("admin.lastToken")}</p><h3>{statLastToken}</h3></div>
      </div>

      <div className="meta-row">
        <strong>{t("admin.nowServing")}:</strong> <span>{currentServing}</span>
      </div>

      <div className="panel-box analytics-panel">
        <h3>{t("admin.analytics")}</h3>
        <div className="analytics-canvas-wrap">
          <AnalyticsChart domain={adminDomain} scopeKey={adminScopeKey} />
        </div>
        <p className="slot-hint">{t("admin.analyticsCounts")}</p>
      </div>

      <div className="actions">
        <button className="btn-success" onClick={nextToken}>{t("admin.markNextDone")}</button>
        <button className="btn-danger" onClick={clearQueue}>{t("admin.clearWaiting")}</button>
        <button className="btn-danger" onClick={clearDone}>{t("admin.clearDone")}</button>
        {isSuper && <button className="btn-neutral" onClick={resetDay}>{t("admin.resetDay")}</button>}
      </div>

      {/* Slot Creator */}
      <div className="panel-box slot-admin">
        <h3>{t("admin.createTimeSlots")}</h3>
        <div className="slot-admin-grid">
          <input type="date" value={slotAdminDate} onChange={(e) => setSlotAdminDate(e.target.value)} />

          <div className="time-picker">
            <label>{t("admin.startTime")}</label>
            <div className="time-row">
              <select value={startHour} onChange={(e) => setStartHour(e.target.value)}>
                {HOURS.map((h) => <option key={h}>{h}</option>)}
              </select>
              <select value={startMinute} onChange={(e) => setStartMinute(e.target.value)}>
                {MINUTES.map((m) => <option key={m}>{m}</option>)}
              </select>
              <select value={startAmPm} onChange={(e) => setStartAmPm(e.target.value)}>
                <option>AM</option><option>PM</option>
              </select>
            </div>
          </div>

          <div className="time-picker">
            <label>{t("admin.endTime")}</label>
            <div className="time-row">
              <select value={endHour} onChange={(e) => setEndHour(e.target.value)}>
                {HOURS.map((h) => <option key={h}>{h}</option>)}
              </select>
              <select value={endMinute} onChange={(e) => setEndMinute(e.target.value)}>
                {MINUTES.map((m) => <option key={m}>{m}</option>)}
              </select>
              <select value={endAmPm} onChange={(e) => setEndAmPm(e.target.value)}>
                <option>AM</option><option>PM</option>
              </select>
            </div>
          </div>

          <input type="text" placeholder="Duration (min)" value={duration !== null ? String(duration) : ""} readOnly />
          <input type="number" placeholder="Capacity per slot" value={slotCapacity} onChange={(e) => setSlotCapacity(e.target.value)} />

          <select
            value={slotDomain}
            onChange={(e) => { setSlotDomain(e.target.value); setSlotLocation(""); }}
            disabled={!isSuper && Boolean(adminDomain)}
          >
            <option value="general">General</option>
            <option value="bank">Bank</option>
            <option value="hospital">Hospital</option>
            <option value="government">Government Office</option>
            <option value="personal">Personal Organization</option>
          </select>

          {showSlotLocation && (
            <select
              value={slotLocation}
              onChange={(e) => setSlotLocation(e.target.value)}
              disabled={!isSuper && Boolean(adminScopeKey)}
            >
              <option value="">Select Office / Branch / Hospital</option>
              {slotLocationOptions.map((l) => (
                <option key={l} value={slugify(l)}>{l}</option>
              ))}
            </select>
          )}

          <button className="btn-success" onClick={createSlots}>Create Slots</button>
        </div>
        <p className="slot-hint">Select start/end time. Duration auto-calculates.</p>
      </div>

      {/* Slot List */}
      <div className="panel-box slot-list">
        <h3>Available Slots</h3>
        <ul>
          {slots.length === 0
            ? <li>No slots created yet</li>
            : slots.map((slot) => (
              <li key={slot.id} className="slot-item">
                <div>
                  {slot.date} {formatTime12(slot.startTime)}-{formatTime12(slot.endTime)} | {slot.domain}
                  {slot.domainLocationLabel ? ` | ${slot.domainLocationLabel}` : ""} | {slot.booked}/{slot.capacity}
                </div>
                <div className="queue-actions">
                  <button className="btn-mini btn-neutral" onClick={() => closeSlot(slot.id)} disabled={slot.status !== "active"}>
                    {slot.status === "active" ? "Close" : "Closed"}
                  </button>
                  <button className="btn-mini btn-danger" onClick={() => deleteSlot(slot)}>Delete</button>
                </div>
              </li>
            ))
          }
        </ul>
      </div>

      {/* Slot filter */}
      <div className="slot-filter token-filter standalone-filter admin-filter-block">
        <label>View Tokens For Slot</label>
        <select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value)}>
          <option value="">All Slots</option>
          {activeSlots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.date} {formatTime12(s.startTime)}-{formatTime12(s.endTime)}
            </option>
          ))}
        </select>
      </div>

      {/* Token panels */}
      <div className="panel-grid admin-token-panels">
        <div className="panel-box token-panel waiting-panel">
          <h3>Waiting Tokens</h3>
          <ul>
            {waiting.length === 0
              ? <li>No waiting tokens</li>
              : waiting.map((item, i) => {
                const isFirst = i === 0;
                return (
                  <li key={item.id} className="queue-item">
                    <span>{item.tokenId} | {item.name}</span>
                    <div className="queue-actions">
                      <button className="btn-mini btn-call" disabled={!isFirst} onClick={() => callToken(item)}>Call</button>
                      <button className="btn-mini" disabled={!isFirst} onClick={() => markDone(item)}>Mark Done</button>
                    </div>
                  </li>
                );
              })
            }
          </ul>
        </div>

        <div className="panel-box token-panel done-panel">
          <h3>Done Tokens</h3>
          <ul>
            {served.length === 0
              ? <li>No done tokens yet</li>
              : served.map((item) => <li key={item.id}>{item.tokenId} | {item.name}</li>)
            }
          </ul>
        </div>
      </div>

      {/* Admin requests (super admin only) */}
      {isSuper && (
        <div className="panel-box request-panel">
          <h3>Admin Requests</h3>
          <p className="subtitle request-subtitle">Only super admin can approve requests</p>
          <ul>
            {requests.length === 0
              ? <li>No admin requests</li>
              : requests.map((item) => (
                <li key={item.id} className="request-item">
                  <div className="request-title">{item.name} ({item.email})</div>
                  <div className="request-meta">
                    {String(item.domain || "UNKNOWN").toUpperCase()} • {item.organizationName || ""}
                    {item.branchCity ? `, ${item.branchCity}` : ""}{item.address ? `, ${item.address}` : ""}
                  </div>
                  <div className="request-status">Status: {item.status || "pending"}</div>
                  {item.status === "pending" && (
                    <div className="request-actions">
                      <button className="btn-mini btn-approve" onClick={() => approveRequest(item)}>Approve</button>
                      <button className="btn-mini btn-reject" onClick={() => rejectRequest(item)}>Reject</button>
                    </div>
                  )}
                </li>
              ))
            }
          </ul>
        </div>
      )}

      <div className="actions">
        <button className="btn-neutral" onClick={() => navigate("/")}>Back to User Page</button>
        <button className="btn-neutral" onClick={() => signOut(auth).then(() => navigate("/admin-login"))}>Logout</button>
      </div>
    </div>
  );
}
