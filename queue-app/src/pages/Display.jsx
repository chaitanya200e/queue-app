import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { collection, query, orderBy, onSnapshot, doc } from "firebase/firestore";
import { db } from "../firebase/config";

function normalizeSlotLabel(label, date) {
  if (label) return label;
  if (!date) return "--";
  return date;
}

export default function Display() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState({ token: "Q000", slot: "--" });
  const [next, setNext] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "meta", "queue"), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setCurrent({
        token: data.currentToken || "Q000",
        slot: normalizeSlotLabel(data.currentSlotLabel, data.currentSlotDate),
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "queue"), orderBy("tokenNumber", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const waiting = snap.docs.map((d) => d.data()).filter((x) => x.status === "waiting");
      if (!waiting.length) {
        setNext([]);
        return;
      }
      setNext(waiting.slice(0, 5).map(x => ({
        token: x.tokenId,
        slot: normalizeSlotLabel(x.slotLabel, x.slotDate),
      })));
    });
    return unsub;
  }, []);

  const { t: translate } = useTranslation();

  return (
    <div className="app">
      <div className="display-container">
        {/* Current Token Section */}
        <div className="current-token">
          <h2>{translate("display.nowServing")}</h2>
          <div className="current-token-number">{current.token}</div>
          <p style={{ textAlign: "center", marginTop: "12px", fontSize: "16px", fontWeight: "600", color: "#666" }}>
            {translate("display.slot")}: <span style={{ color: "#11998e", fontWeight: "bold" }}>{current.slot}</span>
          </p>
        </div>

        {/* Next Tokens Section */}
        {next.length > 0 && (
          <div className="next-tokens">
            <h3>{translate("display.nextToken")}</h3>
            <div className="next-token-list">
              {next.map((n, idx) => (
                <div key={idx} className="next-token-badge">
                  {n.token}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {next.length === 0 && (
          <div className="next-tokens">
            <h3 style={{ textAlign: "center", color: "#999" }}>
              {translate("display.noMoreTokens")}
            </h3>
          </div>
        )}
      </div>
    </div>
  );
}
