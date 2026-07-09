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
      switchRow("Проверять подозрительные отсечки", s.splitGuard !== false, (v) => { update({ splitGuard: v }); rerender(); }),
      s.splitGuard !== false
        ? h("div.field-inline",
            h("label.field-label", "Среднее время 25 м"),
            h("div.avg-input",
              h("input.field.num", {
                type: "number", inputmode: "numeric", min: "5", max: "180",
                value: String(s.avg25Sec || 30),
                onchange: (e) => { const n = clampSec(e.target.value); e.target.value = String(n); update({ avg25Sec: n }); },
              }),
              h("span.unit", "с"),
            ),
          )
        : null,
      h("p.hint", "Если отрезок оказался заметно длиннее или короче обычного, приложение предложит поправить дистанцию — на случай, если при нажатии перепутали +25 и +50."),
    ),

    h("section.card",
      switchRow("Bluetooth-пульт / педаль", !!s.remoteEnabled, (v) => { update({ remoteEnabled: v }); rerender(); }),
      s.remoteEnabled
        ? h("div.remote-keys",
            remoteRow("Отсечка +25", "remoteKey25", s.remoteKey25),
            remoteRow("Отсечка +50", "remoteKey50", s.remoteKey50),
            remoteRow("Отмена", "remoteKeyUndo", s.remoteKeyUndo),
            remoteRow("Пауза / Продолжить", "remoteKeyPause", s.remoteKeyPause),
          )
        : null,
      h("p.hint", "Педаль или пульт, который шлёт клавиши клавиатуры (не кнопку громкости). Спарь его в настройках Bluetooth iPhone, нажми «Назначить» и кликни кнопку на пульте. Во время тренировки нажатие = отсечка — экран трогать не нужно."),
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

  // Строка «действие — клавиша — Назначить». «Назначить» ждёт следующий keydown
  // (нажатие на пульте) и запоминает его код.
  function remoteRow(label, keyName, current) {
    const btn = h("button.secondary.remote-assign", "Назначить");
    btn.onclick = () => {
      btn.textContent = "Нажми кнопку…";
      btn.classList.add("listening");
      const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener("keydown", onKey, true);
        update({ [keyName]: e.code || e.key });
        rerender();
      };
      document.addEventListener("keydown", onKey, true);
    };
    return h("div.remote-row",
      h("span.remote-label", label),
      h("span.remote-key", prettyKey(current)),
      btn,
    );
  }
}

// Человеко-читаемое имя клавиши по её коду (event.code).
function prettyKey(code) {
  if (!code) return "—";
  const map = {
    Space: "Пробел", Enter: "Enter", NumpadEnter: "Enter", Backspace: "⌫",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    PageUp: "PgUp", PageDown: "PgDn", Tab: "Tab", Escape: "Esc",
  };
  if (map[code]) return map[code];
  if (code.startsWith("Key")) return code.slice(3);    // KeyP → P
  if (code.startsWith("Digit")) return code.slice(5);  // Digit1 → 1
  return code;
}

function clampSec(v) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return 30;
  return Math.min(180, Math.max(5, n));
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
