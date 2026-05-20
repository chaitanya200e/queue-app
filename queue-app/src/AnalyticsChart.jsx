import { useState, useEffect } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { supabase } from "./supabase/config";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function AnalyticsChart({ domain = "", scopeKey = "" }) {
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        // Fetch queue data from Supabase
        const { data: queueData, error } = await supabase
          .from("queue")
          .select("*");
        
        if (error) throw error;
        
        const allDocs = queueData || [];

        const now = new Date();
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          last7Days.push({
            dateStr: d.toISOString().split("T")[0],
            date: d,
            count: 0,
          });
        }

        allDocs.forEach(doc => {
          const servedAt = doc.served_at;
          if (!servedAt || doc.status !== "served") return;

          const servedDate = new Date(servedAt);
          const dateStr = servedDate.toISOString().split("T")[0];

          // Filter by scope
          let matchScope = true;
          if (domain) {
            matchScope = String(doc.domain || "").toLowerCase() === domain.toLowerCase();
          }
          if (scopeKey && matchScope) {
            const docScope = String(doc.domain_location || doc.scope_key || "").toLowerCase();
            matchScope = docScope === scopeKey.toLowerCase();
          }

          if (matchScope) {
            const day = last7Days.find(d => d.dateStr === dateStr);
            if (day) day.count++;
          }
        });

        const labels = last7Days.map(d => {
          const date = d.date;
          return `${date.getMonth() + 1}/${date.getDate()}`;
        });
        const data = last7Days.map(d => d.count);

        setChartData({
          labels,
          datasets: [
            {
              label: "Tokens Served",
              data,
              borderColor: "#1a56db",
              backgroundColor: "rgba(26, 86, 219, 0.1)",
              tension: 0.4,
              fill: true,
              pointRadius: 4,
              pointBackgroundColor: "#1a56db",
              pointBorderColor: "#fff",
              pointBorderWidth: 2,
            },
          ],
        });
      } catch (error) {
        console.error("Error fetching analytics:", error);
      }
    }

    fetchAnalytics();
  }, [domain, scopeKey]);

  if (!chartData) {
    return <div style={{ textAlign: "center", padding: "20px" }}>Loading chart...</div>;
  }

  return (
    <div style={{ width: "100%" }}>
      <Line
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              position: "top",
            },
            tooltip: {
              mode: "index",
              intersect: false,
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
              },
            },
          },
        }}
      />
    </div>
  );
}
