// timer.js — секундомеры и форматирование времени.
// Времена везде в МИЛЛИСЕКУНДАХ; форматирование только здесь (на выводе).

const PLACEHOLDER = "—";

function pad(n, len = 2) {
  return String(Math.floor(n)).padStart(len, "0");
}

/**
 * Общее время: Ч:ММ:СС.д (десятые — по флагу).
 * Часы показываем, только если они есть.
 */
export function formatDuration(ms, { tenths = true } = {}) {
  if (ms == null || !isFinite(ms)) return PLACEHOLDER;
  const totalSec = Math.max(0, ms) / 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const d = Math.floor((Math.max(0, ms) % 1000) / 100);
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return tenths ? `${base}.${d}` : base;
}

/**
 * Отрезок 25/50/100: ММ:СС.д. Значение null → прочерк «—».
 */
export function formatSplit(ms, { tenths = true } = {}) {
  if (ms == null || !isFinite(ms)) return PLACEHOLDER;
  const totalSec = Math.max(0, ms) / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const d = Math.floor((Math.max(0, ms) % 1000) / 100);
  const base = `${pad(m)}:${pad(s)}`;
  return tenths ? `${base}.${d}` : base;
}

/**
 * Темп на 100 м из времени и дистанции отрезка → мм:сс / 100 м.
 * ТЗ §6.5: pace = lapTimeMs / stepMeters * 100.
 */
export function formatPace(lapTimeMs, stepMeters) {
  if (!lapTimeMs || !stepMeters) return PLACEHOLDER;
  const per100 = (lapTimeMs / stepMeters) * 100;
  return formatSplit(per100, { tenths: false });
}

export { PLACEHOLDER };
