// screens/sessionDetail.js — детальная карточка проведённой тренировки.

import { getSession, deleteSession } from "../storage.js";
import { formatDuration, formatSplit, formatPace } from "../timer.js";
import { h, fmtMeters, fmtHuman, fmtDateHuman } from "../ui.js";

export function renderSessionDetail(root, ctx, id) {
  const s = getSession(id);
  if (!s) {
    root.appendChild(
      h("div.screen",
        backbar(ctx, "Тренировка"),
        h("p.muted", "Тренировка не найдена."),
      )
    );
    return;
  }

  const startClock = new Date(s.startTime).toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit",
  });

  root.appendChild(
    h("div.screen",
      backbar(ctx, fmtDateHuman(s.date)),

      h("div.stat-row",
        stat("Объём", `${fmtMeters(s.totalSwumDistance)} м`),
        stat("Общее время", fmtHuman(s.totalTimeMs)),
        stat("Начало", startClock),
      ),
      // Плотность (если есть данные о времени под нагрузкой).
      s.totalLoadMs
        ? h("div.stat-row",
            stat("Под нагрузкой", formatDuration(s.totalLoadMs, { tenths: false })),
            stat("Без нагрузки", formatDuration(Math.max(0, s.totalTimeMs - s.totalLoadMs), { tenths: false })),
            stat("Моторная плотн.", `${Math.round((s.totalLoadMs / s.totalTimeMs) * 100)}%`),
          )
        : null,
      s.totalTargetDistance
        ? h("p.muted", `Цель: ${fmtMeters(s.totalTargetDistance)} м · выполнено ${Math.round(
            (s.totalSwumDistance / s.totalTargetDistance) * 100
          )}%`)
        : h("p.muted", "Свободная тренировка (без цели)."),

      ...s.tasks.map((t) => taskCard(t)),

      h("div.nav-row",
        h("button.danger", { onclick: () => onDelete() }, "Удалить тренировку"),
      ),
    )
  );

  function onDelete() {
    if (confirm("Удалить эту тренировку? Действие необратимо.")) {
      deleteSession(id);
      ctx.navigate("#/dashboard");
    }
  }
}

function backbar(ctx, title) {
  return h("header.appbar",
    h("button.icon-btn", { onclick: () => ctx.navigate("#/dashboard"), title: "Назад" }, "‹"),
    h("h1", title),
    h("div.appbar-actions"),
  );
}

function stat(label, value) {
  return h("div.stat", h("div.stat-value", value), h("div.stat-label", label));
}

function taskCard(t) {
  return h("section.card",
    h("div.task-head",
      h("strong", t.name),
      h("span.muted", `${fmtMeters(t.swumDistance)} м · ${formatDuration(t.taskTimeMs)}`),
    ),
    t.splits.length
      ? h("table.splits-table",
          h("thead", h("tr",
            h("th", "#"), h("th", "Шаг"), h("th", "Отрезок"), h("th", "/100 м"),
          )),
          h("tbody",
            ...t.splits.map((sp) =>
              h("tr",
                h("td", sp.index),
                h("td", `${sp.stepMeters} м`),
                h("td", formatSplit(sp.lapTimeMs)),
                h("td", formatPace(sp.lapTimeMs, sp.stepMeters)),
              )
            )
          )
        )
      : h("p.muted", "Без отсечек.")
  );
}
