// models.js — фабрики и валидация сущностей предметной области.
// Никакой работы с хранилищем/DOM здесь нет — только чистые данные.

/** Надёжный уникальный id с префиксом. */
export function makeId(prefix) {
  const rnd =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rnd}`;
}

/** Настройки приложения (см. ТЗ §5). */
export function makeSettings(overrides = {}) {
  return {
    poolLength: 25, // длина чаши, м
    units: "m",
    keepAwake: true, // не гасить экран во время тренировки
    showTenths: true, // показывать десятые доли секунды в отрезках
    splitGuard: true, // защита от ошибки отсечки: предупреждать о странных отрезках
    avg25Sec: 30, // ориентир: среднее время на 25 м, с (для этой проверки)
    ...overrides,
  };
}

/** Шаблон задания внутри шаблона тренировки. */
export function makeTaskTemplate(overrides = {}) {
  return {
    id: makeId("tt"),
    name: "Задание",
    targetDistance: 100, // м
    stroke: null, // стиль (опц.)
    restAfterSec: null, // отдых после, сек (опц.)
    note: null,
    ...overrides,
  };
}

/** Шаблон тренировки — упорядоченный список заданий. */
export function makeWorkoutTemplate(overrides = {}) {
  return {
    id: makeId("tpl"),
    name: "Новый шаблон",
    tasks: [],
    ...overrides,
  };
}

/** Одна отсечка (нажатие +25/+50). */
export function makeSplit(overrides = {}) {
  return {
    index: 1,
    stepMeters: 25,
    lapTimeMs: 0,
    cumulativeDistance: 0,
    cumulativeTaskTimeMs: 0,
    ...overrides,
  };
}

/** Результат одного задания в проведённой тренировке. */
export function makeTaskResult(overrides = {}) {
  return {
    taskTemplateId: null,
    name: "Задание",
    targetDistance: 0,
    poolLength: 25,
    startTime: 0,
    endTime: 0,
    taskTimeMs: 0,
    swumDistance: 0,
    splits: [],
    ...overrides,
  };
}

/** Проведённая (сохранённая) тренировка. */
export function makeWorkoutSession(overrides = {}) {
  return {
    id: makeId("ws"),
    date: "1970-01-01",
    startTime: 0,
    endTime: 0,
    templateId: null,
    totalTargetDistance: 0,
    totalSwumDistance: 0,
    totalTimeMs: 0,      // общее время (по стенке), мс
    totalLoadMs: 0,      // время под нагрузкой, мс
    tasks: [],
    ...overrides,
  };
}

/** Дата в формате YYYY-MM-DD из ms. */
export function isoDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
