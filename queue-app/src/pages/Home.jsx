import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  collection, query, where, orderBy, onSnapshot,
  runTransaction, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { showToast } from "../toast";
import {
  SERVICE_OPTIONS, DOMAIN_LOCATIONS, LOCATION_DOMAINS,
  formatTime12, formatFullName, getTodayStr, slugify,
} from "../constants";

export default function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("general");
  const [serviceType, setServiceType] = useState("");
  const [domainLocation, setDomainLocation] = useState("");
  const [otherService, setOtherService] = useState("");
  const [slotDate, setSlotDate] = useState(getTodayStr());
  const [slotId, setSlotId] = useState("");
  const [slots, setSlots] = useState([]);
  const [slotHint, setSlotHint] = useState(t("form.selectDateToLoadSlots"));
  const [queueItems, setQueueItems] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const services = SERVICE_OPTIONS[domain] || SERVICE_OPTIONS.general;
  const locations = DOMAIN_LOCATIONS[domain] || [];
  const showLocation = LOCATION_DOMAINS.includes(domain);
  const showOther = serviceType === "other-services";

  // Load slots
  useEffect(() => {
    if (!slotDate) { setSlots([]); setSlotHint(t("form.selectDateToLoadSlots")); return; }
    const today = getTodayStr();
    if (slotDate < today) { setSlotHint(t("form.selectTodayOrFuture")); setSlots([]); return; }

    const q = query(
      collection(db, "slots"),
      where("date", "==", slotDate),
      where("domain", "==", domain),
      where("status", "==", "active")
    );

    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const filtered = all
        .filter((s) => LOCATION_DOMAINS.includes(domain) ? String(s.domainLocation || "") === domainLocation : true)
        .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));
      setSlots(filtered);
      setSlotHint(filtered.length ? "Select a slot to generate token." : "No slots available for selected date.");
    });
    return unsub;
  }, [slotDate, domain, domainLocation]);

  // Listen to queue for user's position
  useEffect(() => {
    const last = JSON.parse(localStorage.getItem("lastIssuedToken") || "null");
    if (!last?.id) return;

    const q = query(collection(db, "queue"), orderBy("tokenNumber", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const waiting = snap.docs.map((d) => d.data()).filter((x) => x.status === "waiting");
      const idx = waiting.findIndex((x) => x.tokenId === last.id);
      if (idx === -1) { setQueueItems([]); return; }
      setQueueItems(waiting.slice(0, idx).map((x) => x.tokenId));
    });
    return unsub;
  }, []);

  // Reset service/location when domain changes
  useEffect(() => {
    setServiceType("");
    setDomainLocation("");
    setSlotId("");
    setErrors({});
  }, [domain]);

  function clearError(field) {
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  async function handleSubmit() {
    const errs = {};
    const formattedName = formatFullName(name);
    if (!formattedName) errs.name = t("errors.nameMandatory");
    if (!serviceType) errs.serviceType = t("errors.serviceMandatory");
    if (showLocation && !domainLocation) errs.domainLocation = t("errors.locationMandatory");
    if (showOther && !otherService.trim()) errs.otherService = t("errors.otherServiceMandatory");
    if (!slotId || !slotDate) errs.slot = t("errors.slotMandatory");

    if (Object.keys(errs).length) { setErrors(errs); return; }

    const blockKey = `${formattedName.toLowerCase()}|${domain}`;
    if (localStorage.getItem("nameDomainBlock") === blockKey) {
      setErrors({ name: t("errors.nameExists") });
      return;
    }

    setLoading(true);
    try {
      const existing = await import("firebase/firestore").then(({ getDocs, query: q2, collection: col, where: w }) =>
        getDocs(q2(col(db, "queue"), w("status", "==", "waiting"), w("name", "==", formattedName), w("domain", "==", domain)))
      );
      if (!existing.empty) {
        setErrors({ name: t("errors.nameExists") });
        setLoading(false);
        return;
      }

      const selectedSlot = slots.find((s) => s.id === slotId);
      const slotLabel = selectedSlot ? `${formatTime12(selectedSlot.startTime)} - ${formatTime12(selectedSlot.endTime)}` : "";
      const locationEl = locations.find((l) => slugify(l) === domainLocation);
      const domainLocationLabel = locationEl || "";

      const slotRef = doc(db, "slots", slotId);
      const counterRef = doc(db, "counters", "tokenCounter");
      const queueRef = doc(collection(db, "queue"));

      const result = await runTransaction(db, async (tx) => {
        const slotSnap = await tx.get(slotRef);
        if (!slotSnap.exists()) throw new Error("Slot not found");
        const slotData = slotSnap.data();
        if (slotData.status !== "active") throw new Error("Slot not active");
        const capacity = Number(slotData.capacity || 0);
        const booked = Number(slotData.booked || 0);
        if (booked >= capacity) throw new Error("Slot full");

        const counterSnap = await tx.get(counterRef);
        let current = 1;
        if (counterSnap.exists()) {
          const val = Number(counterSnap.data().value);
          current = Number.isFinite(val) && val > 0 ? Math.floor(val) : 1;
        }

        tx.set(counterRef, { value: current + 1 }, { merge: true });
        tx.set(slotRef, { booked: booked + 1 }, { merge: true });

        const tokenId = "Q" + String(current).padStart(3, "0");
        tx.set(queueRef, {
          tokenId, tokenNumber: current,
          name: formattedName, domain, slotId, slotDate, slotLabel,
          serviceType, serviceDetail: otherService.trim(),
          domainLocation, domainLocationLabel,
          status: "waiting",
          createdAt: serverTimestamp(),
        });
        return { tokenId };
      });

      localStorage.setItem("lastIssuedToken", JSON.stringify({
        id: result.tokenId, name: formattedName, domain, slotId, slotDate, slotLabel,
        serviceType, serviceDetail: otherService.trim(), domainLocation, domainLocationLabel,
      }));
      localStorage.setItem("nameDomainBlock", blockKey);
      showToast.success(t("form.tokenGenerated", { token: result.tokenId }));
    } catch (e) {
      if (e?.message === "Slot full") setErrors({ slot: t("form.slotFull") });
      else setErrors({ slot: t("form.failedToGenerate") });
    } finally {
      setLoading(false);
    }
  }

  const last = JSON.parse(localStorage.getItem("lastIssuedToken") || "null");

  return (
    <div className="app">
      <div className="title-row">
        <h1>{t("app.title")}</h1>
        <button className="admin-btn title-admin-btn" onClick={() => navigate("/admin-login")}>
          {t("nav.adminLogin")}
        </button>
      </div>
      <p className="subtitle" style={{ marginTop: 8 }}>{t("app.subtitle")}</p>

      <div className="card">
        <input
          type="text" placeholder={t("form.name")}
          value={name} onChange={(e) => { setName(e.target.value); clearError("name"); }}
          className={errors.name ? "input-error" : ""}
        />
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="general">General</option>
          <option value="bank">Bank</option>
          <option value="hospital">Hospital</option>
          <option value="government">Government Office</option>
          <option value="personal">Personal Organization</option>
        </select>
        <select
          value={serviceType}
          onChange={(e) => { setServiceType(e.target.value); clearError("serviceType"); }}
          className={errors.serviceType ? "input-error" : ""}
        >
          <option value="">{t("form.selectService")}</option>
          {services.map((s) => (
            <option key={s} value={slugify(s)}>{s}</option>
          ))}
        </select>
        {errors.name && <p className="field-error">{errors.name}</p>}
        {errors.serviceType && <p className="field-error">{errors.serviceType}</p>}

        {showLocation && (
          <>
            <select
              value={domainLocation} className={`full-row${errors.domainLocation ? " input-error" : ""}`}
              onChange={(e) => { setDomainLocation(e.target.value); clearError("domainLocation"); }}
            >
              <option value="">Select Office / Branch / Hospital</option>
              {locations.map((l) => (
                <option key={l} value={slugify(l)}>{l}</option>
              ))}
            </select>
            {errors.domainLocation && <p className="field-error full-row">{errors.domainLocation}</p>}
          </>
        )}

        {showOther && (
          <>
            <textarea
              className="full-row" rows={2} placeholder="Please specify the service (1 line)"
              value={otherService} onChange={(e) => { setOtherService(e.target.value); clearError("otherService"); }}
            />
            {errors.otherService && <p className="field-error full-row">{errors.otherService}</p>}
          </>
        )}
      </div>

      <div className="slot-panel">
        <h3>{t("form.chooseTimeSlot")}</h3>
        <div className="slot-row">
          <input type="date" value={slotDate} onChange={(e) => { setSlotDate(e.target.value); clearError("slot"); }} />
          <select
            value={slotId}
            onChange={(e) => { setSlotId(e.target.value); clearError("slot"); }}
            className={errors.slot ? "input-error" : ""}
          >
            <option value="">{t("form.selectSlot")}</option>
            {slots.map((s) => {
              const cap = Number(s.capacity || 0);
              const booked = Number(s.booked || 0);
              const remaining = Math.max(cap - booked, 0);
              const label = `${formatTime12(s.startTime)} - ${formatTime12(s.endTime)}`;
              return (
                <option key={s.id} value={s.id} disabled={remaining <= 0}>
                  {label} ({t("time.left")}: {remaining})
                </option>
              );
            })}
          </select>
        </div>
        <p className="slot-hint">{slotHint}</p>
        {errors.slot && <p className="field-error">{errors.slot}</p>}
      </div>

      <div className="generate-section">
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? t("form.generating") : t("form.generateToken")}
        </button>
      </div>

      {last?.id && (
        <div className="queue-panel">
          <h3>{t("form.waitingTokensAhead")}</h3>
          <ul className="queue-list">
            {queueItems.length === 0
              ? <li>{t("form.noTokensAhead")}</li>
              : queueItems.map((t) => <li key={t}>{t}</li>)
            }
          </ul>
        </div>
      )}
    </div>
  );
}
