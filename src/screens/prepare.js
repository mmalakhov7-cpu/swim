// screens/prepare.js — подготовка тренировки: выбрать шаблон или начать пустую.

import { getTemplates } from "../storage.js";
import { h, fmtMeters } from "../ui.js";

export function renderPrepare(root, ctx) {
  const templates = getTemplates();

  function start(template) {
    ctx.state.pendingStart = { template: template || null };
    ctx.navigate("#/active");
  }

  root.appendChild(
    h("div.screen",
      h("header.appbar",
        h("button.icon-btn", { onclick: () => ctx.navigate("#/dashboard"), title: "Назад" }, "‹"),
        h("h1", "Новая тренировка"),
        h("div.appbar-actions"),
      ),

      h("button.big-primary", { onclick: () => start(null) }, "Пустая тренировка"),
      h("p.muted", "Свободное плавание без плана — задания не заданы, просто считаем отсечки."),

      h("section.card",
        h("h2", "Или выберите шаблон"),
        templates.length
          ? h("ul.list",
              ...templates.map((t) => {
                const total = t.tasks.reduce((a, x) => a + (x.targetDistance || 0), 0);
                return h("li.list-item", { onclick: () => start(t) },
                  h("div.li-main", t.name),
                  h("div.li-sub", `${t.tasks.length} заданий · ${fmtMeters(total)} м`),
                  h("div.li-chev", "›"),
                );
              })
            )
          : h("p.muted", "Шаблонов пока нет. Создайте их в разделе «Шаблоны».")
      ),

      h("div.nav-row",
        h("button.secondary", { onclick: () => ctx.navigate("#/templates") }, "Управление шаблонами"),
      ),
    )
  );
}
