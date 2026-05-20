import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabase/config";

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
    // Initial fetch
    async function fetchCurrent() {
      const { data } = await supabase
        .from("meta")
        .select("*")
        .eq("id", "queue")
        .single();
      
      if (data) {
        setCurrent({
          token: data.current_token || "Q000",
          slot: normalizeSlotLabel(data.current_slot_label, data.current_slot_date),
        });
      }
    }
    fetchCurrent();

    const channel = supabase
      .channel("meta-queue-display")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meta", filter: "id=eq.queue" },
        (payload) => {
          const data = payload.new;
          setCurrent({
            token: data.current_token || "Q000",
            slot: normalizeSlotLabel(data.current_slot_label, data.current_slot_date),
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    async function fetchQueueData() {
      const { data } = await supabase
        .from("queue")
        .select("*")
        .eq("status", "waiting")
        .order("token_number", { ascending: true });
      
      if (data && data.length > 0) {
        setNext(data.slice(0, 5).map(x => ({
          token: x.token_id,
          slot: normalizeSlotLabel(x.slot_label, x.slot_date),
        })));
      } else {
        setNext([]);
      }
    }

    fetchQueueData();

    const channel = supabase
      .channel("queue-display")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue" },
        fetchQueueData
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const { t: translate } = useTranslation();

  return (
    <div className="app display-page min-h-screen flex items-center justify-center p-4">
      <div className="display-container w-full max-w-6xl">
        {/* Current Token Section - HERO DISPLAY */}
        <div className="current-token card mb-12 text-center p-12">
          <p className="text-xl font-bold text-gray-500 uppercase tracking-widest mb-4">{translate("display.nowServing")}</p>
          <div className="current-token-number text-9xl font-black bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-pulse">
            {current.token}
          </div>
          <p className="text-3xl font-bold text-gray-700 mt-8 mb-3">
            {translate("display.slot")}: 
            <span className="ml-4 text-green-600 text-4xl">●</span>
            <span className="ml-2 text-3xl text-gray-800 font-bold">{current.slot}</span>
          </p>
          <p className="text-gray-500 text-lg mt-4 animate-bounce">Please proceed to the counter</p>
        </div>

        {/* Next Tokens Section */}
        {next.length > 0 && (
          <div className="next-tokens card p-8">
            <h3 className="text-3xl font-bold text-gray-800 mb-8 text-center">{translate("display.nextToken")} 🕐</h3>
            <div className="next-token-list grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {next.map((n, idx) => (
                <div key={idx} className="next-token-badge">
                  <div className="text-sm font-bold text-gray-500 uppercase mb-2">#{idx + 1}</div>
                  <div className="text-4xl font-black text-white">{n.token}</div>
                  <div className="text-xs text-gray-200 mt-2">{n.slot}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {next.length === 0 && (
          <div className="next-tokens card p-12 text-center">
            <h3 className="text-4xl font-bold text-gray-400 mb-4">
              {translate("display.noMoreTokens")} ✨
            </h3>
            <p className="text-gray-500 text-lg">All tokens have been served. Great work!</p>
          </div>
        )}
      </div>
    </div>
  );
}
