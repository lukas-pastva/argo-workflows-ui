import React, { useEffect, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";
import { listWorkflows } from "../api";
import Spinner from "./Spinner.jsx";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/* Helpers --------------------------------------------------------- */
function secondsBetween(start, end) {
  return Math.max(0, Math.round((end - start) / 1000));
}

/* Main component -------------------------------------------------- */
export default function Chart({ onError = () => {} }) {
  const [chartData, setChartData] = useState(null);

  /* Fetch (and auto-refresh) workflow list ------------------------ */
  useEffect(() => {
    async function refresh() {
      try {
        const wfs    = await listWorkflows();
        const labels = wfs.map((wf) => wf.metadata.name);
        const data   = wfs.map((wf) => {
          const start = new Date(wf.status.startedAt).getTime();
          const end   = wf.status.finishedAt
            ? new Date(wf.status.finishedAt).getTime()
            : Date.now();
          return secondsBetween(start, end);
        });

        setChartData({
          labels,
          datasets: [
            {
              label: "Duration (s)",
              data
            }
          ]
        });
      } catch (e) {
        onError(`Failed to load workflows: ${e.message}`);
      }
    }

    refresh();
    const id = setInterval(refresh, 10_000);   // 10 s auto-refresh
    return () => clearInterval(id);
  }, [onError]);

  /* Loading state ------------------------------------------------- */
  if (!chartData)
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Spinner />
      </div>
    );

  /* Chart options ------------------------------------------------- */
  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title : { display: true, text: "Workflow durations" }
    },
    scales: {
      x: {
        ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 }
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: "Seconds" }
      }
    }
  };

  return (
    <div className="card">
      <Bar data={chartData} options={options} />
    </div>
  );
}
