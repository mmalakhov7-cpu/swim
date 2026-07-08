// screens/analytics.js — прогресс по заданию: линейный график по датам.
// Серии: 25 / 50 / 100 м (среднее время сегмента) и «Время задания».

import { getSessions } from "../storage.js";
import { renderTaskChart } from "../charts.js";
import { formatSplit } from "../timer.js";
import { h, clear, fmtDateHuman } from "../ui.js";

const SERIES_DEFS = [
  { key: "s25", label: "25 м", color: "#38bdf8", defaultOn: true },
  { key: "s50", label: "50 м", color: "#a78bfa", defaultOn: true },
  { key: "s100", label: "100 м", color: "#f472b6", defaultOn: true },
  { key: "task", label: "Время задания", color: "#fbbf24", defaultOn: false },
];

export function renderAnalytics(root, ctx) {
  const sessions = getSessions();

  // Все уникальные названия заданий (по ним группируем прогресс).
  const taskNames = uniqueTaskNames(sessions);

  const screen = h("div.screen");
  root.appendChild(screen);

  const backbar = h("header.appbar",
    h("button.icon-btn", { onclick: () => ctx.navigate("#/dashboard"), title: "Назад" }, "‹"),
    h("h1", "Аналитика"),
    h("div.appbar-actions"),
  );

  if (!taskNames.length) {
    screen.appendChild(h("div.stack", backbar, h("p.muted", "Нет данных. Проведите тренировку с заданиями.")));
    return;
  }

  let selected = taskNames[0];
  const enabled = Object.fromEntries(SERIES_DEFS.map((d) => [d.key, d.defaultOn]));

  const select = h("select.field",
    { onchange: (e) => { selected = e.target.value; redraw(); } },
    ...taskNames.map((n) => h("option", { value: n }, n)),
  );

  const toggles = h("div.toggles",
    ...SERIES_DEFS.map((d) =>
      h("label.toggle",
        h("input", {
          type: "checkbox", checked: d.defaultOn,
          onchange: (e) => { enabled[d.key] = e.target.checked; redraw(); },
        }),
        h("span.swatch", { style: `background:${d.color}` }),
        d.label,
      )
    )
  );

  const canvas = h("canvas");
  const chartBox = h("div.chart-box.tall", canvas);
  const summary = h("div.muted");

  screen.appendChild(
    h("div.stack",
      backbar,
      // Список задания + переключатели серий — в одной карточке со своими
      // внутренними отступами (flex-gap), чтобы ничего не наезжало друг на друга.
      h("section.card.stack",
        h("label.field-label", "Задание"),
        select,
        toggles,
      ),
      h("section.card", chartBox),
      summary,
    )
  );

  function redraw() {
    const data = buildTaskSeries(sessions, selected);
    const series = SERIES_DEFS.map((d) => ({
      label: d.label,
      color: d.color,
      hidden: !enabled[d.key],
      data: data.points.map((p) => p[d.key]),
    }));
    try {
      renderTaskChart(canvas, data.labels, series, (ms) => formatSplit(ms, { tenths: false }));
    } catch (e) {
      console.warn(e);
    }
    clear(summary);
    summary.appendChild(document.createTextNode(
      `${data.labels.length} дат(ы). Тренд вниз = быстрее. По каждой дате — среднее время сегмента.`
    ));
  }

  redraw();
}

// --- Данные --------------------------------------------------------------

function uniqueTaskNames(sessions) {
  const set = new Set();
  for (const s of sessions) for (const t of s.tasks) if (t.name) set.add(t.name);
  return [...set];
}

/**
 * Для выбранного задания: точки по датам с усреднёнными временами сегментов.
 * Несколько инстансов одного дня усредняются.
 */
function buildTaskSeries(sessions, name) {
  const byDate = new Map(); // date → { s25:[], s50:[], s100:[], task:[] }
  for (const s of sessions) {
    for (const t of s.tasks) {
      if (t.name !== name) continue;
      const bucket = byDate.get(s.date) || { s25: [], s50: [], s100: [], task: [] };
      const segs = segmentAverages(t);
      if (segs[25] != null) bucket.s25.push(segs[25]);
      if (segs[50] != null) bucket.s50.push(segs[50]);
      if (segs[100] != null) bucket.s100.push(segs[100]);
      bucket.task.push(t.taskTimeMs);
      byDate.set(s.date, bucket);
    }
  }
  const dates = [...byDate.keys()].sort();
  const points = dates.map((date) => {
    const b = byDate.get(date);
    return {
      s25: avg(b.s25),
      s50: avg(b.s50),
      s100: avg(b.s100),
      task: avg(b.task),
    };
  });
  return { labels: dates.map(fmtDateHuman), points };
}

/**
 * Средние времена НЕПЕРЕСЕКАЮЩИХСЯ сегментов длины 25/50/100 в задании.
 * Реконструируем маркеры из splits (cumulativeDistance/cumulativeTaskTimeMs),
 * границы берём кратными N от нуля — точно как в §6.3 (только точные границы).
 */
function segmentAverages(task) {
  const map = new Map([[0, 0]]);
  for (const sp of task.splits) map.set(sp.cumulativeDistance, sp.cumulativeTaskTimeMs);
  const maxD = task.splits.length ? task.splits[task.splits.length - 1].cumulativeDistance : 0;

  const out = {};
  for (const N of [25, 50, 100]) {
    const times = [];
    for (let d = N; d <= maxD; d += N) {
      if (map.has(d) && map.has(d - N)) times.push(map.get(d) - map.get(d - N));
    }
    out[N] = times.length ? avg(times) : null;
  }
  return out;
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
