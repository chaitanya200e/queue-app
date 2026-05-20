import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabase/config";
import { showToast } from "../toast";
import {
  SERVICE_OPTIONS, DOMAIN_LOCATIONS, LOCATION_DOMAINS,
  formatTime12, formatFullName, getTodayStr, slugify,
} from "../constants";

function slotCounterId(slotId) {
  return `slot:${slotId}`;
}

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
  const [approvedLocations, setApprovedLocations] = useState({});
  const [slotHint, setSlotHint] = useState(t("form.selectDateToLoadSlots"));
  const [queueItems, setQueueItems] = useState([]);
  const [issuedToken, setIssuedToken] = useState(() => JSON.parse(localStorage.getItem("lastIssuedToken") || "null"));
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const notifiedTokenRef = useRef("");

  const services = SERVICE_OPTIONS[domain] || SERVICE_OPTIONS.general;
  const locations = approvedLocations[domain] || DOMAIN_LOCATIONS[domain] || [];
  const showLocation = LOCATION_DOMAINS.includes(domain);
  const showOther = serviceType === "other-services";

  useEffect(() => {
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
  }, []);

  // Load slots
  useEffect(() => {
    if (!slotDate) { setSlots([]); setSlotHint(t("form.selectDateToLoadSlots")); return; }
    const today = getTodayStr();
    if (slotDate < today) { setSlotHint(t("form.selectTodayOrFuture")); setSlots([]); return; }

    async function fetchSlots() {
      try {
        const { data, error } = await supabase
          .from("slots")
          .select("*")
          .eq("date", slotDate)
          .eq("domain", domain)
          .eq("status", "active");
        
        if (error) throw error;

        const filtered = (data || [])
          .filter((s) => LOCATION_DOMAINS.includes(domain) ? String(s.domain_location || "") === domainLocation : true)
          .sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
        
        setSlots(filtered);
        setSlotHint(filtered.length ? "Select a slot to generate token." : "No slots available for selected date.");
      } catch (error) {
        console.error("Error fetching slots:", error);
      }
    }

    fetchSlots();
  }, [slotDate, domain, domainLocation, t]);

  // Listen to queue for user's position
  useEffect(() => {
    if (!issuedToken?.id) return;

    async function fetchQueuePosition() {
      try {
        const { data, error } = await supabase
          .from("queue")
          .select("*")
          .eq("status", "waiting")
          .eq("slot_id", issuedToken.slotId)
          .order("token_number", { ascending: true });
        
        if (error) throw error;

        const idx = (data || []).findIndex((x) => x.token_id === issuedToken.id);
        if (idx === -1) { setQueueItems([]); return; }
        setQueueItems((data || []).slice(0, idx).map((x) => x.token_id));
      } catch (error) {
        console.error("Error fetching queue:", error);
      }
    }

    fetchQueuePosition();
    const interval = setInterval(fetchQueuePosition, 5000);
    return () => clearInterval(interval);
  }, [issuedToken]);

  useEffect(() => {
    if (!issuedToken?.id) return;

    async function fetchCurrentServing() {
      try {
        const { data, error } = await supabase
          .from("meta")
          .select("current_token")
          .eq("id", "queue")
          .single();

        if (error) throw error;
        if (data?.current_token !== issuedToken.id) return;
        if (notifiedTokenRef.current === issuedToken.id) return;

        notifiedTokenRef.current = issuedToken.id;
        showToast.info(`Token ${issuedToken.id} is being called`);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Your token is being called", {
            body: `${issuedToken.id} - please proceed to the counter.`,
          });
        }
      } catch (error) {
        console.error("Error checking current token:", error);
      }
    }

    fetchCurrentServing();
    const interval = setInterval(fetchCurrentServing, 5000);
    return () => clearInterval(interval);
  }, [issuedToken]);

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
      // Check if person already has a waiting token
      const { data: existing, error: checkError } = await supabase
        .from("queue")
        .select("*")
        .eq("status", "waiting")
        .eq("name", formattedName)
        .eq("domain", domain)
        .eq("slot_id", slotId);

      if (checkError) throw checkError;
      
      if (existing && existing.length > 0) {
        setErrors({ name: t("errors.nameExists") });
        setLoading(false);
        return;
      }

      const selectedSlot = slots.find((s) => s.id === slotId);
      const slotLabel = selectedSlot ? `${formatTime12(selectedSlot.start_time)} - ${formatTime12(selectedSlot.end_time)}` : "";
      const locationEl = locations.find((l) => slugify(l) === domainLocation);
      const domainLocationLabel = locationEl || "";

      const counterId = slotCounterId(slotId);
      const { data: counterData } = await supabase
        .from("counters")
        .select("value")
        .eq("id", counterId)
        .maybeSingle();
      
      let current = 1;
      if (counterData?.value) {
        const val = Number(counterData.value);
        current = Number.isFinite(val) && val > 0 ? Math.floor(val) : 1;
      }

      const tokenId = "Q" + String(current).padStart(3, "0");

      // Get slot to check capacity
      const { data: slotData } = await supabase
        .from("slots")
        .select("*")
        .eq("id", slotId)
        .single();
      
      if (!slotData) throw new Error("Slot not found");
      if (slotData.status !== "active") throw new Error("Slot not active");
      
      const capacity = Number(slotData.capacity || 0);
      const booked = Number(slotData.booked || 0);
      if (booked >= capacity) throw new Error("Slot full");

      // Insert queue entry
      const { error: queueError } = await supabase
        .from("queue")
        .insert([{
          id: crypto.randomUUID(),
          token_id: tokenId,
          token_number: current,
          name: formattedName,
          domain,
          slot_id: slotId,
          slot_date: slotDate,
          slot_label: slotLabel,
          service_type: serviceType,
          service_detail: otherService.trim(),
          domain_location: domainLocation,
          domain_location_label: domainLocationLabel,
          status: "waiting",
          created_at: new Date(),
        }]);
      
      if (queueError) throw queueError;

      // Update slot booked count
      const { error: slotUpdateError } = await supabase
        .from("slots")
        .update({ booked: booked + 1 })
        .eq("id", slotId);
      
      if (slotUpdateError) throw slotUpdateError;

      const { error: counterUpdateError } = await supabase
        .from("counters")
        .upsert({ id: counterId, value: current + 1 }, { onConflict: "id" });
      
      if (counterUpdateError) throw counterUpdateError;
      setSlots((prev) => prev.map((slot) => (
        slot.id === slotId ? { ...slot, booked: booked + 1 } : slot
      )));

      const tokenReceipt = {
        id: tokenId, name: formattedName, domain, slotId, slotDate, slotLabel,
        serviceType, serviceDetail: otherService.trim(), domainLocation, domainLocationLabel,
        tokenNumber: current,
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem("lastIssuedToken", JSON.stringify(tokenReceipt));
      localStorage.setItem("nameDomainBlock", blockKey);
      setIssuedToken(tokenReceipt);
      setQueueItems([]);
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      showToast.success(t("form.tokenGenerated", { token: tokenId }));
    } catch (e) {
      if (e?.message === "Slot full") setErrors({ slot: t("form.slotFull") });
      else {
        console.error("Error generating token:", e);
        setErrors({ slot: e?.message || t("form.failedToGenerate") });
        showToast.error(e?.message || t("form.failedToGenerate"));
      }
    } finally {
      setLoading(false);
    }
  }

  function startNewToken() {
    localStorage.removeItem("lastIssuedToken");
    localStorage.removeItem("nameDomainBlock");
    setIssuedToken(null);
    setQueueItems([]);
    setName("");
    setServiceType("");
    setOtherService("");
    setSlotId("");
    setErrors({});
  }

  if (issuedToken?.id) {
    const peopleAhead = queueItems.length;
    const position = peopleAhead + 1;
    const estimatedMinutes = peopleAhead * 5;

    return (
      <div className="app home-page token-status-page">
        <div className="home-hero">
          <div>
            <h1 className="text-gradient">Your Token</h1>
            <p className="text-lg font-medium text-gray-600">Keep this page open to track your turn.</p>
          </div>
          <button className="admin-btn title-admin-btn" onClick={() => navigate("/admin-login")}>
            {t("nav.adminLogin")}
          </button>
        </div>

        <div className="token-receipt-card card">
          <div className="token-receipt-main">
            <span className="token-label">Token Number</span>
            <strong className="text-6xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 bg-clip-text text-transparent">{issuedToken.id}</strong>
            <p className="text-lg font-semibold text-gray-800 mt-2">{issuedToken.name}</p>
          </div>
          <div className="token-status-grid">
            <div className="stat-mini">
              <span className="stat-label-mini">Position</span>
              <strong className="text-3xl text-cyan-600">{position}</strong>
            </div>
            <div className="stat-mini">
              <span className="stat-label-mini">Waiting Ahead</span>
              <strong className="text-3xl text-blue-600">{peopleAhead}</strong>
            </div>
            <div className="stat-mini">
              <span className="stat-label-mini">Estimated Turn</span>
              <strong className="text-3xl text-purple-600">{estimatedMinutes === 0 ? "Now" : `${estimatedMinutes} min`}</strong>
            </div>
          </div>
        </div>

        <div className="token-detail-panel card">
          <div className="token-detail-item">
            <span className="text-sm font-bold text-gray-500 uppercase">Slot</span>
            <strong className="text-lg text-gray-800">{issuedToken.slotLabel || "--"}</strong>
          </div>
          <div className="token-detail-item">
            <span className="text-sm font-bold text-gray-500 uppercase">Date</span>
            <strong className="text-lg text-gray-800">{issuedToken.slotDate}</strong>
          </div>
          <div className="token-detail-item">
            <span className="text-sm font-bold text-gray-500 uppercase">Service</span>
            <strong className="text-lg text-gray-800">{issuedToken.serviceType}</strong>
          </div>
          <div className="token-detail-item">
            <span className="text-sm font-bold text-gray-500 uppercase">Status</span>
            <strong className={`text-lg font-bold ${peopleAhead === 0 ? 'text-green-600' : 'text-orange-600'}`}>
              {peopleAhead === 0 ? "Please be ready" : "Waiting"}
            </strong>
          </div>
        </div>

        <div className="queue-panel card">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Waiting tokens ahead</h3>
          {queueItems.length === 0 ? (
            <p className="empty-state text-center py-6 text-gray-500 font-medium">No tokens ahead. Your turn is next! 🎉</p>
          ) : (
            <ul className="queue-list token-ahead-list">
              {queueItems.map((token, idx) => (
                <li key={token} className="queue-item">
                  <span className="font-semibold text-gray-700">#{idx + 1}</span>
                  <span className="font-bold text-blue-600">{token}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="token-actions flex gap-4 mb-8">
          <button onClick={startNewToken} className="btn-neutral flex-1 md:flex-none">
            ↻ Generate New Token
          </button>
          <button onClick={() => window.print()} className="admin-btn flex-1 md:flex-none">
            🖨️ Print Token
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app home-page">
      <div className="home-hero">
        <div>
          <h1>{t("app.title")}</h1>
          <p>{t("app.subtitle")}</p>
        </div>
        <button className="admin-btn title-admin-btn" onClick={() => navigate("/admin-login")}>
          {t("nav.adminLogin")}
        </button>
      </div>

      <div className="card home-card">
        <div className="form-group">
          <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Full Name</label>
          <input
            type="text" placeholder="Enter your full name"
            value={name} onChange={(e) => { setName(e.target.value); clearError("name"); }}
            className={errors.name ? "input-error" : ""}
          />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>

        <div className="form-group">
          <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Service Category</label>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="w-full">
            <option value="general">General</option>
            <option value="bank">Bank</option>
            <option value="hospital">Hospital</option>
            <option value="government">Government Office</option>
            <option value="personal">Personal Organization</option>
          </select>
        </div>

        <div className="form-group">
          <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Service Type</label>
          <select
            value={serviceType}
            onChange={(e) => { setServiceType(e.target.value); clearError("serviceType"); }}
            className={errors.serviceType ? "input-error" : "w-full"}
          >
            <option value="">{t("form.selectService")}</option>
            {services.map((s) => (
              <option key={s} value={slugify(s)}>{s}</option>
            ))}
          </select>
          {errors.serviceType && <p className="field-error">{errors.serviceType}</p>}
        </div>

        {showLocation && (
          <div className="form-group">
            <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Office / Branch / Hospital</label>
            <select
              value={domainLocation} className={errors.domainLocation ? "input-error w-full" : "w-full"}
              onChange={(e) => { setDomainLocation(e.target.value); clearError("domainLocation"); }}
            >
              <option value="">Select Office / Branch / Hospital</option>
              {locations.map((l) => (
                <option key={l} value={slugify(l)}>{l}</option>
              ))}
            </select>
            {errors.domainLocation && <p className="field-error">{errors.domainLocation}</p>}
          </div>
        )}

        {showOther && (
          <div className="form-group">
            <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Service Details</label>
            <textarea
              rows={2} placeholder="Please specify the service (1 line)"
              value={otherService} onChange={(e) => { setOtherService(e.target.value); clearError("otherService"); }}
              className="w-full"
            />
            {errors.otherService && <p className="field-error">{errors.otherService}</p>}
          </div>
        )}
      </div>

      <div className="card home-slot-panel">
        <h3 className="text-2xl font-bold text-gray-800 mb-4">{t("form.chooseTimeSlot")}</h3>
        <div className="slot-row grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-group">
            <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Select Date</label>
            <input 
              type="date" 
              value={slotDate} 
              onChange={(e) => { setSlotDate(e.target.value); clearError("slot"); }} 
              className="w-full"
            />
          </div>
          <div className="form-group">
            <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Select Time Slot</label>
            <select
              value={slotId}
              onChange={(e) => { setSlotId(e.target.value); clearError("slot"); }}
              className={errors.slot ? "input-error w-full" : "w-full"}
            >
              <option value="">{t("form.selectSlot")}</option>
              {slots.map((s) => {
                const cap = Number(s.capacity || 0);
                const booked = Number(s.booked || 0);
                const remaining = Math.max(cap - booked, 0);
                const label = `${formatTime12(s.start_time)} - ${formatTime12(s.end_time)}`;
                return (
                  <option key={s.id} value={s.id} disabled={remaining <= 0}>
                    {label} ({t("time.left")}: {remaining})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        <p className="slot-hint text-sm text-gray-500 mt-3">{slotHint}</p>
        {errors.slot && <p className="field-error">{errors.slot}</p>}
      </div>

      <div className="generate-section home-generate-section">
        <button onClick={handleSubmit} disabled={loading} className="admin-btn w-full md:w-auto text-lg py-4 px-12">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              {t("form.generating")}
            </span>
          ) : (
            <span>✨ {t("form.generateToken")}</span>
          )}
        </button>
      </div>

    </div>
  );
}
