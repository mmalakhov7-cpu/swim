// app.js — точка входа и роутинг экранов (hash-based, без зависимостей).

import { getSettings } from "./storage.js";
import * as sync from "./sync.js";
import { renderDashboard } from "./screens/dashboard.js";
import { renderPrepare } from "./screens/prepare.js";
import { renderActiveWorkout } from "./screens/activeWorkout.js";
import { renderAnalytics } from "./screens/analytics.js";
import { renderTemplates } from "./screens/templates.js";
import { renderSessionDetail } from "./screens/sessionDetail.js";
import { renderSettings } from "./screens/settings.js";

// Общее состояние приложения между экранами.
export const appState = {
  settings: getSettings(),
  pendingStart: null, // { template } — передаётся из «Подготовки» в «Активную»
  refreshSettings() {
    this.settings = getSettings();
  },
};

const view = document.getElementById("view");
let cleanup = null; // функция очистки текущего экрана (интервалы, wake lock)

const ctx = {
  navigate,
  get settings() {
    return appState.settings;
  },
  refreshSettings: () => appState.refreshSettings(),
  state: appState,
  onCleanup: (fn) => {
    cleanup = fn;
  },
};

// Маршруты: точные и с параметром (session/:id).
function resolve(hash) {
  const path = (hash || "#/dashboard").replace(/^#/, "");
  const [, screen, param] = path.split("/");
  switch (screen) {
    case "dashboard":
      return () => renderDashboard(view, ctx);
    case "prepare":
      return () => renderPrepare(view, ctx);
    case "active":
      return () => renderActiveWorkout(view, ctx);
    case "analytics":
      return () => renderAnalytics(view, ctx);
    case "templates":
      return () => renderTemplates(view, ctx);
    case "session":
      return () => renderSessionDetail(view, ctx, param);
    case "settings":
      return () => renderSettings(view, ctx);
    default:
      return () => renderDashboard(view, ctx);
  }
}

function route() {
  // Очистка предыдущего экрана.
  if (typeof cleanup === "function") {
    try { cleanup(); } catch (e) { console.warn(e); }
  }
  cleanup = null;
  view.innerHTML = "";
  const render = resolve(location.hash);
  render();
  window.scrollTo(0, 0);
}

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
// На случай, если DOMContentLoaded уже прошёл к моменту загрузки модуля.
if (document.readyState !== "loading") route();

// Полный запрет масштабирования. Пинч двумя пальцами iOS Safari не отключает
// через viewport/touch-action (доступность), поэтому гасим жесты в JS.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("gestureend", (e) => e.preventDefault());
document.addEventListener(
  "touchmove",
  (e) => { if (e.touches.length > 1) e.preventDefault(); },
  { passive: false }
);

// Синхронизация с Google Sheets. После подтягивания данных — обновляем настройки
// и перерисовываем текущий экран (но не во время активной тренировки).
sync.init(() => {
  appState.refreshSettings();
  if (!location.hash.startsWith("#/active")) route();
});

// Регистрация service worker (офлайн). Не критично для работы.
if ("serviceWorker" in navigator) {
  // Когда новый SW берёт управление — один раз перезагружаем страницу,
  // чтобы подтянуть свежие ресурсы (иначе обновления «залипают» до ручного reload).
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((reg) => {
      // Периодически проверять обновление SW.
      reg.update().catch(() => {});
    }).catch(() => {});
  });
}
