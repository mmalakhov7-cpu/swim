// charts.js — тонкие обёртки над Chart.js (локальная копия в vendor/, глобальный Chart).
// Каждый график хранится по canvas-элементу и уничтожается перед перерисовкой,
// чтобы не плодить экземпляры и обработчики.

const registry = new WeakMap();

function ChartLib() {
  if (typeof window === "undefined" || !window.Chart) {
    throw new Error("Chart.js не загружен (vendor/chart.min.js)");
  }
  return window.Chart;
}

function destroyExisting(canvas) {
  const prev = registry.get(canvas);
  if (prev) {
    prev.destroy();
    registry.delete(canvas);
  }
}

const AXIS_COLOR = "#9fb3c8";
const GRID_COLOR = "rgba(159,179,200,0.15)";

/** График накопления объёма по датам (накопительно). */
export function renderVolumeChart(canvas, points) {
  const Chart = ChartLib();
  destroyExisting(canvas);
  const chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: points.map((p) => p.date),
      datasets: [
        {
          label: "Объём, м (накопительно)",
          data: points.map((p) => p.cumulative),
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.15)",
          fill: true,
          tension: 0.25,
          pointRadius: 3,
        },
      ],
    },
    options: baseOptions({ yTitle: "метры" }),
  });
  registry.set(canvas, chart);
  return chart;
}

/**
 * График по заданию: несколько серий времени (25/50/100/время задания).
 * series: [{ label, data:[{x:date,y:ms}], color, hidden }]
 * Ось Y — время в ms, форматируется в mm:ss.
 */
export function renderTaskChart(canvas, labels, series, formatY) {
  const Chart = ChartLib();
  destroyExisting(canvas);
  const chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.data,
        borderColor: s.color,
        backgroundColor: s.color,
        hidden: !!s.hidden,
        spanGaps: true,
        tension: 0.2,
        pointRadius: 5,
        pointHoverRadius: 7,
      })),
    },
    options: {
      ...baseOptions({ yTitle: "время" }),
      layout: { padding: { top: 8, right: 12 } },
      scales: {
        // offset:true — точки не прилипают к оси Y (важно, когда дата всего одна).
        x: { ...axisX(), offset: true },
        y: {
          ...axisY("время"),
          grace: "15%",
          ticks: {
            color: AXIS_COLOR,
            callback: (v) => (formatY ? formatY(v) : v),
          },
        },
      },
      plugins: {
        // Своя легенда — это чипы-переключатели над графиком. Встроенную убираем,
        // чтобы не дублировалась и не наезжала на точки.
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${formatY ? formatY(ctx.parsed.y) : ctx.parsed.y}`,
          },
        },
      },
    },
  });
  registry.set(canvas, chart);
  return chart;
}

function axisX() {
  return {
    ticks: { color: AXIS_COLOR },
    grid: { color: GRID_COLOR },
  };
}
function axisY(title) {
  return {
    ticks: { color: AXIS_COLOR },
    grid: { color: GRID_COLOR },
    title: { display: !!title, text: title, color: AXIS_COLOR },
  };
}

function baseOptions({ yTitle } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    scales: { x: axisX(), y: axisY(yTitle) },
    plugins: { legend: { labels: { color: AXIS_COLOR } } },
  };
}
