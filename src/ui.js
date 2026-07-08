// ui.js — маленькие DOM-хелперы, общие для экранов. Никакой бизнес-логики.

/**
 * Гиперскрипт: h("button.primary", { onclick }, "текст", childNode, ...).
 * Первый аргумент — "tag.class1.class2#id". props — атрибуты/обработчики (on*).
 */
export function h(tagSpec, props, ...children) {
  const [tagAndId, ...classes] = tagSpec.split(".");
  const [tag, id] = tagAndId.split("#");
  const el = document.createElement(tag || "div");
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(" ");

  if (props && (typeof props !== "object" || props.nodeType || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "class") {
        el.className = [el.className, v].filter(Boolean).join(" ");
      } else if (k === "html") {
        el.innerHTML = v;
      } else if (k in el && k !== "list") {
        try { el[k] = v; } catch { el.setAttribute(k, v); }
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "object" && c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// --- Форматирование чисел для вывода ------------------------------------

/** Разделитель тысяч пробелом: 24350 → "24 350". */
export function fmtMeters(m) {
  return Math.round(m).toLocaleString("ru-RU").replace(/,/g, " ");
}

/** Дистанция + бассейны: «1600 − 64». Бассейны округляем аккуратно. */
export function fmtDistPools(meters, poolLength) {
  const pools = meters / poolLength;
  const poolsStr = Number.isInteger(pools) ? pools : pools.toFixed(1);
  return `${fmtMeters(meters)} − ${poolsStr}`;
}

/** Человекочитаемая длительность тренировки, напр. «1 ч 08 мин». */
export function fmtHuman(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} ч ${String(m).padStart(2, "0")} мин`;
  return `${m} мин`;
}

const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const MONTHS_SHORT = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];

/** Разбирает "YYYY-MM-DD" ИЛИ любую парсируемую дату (в т.ч. кривую строку из
    Google Sheets вроде «Wed Jul 08 2026 …»). Возвращает {y,m,d} или null. */
function parseDate(input) {
  const s = String(input);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] };
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return null;
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** «8 июля 2026». Устойчиво к формату входа. */
export function fmtDateHuman(input) {
  const p = parseDate(input);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : String(input);
}

/** Короткая дата «8 июл» (для оси графика). */
export function fmtDateShort(input) {
  const p = parseDate(input);
  return p ? `${p.d} ${MONTHS_SHORT[p.m - 1]}` : String(input);
}
