// splits.js — логика маркеров и отрезков 25/50/100 м (ТЗ §6, ЯДРО КОРРЕКТНОСТИ).
// Чистые функции над массивом маркеров. Никакого DOM/времени внутри —
// текущее время задания (elapsedTask) всегда передаётся аргументом.
//
// Маркер: { d, t } — d метров от начала задания, t мс от начала задания.
// Инвариант: markers[0] = { d: 0, t: 0 }.

import { makeSplit } from "./models.js";

const SPLIT_LENGTHS = [25, 50, 100];

/** Начальный массив маркеров для нового задания (§6.2). */
export function createMarkers() {
  return [{ d: 0, t: 0 }];
}

/**
 * Зафиксировать отсечку шага s ∈ {25,50} на момент времени elapsedTask (§6.2).
 * Мутирует и возвращает массив маркеров.
 */
export function addMarker(markers, stepMeters, elapsedTaskMs) {
  const last = markers[markers.length - 1];
  markers.push({ d: last.d + stepMeters, t: elapsedTaskMs });
  return markers;
}

/** Откатить последнюю отсечку (Undo). Возвращает удалённый маркер или null. */
export function removeLastMarker(markers) {
  if (markers.length <= 1) return null; // маркер {0,0} не удаляем
  return markers.pop();
}

/** Текущая проплытая дистанция задания, м. */
export function currentDistance(markers) {
  return markers[markers.length - 1].d;
}

/**
 * Время последнего завершённого отрезка длины N (§6.3).
 * Ищем маркер M с M.d == currentD − N. Есть → разность времён; нет → null («—»).
 */
export function lastSplitOfLength(markers, N) {
  const last = markers[markers.length - 1];
  const targetD = last.d - N;
  if (targetD < 0) return null;
  // Ищем ТОЧНУЮ границу-маркер. Идём с конца — берём ближайший по времени.
  for (let i = markers.length - 2; i >= 0; i--) {
    if (markers[i].d === targetD) return last.t - markers[i].t;
  }
  return null; // точной границы нет — честный прочерк, не интерполируем
}

/** Значения всех трёх отрезков разом: { 25, 50, 100 } (ms | null). */
export function splitTimers(markers) {
  const out = {};
  for (const N of SPLIT_LENGTHS) out[N] = lastSplitOfLength(markers, N);
  return out;
}

/**
 * Все НЕПЕРЕСЕКАЮЩИЕСЯ отрезки длины N в текущем задании (границы кратны N от 0).
 * Возвращает [{ index, timeMs }] — index = порядковый номер отрезка (1-based).
 * Если точной границы нет (смешанные шаги), такой отрезок пропускается.
 */
export function segmentsOfLength(markers, N) {
  const map = new Map();
  for (const m of markers) map.set(m.d, m.t);
  const maxD = markers[markers.length - 1].d;
  const segs = [];
  for (let d = N; d <= maxD + 1e-6; d += N) {
    if (map.has(d) && map.has(d - N)) {
      segs.push({ index: Math.round(d / N), timeMs: map.get(d) - map.get(d - N) });
    }
  }
  return segs;
}

/**
 * Преобразовать маркеры в массив Split для сохранения (§6.2).
 * По соседним маркерам: шаг = разность d, время отрезка = разность t.
 */
export function toSplits(markers) {
  const splits = [];
  for (let i = 1; i < markers.length; i++) {
    const prev = markers[i - 1];
    const cur = markers[i];
    splits.push(
      makeSplit({
        index: i,
        stepMeters: cur.d - prev.d,
        lapTimeMs: cur.t - prev.t,
        cumulativeDistance: cur.d,
        cumulativeTaskTimeMs: cur.t,
      })
    );
  }
  return splits;
}

export { SPLIT_LENGTHS };
