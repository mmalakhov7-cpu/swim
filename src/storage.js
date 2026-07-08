// storage.js — ЕДИНСТВЕННЫЙ слой доступа к постоянному хранилищу.
// Источник истины для чтения — localStorage (мгновенно, работает офлайн).
// Каждое изменение дополнительно уведомляет подписчика (sync.js), который
// отправляет его в Google Sheets. Так и офлайн работает, и данные в таблице.

import { makeSettings } from "./models.js";

const KEYS = {
  settings: "swim.settings.v1",
  templates: "swim.templates.v1",
  sessions: "swim.sessions.v1",
};

// Подписка на изменения (для синхронизации). emit() вызывается ПОСЛЕ записи.
let mutationHook = null;
export function onMutation(fn) { mutationHook = fn; }
function emit(action, payload) {
  if (mutationHook) {
    try { mutationHook(action, payload); } catch (e) { console.warn("sync hook", e); }
  }
}

/** Заменить локальные данные пришедшими (из синхронизации). Без emit(). */
export function replaceAllLocal(data) {
  if (data.settings) writeJSON(KEYS.settings, makeSettings(data.settings));
  writeJSON(KEYS.templates, data.templates || []);
  writeJSON(KEYS.sessions, data.sessions || []);
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("storage: не удалось прочитать", key, e);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("storage: не удалось записать", key, e);
    return false;
  }
}

// --- Настройки -----------------------------------------------------------
export function getSettings() {
  return makeSettings(readJSON(KEYS.settings, {}));
}

export function saveSettings(settings) {
  writeJSON(KEYS.settings, settings);
  emit("saveSettings", settings);
  return settings;
}

// --- Шаблоны тренировок --------------------------------------------------
export function getTemplates() {
  return readJSON(KEYS.templates, []);
}

export function saveTemplate(template) {
  const list = getTemplates();
  const i = list.findIndex((t) => t.id === template.id);
  if (i >= 0) list[i] = template;
  else list.push(template);
  writeJSON(KEYS.templates, list);
  emit("saveTemplate", template);
  return template;
}

export function deleteTemplate(id) {
  writeJSON(
    KEYS.templates,
    getTemplates().filter((t) => t.id !== id)
  );
  emit("deleteTemplate", { id });
}

// --- Проведённые тренировки ---------------------------------------------
export function getSessions() {
  // Возвращаем отсортированными по времени старта (старые → новые).
  return getSessions_raw().slice().sort((a, b) => a.startTime - b.startTime);
}

function getSessions_raw() {
  return readJSON(KEYS.sessions, []);
}

export function addSession(session) {
  const list = getSessions_raw();
  list.push(session);
  writeJSON(KEYS.sessions, list);
  emit("addSession", session);
  return session;
}

export function deleteSession(id) {
  writeJSON(
    KEYS.sessions,
    getSessions_raw().filter((s) => s.id !== id)
  );
  emit("deleteSession", { id });
}

export function getSession(id) {
  return getSessions_raw().find((s) => s.id === id) || null;
}

// --- Производные величины (истина — в истории тренировок) ----------------
/** Суммарный проплытый объём за всё время, м. */
export function cumulativeVolume() {
  return getSessions_raw().reduce((sum, s) => sum + (s.totalSwumDistance || 0), 0);
}

// --- Экспорт / импорт (бэкап) -------------------------------------------
export function exportAll() {
  return {
    _format: "swim-training-app",
    _version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    templates: getTemplates(),
    sessions: getSessions_raw(),
  };
}

/**
 * Импорт данных из объекта exportAll().
 * mode "replace" — полностью заменить; "merge" — добавить недостающие.
 */
export function importAll(data, mode = "replace") {
  if (!data || data._format !== "swim-training-app") {
    throw new Error("Неизвестный формат файла резервной копии");
  }
  if (mode === "replace") {
    if (data.settings) writeJSON(KEYS.settings, data.settings);
    writeJSON(KEYS.templates, data.templates || []);
    writeJSON(KEYS.sessions, data.sessions || []);
  } else {
    // merge
    const tpl = getTemplates();
    const tplIds = new Set(tpl.map((t) => t.id));
    for (const t of data.templates || []) if (!tplIds.has(t.id)) tpl.push(t);
    writeJSON(KEYS.templates, tpl);

    const ses = getSessions_raw();
    const sesIds = new Set(ses.map((s) => s.id));
    for (const s of data.sessions || []) if (!sesIds.has(s.id)) ses.push(s);
    writeJSON(KEYS.sessions, ses);
  }
  // Синхронизируем итоговое состояние в таблицу (полная замена).
  emit("importAll", exportAll());
}
