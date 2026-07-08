// sync.js — синхронизация localStorage ⇄ Google Sheets (через Apps Script Web App).
//
// Модель офлайн-first:
//   • Чтение/запись у приложения — мгновенно из localStorage (работает без сети).
//   • Каждое изменение попадает в очередь и уходит в таблицу (POST). Если офлайн —
//     копится в очереди и досылается, когда сеть вернётся.
//   • При запуске: сначала досылаем очередь, затем тянем актуальные данные из
//     таблицы (источник истины) и обновляем локально. Первая миграция: если
//     таблица пуста, а локально есть данные — заливаем их в таблицу.

import * as storage from "./storage.js";

// URL веб-приложения Apps Script (…/exec).
const API_URL =
  "https://script.google.com/macros/s/AKfycbyHVEnrYNRKTKUB7RtD4vKE1Jx0XroYm7fqY-HlnTI3qIthU_VXVQYGv5wCfL5no1zKMg/exec";

const QUEUE_KEY = "swim.syncQueue.v1";

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

// POST без заголовка Content-Type: application/json — тело простой текст, чтобы
// браузер не делал preflight (который Apps Script не обрабатывает).
async function apiPost(action, payload) {
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action, payload }) });
  const j = await res.json();
  if (!j || !j.ok) throw new Error((j && j.error) || "api error");
  return j.data;
}
async function apiGetAll() {
  const res = await fetch(API_URL, { method: "GET" });
  const j = await res.json();
  if (!j || !j.ok) throw new Error((j && j.error) || "api error");
  return j.data;
}

let flushing = false;
let batchUnsupported = false; // старый бэкенд без действия 'batch'
async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    // Перечитываем очередь на КАЖДОЙ итерации: во время await enqueue() мог
    // дописать новые элементы в конец. Снимаем ровно отправленное (append — в конец).
    while (true) {
      const q = loadQueue();
      if (!q.length) break;

      if (!batchUnsupported) {
        const ops = q.map((x) => ({ action: x.action, payload: x.payload }));
        try {
          await apiPost("batch", { ops }); // вся очередь одним запросом
          saveQueue(loadQueue().slice(ops.length));
          continue;
        } catch (e) {
          if (String((e && e.message) || e).indexOf("unknown action") >= 0) {
            batchUnsupported = true; // откат на по-одному
          } else {
            throw e; // сеть/иная ошибка — оставляем очередь
          }
        }
      }

      await apiPost(q[0].action, q[0].payload);
      const q2 = loadQueue();
      q2.shift();
      saveQueue(q2);
    }
  } catch (e) {
    // офлайн/ошибка — очередь остаётся на потом
  } finally {
    flushing = false;
  }
}

// Ставим изменение в очередь и пытаемся отправить.
export function enqueue(action, payload) {
  const q = loadQueue();
  q.push({ action, payload, t: Date.now() });
  saveQueue(q);
  flushQueue();
}

let onPulled = null;
let syncing = false;

async function syncNow() {
  if (syncing) return;
  syncing = true;
  try {
    await flushQueue();
    if (loadQueue().length) return; // не всё ушло (офлайн) — не перетираем локальное
    const remote = await apiGetAll();
    const remoteEmpty = !(remote.templates || []).length && !(remote.sessions || []).length;
    const localHasData = storage.getTemplates().length || storage.getSessions().length;
    if (remoteEmpty && localHasData) {
      // Первая миграция: локальные данные → в таблицу.
      await apiPost("importAll", storage.exportAll());
    } else {
      // Таблица — источник истины.
      storage.replaceAllLocal(remote);
      if (onPulled) { try { onPulled(); } catch (e) { console.warn(e); } }
    }
  } catch (e) {
    console.debug("sync: офлайн/ошибка", e && e.message);
  } finally {
    syncing = false;
  }
}

/**
 * Запуск синхронизации. refresh() вызывается после подтягивания данных из
 * таблицы, чтобы перерисовать текущий экран.
 */
export function init(refresh) {
  onPulled = refresh;
  storage.onMutation(enqueue);           // локальные изменения → очередь пуша
  syncNow();                             // первичная синхронизация
  window.addEventListener("online", syncNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncNow();
  });
}

/** Есть ли неотправленные изменения (для индикатора, если понадобится). */
export function pendingCount() {
  return loadQueue().length;
}
