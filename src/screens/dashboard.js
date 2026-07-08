// screens/dashboard.js — главный экран.
// Чёткая структура сверху вниз: действие → мой объём → история → навигация (меню).
// Контент (данные) и навигация (переходы) визуально разделены.

import { getSessions, cumulativeVolume } from "../storage.js";
import { renderVolumeChart } from "../charts.js";
import { h, fmtMeters, fmtHuman, fmtDateHuman } from "../ui.js";

export function renderDashboard(root, ctx) {
  const sessions = getSessions(); // старые → новые

  const total = cumulativeVolume();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const weekVol = sessions
    .filter((s) => s.startTime >= weekAgo)
    .reduce((a, s) => a + s.totalSwumDistance, 0);
  const monthVol = sessions
    .filter((s) => s.startTime >= startOfMonth.getTime())
    .reduce((a, s) => a + s.totalSwumDistance, 0);

  root.appendChild(
    h("div.screen",
      // 1. Заголовок
      h("header.appbar", h("h1", "Дневник бассейна")),

      // 2. Действие
      h("button.big-primary", { onclick: () => ctx.navigate("#/prepare") }, "Начать тренировку"),

      // 3. Мой объём — одна метрика + выбор гранулярности, график свёрнут
      volumeCard(sessions, { total, week: weekVol, month: monthVol }),

      // 4. История
      recentSection(sessions.slice().reverse(), ctx),

      // 5. Навигация — меню-список
      h("section.card.menu",
        h("h2", "Разделы"),
        menuItem(ctx, "📈", "Аналитика", "графики прогресса по заданиям", "#/analytics"),
        menuItem(ctx, "📋", "Шаблоны", "готовые планы тренировок", "#/templates"),
        menuItem(ctx, "⚙️", "Настройки", "бассейн, экран, резервная копия", "#/settings"),
      ),
    )
  );
}

function volumeCard(sessions, vals) {
  const caps = { total: "всего проплыто", week: "за эту неделю", month: "за этот месяц" };
  const bigEl = h("div.volume-big");
  const capEl = h("div.volume-cap");
  const paint = (g) => {
    bigEl.textContent = `${fmtMeters(vals[g])} м`;
    capEl.textContent = caps[g];
  };

  const sel = h("select.vol-select",
    { onchange: (e) => paint(e.target.value) },
    h("option", { value: "total" }, "Всего"),
    h("option", { value: "week" }, "За неделю"),
    h("option", { value: "month" }, "За месяц"),
  );
  paint("total");

  // График скрыт по умолчанию, рендерится лениво при раскрытии.
  const canvas = h("canvas");
  const chartWrap = h("div.vol-chart.hidden", h("div.chart-box.dash", canvas));
  let rendered = false;
  const toggle = sessions.length
    ? h("button.vol-toggle", { onclick: onToggle }, "Показать график ▾")
    : null;

  function onToggle() {
    const hidden = chartWrap.classList.toggle("hidden");
    toggle.textContent = hidden ? "Показать график ▾" : "Скрыть график ▴";
    if (!hidden && !rendered) {
      rendered = true;
      let acc = 0;
      const points = sessions.map((s) => {
        acc += s.totalSwumDistance;
        return { date: s.date, cumulative: acc };
      });
      queueMicrotask(() => {
        try { renderVolumeChart(canvas, points); } catch (e) { console.warn(e); }
      });
    }
  }

  return h("section.card",
    h("div.vol-top", h("h2", "Мой объём"), sel),
    h("div.volume-hero", bigEl, capEl),
    toggle,
    chartWrap,
  );
}

function recentSection(sessions, ctx) {
  const items = sessions.slice(0, 6);
  return h("section.card",
    h("h2", "Последние тренировки"),
    items.length
      ? h("ul.list",
          ...items.map((s) =>
            h("li.list-item", { onclick: () => ctx.navigate(`#/session/${s.id}`) },
              h("div.li-main", fmtDateHuman(s.date)),
              h("div.li-sub", `${fmtMeters(s.totalSwumDistance)} м · ${fmtHuman(s.totalTimeMs)}`),
              h("div.li-chev", "›"),
            )
          )
        )
      : h("p.muted", "Пока нет тренировок. Нажмите «Начать тренировку».")
  );
}

function menuItem(ctx, icon, title, sub, hash) {
  return h("button.menu-item", { onclick: () => ctx.navigate(hash) },
    h("span.menu-icon", icon),
    h("span.menu-text",
      h("span.menu-title", title),
      h("span.menu-sub", sub),
    ),
    h("span.menu-chev", "›"),
  );
}
