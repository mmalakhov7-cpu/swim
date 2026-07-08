// screens/templates.js — список шаблонов + редактор (создать/изменить/удалить).

import { getTemplates, saveTemplate, deleteTemplate } from "../storage.js";
import { makeWorkoutTemplate, makeTaskTemplate } from "../models.js";
import { generate, isImplemented, exampleTasks } from "../workoutGenerator.js";
import { presetTemplates, PRESET_COUNT } from "../presetWorkouts.js";
import { h, clear, fmtMeters } from "../ui.js";

export function renderTemplates(root, ctx) {
  const container = h("div.screen");
  root.appendChild(container);
  let editing = null; // рабочая копия редактируемого шаблона

  function backbar(title, onBack) {
    return h("header.appbar",
      h("button.icon-btn", { onclick: onBack, title: "Назад" }, "‹"),
      h("h1", title),
      h("div.appbar-actions"),
    );
  }

  function renderList() {
    editing = null;
    const templates = getTemplates();
    clear(container);
    const hasAllPresets = presetTemplates().every((p) => templates.some((t) => t.id === p.id));
    container.appendChild(
      h("div.stack",
        backbar("Шаблоны", () => ctx.navigate("#/dashboard")),
        h("button.big-primary", { onclick: () => renderEditor(makeWorkoutTemplate()) }, "Новый шаблон"),
        h("button.secondary", { onclick: loadPresets, style: "flex:none" },
          hasAllPresets
            ? "Обновить готовые тренировки"
            : `Загрузить готовые тренировки (${PRESET_COUNT})`),
        templates.length
          ? h("ul.list",
              ...templates.map((t) => {
                const total = t.tasks.reduce((a, x) => a + (x.targetDistance || 0), 0);
                return h("li.list-item", { onclick: () => renderEditor(clone(t)) },
                  h("div.li-main", t.name),
                  h("div.li-sub", `${t.tasks.length} заданий · ${fmtMeters(total)} м`),
                  h("div.li-chev", "›"),
                );
              })
            )
          : h("p.muted", "Шаблонов пока нет.")
      )
    );
  }

  function loadPresets() {
    // Всегда записываем актуальную версию пресетов (обновляет уже загруженные).
    for (const p of presetTemplates()) saveTemplate(p);
    renderList();
  }

  function renderEditor(tpl) {
    editing = tpl;
    clear(container);

    const nameInput = h("input.field", {
      type: "text", value: tpl.name, placeholder: "Название шаблона",
      oninput: (e) => (tpl.name = e.target.value),
    });

    const taskList = h("div.task-editor");
    function paintTasks() {
      clear(taskList);
      tpl.tasks.forEach((task, i) => taskList.appendChild(taskRow(task, i)));
      if (!tpl.tasks.length) taskList.appendChild(h("p.muted", "Добавьте задания."));
    }
    function taskRow(task, i) {
      return h("div.task-item",
        h("div.task-row",
          h("input.field.grow", {
            type: "text", value: task.name, placeholder: "Название задания",
            oninput: (e) => (task.name = e.target.value),
          }),
          h("input.field.num", {
            type: "number", value: task.targetDistance, min: "0", step: "25", placeholder: "м",
            oninput: (e) => (task.targetDistance = Number(e.target.value) || 0),
          }),
          h("input.field.num", {
            type: "number", value: task.restAfterSec ?? "", min: "0", step: "5", placeholder: "отдых, с",
            oninput: (e) => (task.restAfterSec = e.target.value ? Number(e.target.value) : null),
          }),
          h("button.icon-btn.del", {
            onclick: () => { tpl.tasks.splice(i, 1); paintTasks(); },
            title: "Удалить задание",
          }, "✕"),
        ),
        h("textarea.field.desc", {
          value: task.note || "", rows: "2",
          placeholder: "Описание задания (опц.): техника, стиль, инвентарь…",
          oninput: (e) => (task.note = e.target.value || null),
        }),
      );
    }
    paintTasks();

    const genBtn = isImplemented
      ? h("button.secondary", {
          onclick: () => { tpl.tasks = generate({}); paintTasks(); },
        }, "Сгенерировать")
      : h("button.secondary", {
          disabled: true, title: "Правила автогенерации будут добавлены позже",
        }, "Сгенерировать (позже)");

    clear(container);
    container.appendChild(
      h("div.stack",
        backbar(tpl.id && getTemplates().some((t) => t.id === tpl.id) ? "Изменить шаблон" : "Новый шаблон",
          () => renderList()),
        h("label.field-label", "Название"),
        nameInput,
        h("div.section-head",
          h("h2", "Задания"),
          h("div.row-actions",
            h("button.secondary.sm", {
              onclick: () => { tpl.tasks.push(makeTaskTemplate({ name: "Задание", targetDistance: 100 })); paintTasks(); },
            }, "+ Задание"),
            h("button.secondary.sm", {
              onclick: () => { tpl.tasks.push(...exampleTasks()); paintTasks(); },
              title: "Добавить пример из 3 заданий",
            }, "Пример"),
          ),
        ),
        h("div.hint", "Поля: название · дистанция (м) · отдых (с) · описание — опционально"),
        taskList,
        genBtn,
        h("div.nav-row",
          h("button.big-primary", { onclick: onSave }, "Сохранить"),
          h("button.danger", {
            onclick: () => {
              if (confirm("Удалить шаблон?")) { deleteTemplate(tpl.id); renderList(); }
            },
          }, "Удалить"),
        ),
      )
    );
  }

  function onSave() {
    if (!editing.name.trim()) editing.name = "Без названия";
    editing.tasks = editing.tasks.filter((t) => (t.name || "").trim() || t.targetDistance);
    saveTemplate(editing);
    renderList();
  }

  renderList();
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
