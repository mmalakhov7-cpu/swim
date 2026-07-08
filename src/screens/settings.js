// screens/settings.js — настройки + экспорт/импорт (бэкап) данных.

import { getSettings, saveSettings, exportAll, importAll } from "../storage.js";
import { h } from "../ui.js";

export function renderSettings(root, ctx) {
  const s = getSettings();

  function update(patch) {
    saveSettings({ ...getSettings(), ...patch });
    ctx.refreshSettings();
  }

  const screen = h("div.screen",
    h("header.appbar",
      h("button.icon-btn", { onclick: () => ctx.navigate("#/dashboard"), title: "Назад" }, "‹"),
      h("h1", "Настройки"),
      h("div.appbar-actions"),
    ),

    h("section.card",
      h("label.field-label", "Длина чаши бассейна"),
      h("div.seg",
        segBtn("25 м", s.poolLength === 25, () => { update({ poolLength: 25 }); rerender(); }),
        segBtn("50 м", s.poolLength === 50, () => { update({ poolLength: 50 }); rerender(); }),
      ),
      h("p.hint", "Влияет на пересчёт метров в бассейны (25 м → 400 м = 16 бассейнов)."),
    ),

    h("section.card",
      switchRow("Не гасить экран во время тренировки", s.keepAwake, (v) => update({ keepAwake: v })),
      switchRow("Показывать десятые доли секунды", s.showTenths, (v) => update({ showTenths: v })),
    ),

    h("section.card",
      h("h2", "Резервная копия"),
      h("p.hint", "localStorage можно потерять — периодически выгружайте данные в файл."),
      h("div.nav-row",
        h("button.secondary", { onclick: onExport }, "Экспорт в JSON"),
        h("button.secondary", { onclick: () => fileInput.click() }, "Импорт из JSON"),
      ),
    ),
  );

  const fileInput = h("input", {
    type: "file", accept: "application/json,.json", style: "display:none",
    onchange: onImport,
  });
  screen.appendChild(fileInput);
  root.appendChild(screen);

  function rerender() {
    root.innerHTML = "";
    renderSettings(root, ctx);
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `swim-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const mode = confirm(
          "OK — заменить все данные импортируемыми.\nОтмена — объединить (добавить недостающие)."
        ) ? "replace" : "merge";
        importAll(data, mode);
        ctx.refreshSettings();
        alert("Импорт выполнен.");
        ctx.navigate("#/dashboard");
      } catch (err) {
        alert("Не удалось импортировать: " + err.message);
      }
    };
    reader.readAsText(file);
  }
}

function segBtn(label, active, onclick) {
  return h(`button.seg-btn${active ? ".active" : ""}`, { onclick }, label);
}

function switchRow(label, checked, onChange) {
  return h("label.switch-row",
    h("span", label),
    h("input", { type: "checkbox", checked, onchange: (e) => onChange(e.target.checked) }),
  );
}
