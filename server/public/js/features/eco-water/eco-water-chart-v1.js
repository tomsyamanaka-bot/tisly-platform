/**
 * TiSLY Eco-Water pH 推移グラフ（Chart.js）
 * しきい値ラインと安全ゾーンを破線で可視化
 */

import {
  ECO_WATER_NEUTRALIZE_START,
  ECO_WATER_SAFE_MAX,
  ECO_WATER_SAFE_MIN,
} from "./eco-water-sim-v1.js";

const MAX_POINTS = 90;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} initialPh
 */
export function createEcoWaterChartV1(canvas, initialPh) {
  const Chart = globalThis.Chart;
  if (!canvas || !Chart) {
    return {
      push(ph) {
        void ph;
      },
      destroy() {},
    };
  }

  const labels = [];
  const values = [];
  const now = Date.now();
  for (let i = MAX_POINTS - 1; i >= 0; i -= 1) {
    const t = new Date(now - i * 2000);
    labels.push(formatClock(t));
    values.push(initialPh);
  }

  const plugin = {
    id: "ewSafeZone",
    beforeDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales?.y) return;
      const yTop = scales.y.getPixelForValue(ECO_WATER_SAFE_MAX);
      const yBottom = scales.y.getPixelForValue(ECO_WATER_SAFE_MIN);
      ctx.save();
      ctx.fillStyle = "rgba(5, 150, 105, 0.10)";
      ctx.fillRect(
        chartArea.left,
        yTop,
        chartArea.right - chartArea.left,
        yBottom - yTop
      );
      ctx.restore();
    },
  };

  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "pH",
          data: values,
          borderColor: "#1e3a8a",
          backgroundColor: "rgba(30, 58, 138, 0.12)",
          borderWidth: 3,
          tension: 0.35,
          pointRadius: 0,
          fill: true,
        },
        {
          label: "中和開始 8.5",
          data: labels.map(() => ECO_WATER_NEUTRALIZE_START),
          borderColor: "#d97706",
          borderWidth: 2,
          borderDash: [8, 6],
          pointRadius: 0,
          fill: false,
        },
        {
          label: "上限 8.6",
          data: labels.map(() => ECO_WATER_SAFE_MAX),
          borderColor: "#059669",
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          label: "下限 5.8",
          data: labels.map(() => ECO_WATER_SAFE_MIN),
          borderColor: "#059669",
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 280 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.datasetIndex !== 0) return "";
              return `pH ${Number(ctx.raw).toFixed(1)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6,
            color: "#64748b",
          },
          grid: { display: false },
        },
        y: {
          min: 4,
          max: 13,
          ticks: {
            stepSize: 1,
            color: "#64748b",
          },
          grid: { color: "rgba(148, 163, 184, 0.25)" },
        },
      },
    },
    plugins: [plugin],
  });

  return {
    /**
     * @param {number} ph
     */
    push(ph) {
      const t = formatClock(new Date());
      labels.push(t);
      values.push(ph);
      if (labels.length > MAX_POINTS) {
        labels.shift();
        values.shift();
      }
      for (let i = 1; i < chart.data.datasets.length; i += 1) {
        const fixed = chart.data.datasets[i].data[0];
        chart.data.datasets[i].data = labels.map(() => fixed);
      }
      chart.update("none");
    },
    destroy() {
      chart.destroy();
    },
  };
}

/**
 * @param {Date} d
 */
function formatClock(d) {
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
