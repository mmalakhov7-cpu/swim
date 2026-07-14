// workout.js — состояние активной тренировки (машина состояний ядра).
// Оперирует «планом» заданий и маркерами. Время берёт из Date.now() только здесь.
//
// Два времени:
//   • ОБЩЕЕ (по стенке): now − startTime, идёт всегда.
//   • ПОД НАГРУЗКОЙ (load): идёт во время заданий, ОСТАНАВЛИВАЕТСЯ на паузе.
// Время задания и отсечки (§6) считаются по времени НАГРУЗКИ, поэтому паузы и
// остановки не искажают сплиты. «Без нагрузки» = общее − нагрузка. Моторная
// плотность = нагрузка / общее.

import {
  makeWorkoutSession,
  makeTaskResult,
  isoDate,
} from "./models.js";
import {
  createMarkers,
  addMarker,
  removeLastMarker,
  currentDistance,
  splitTimers,
  toSplits,
} from "./splits.js";

export class Workout {
  constructor({ template = null, settings, now }) {
    this.settings = settings;
    this.poolLength = settings.poolLength || 25;
    this.templateId = template ? template.id : null;
    this.startTime = now;
    this.endTime = null;

    // Часы нагрузки.
    this.loadAccum = 0;      // накопленное время под нагрузкой, мс
    this.loadRunning = true; // идут ли часы нагрузки (false = пауза)
    this.loadResumeAt = now; // момент последнего запуска часов нагрузки

    const tasks = template && template.tasks && template.tasks.length
      ? template.tasks
      : [{ id: null, name: "Свободное плавание", targetDistance: 0 }];

    this.plan = tasks.map((t) => ({
      taskTemplateId: t.id || null,
      name: t.name || "Задание",
      targetDistance: t.targetDistance || 0,
      restAfterSec: t.restAfterSec || null,
      stroke: t.stroke || null,
      note: t.note || null,
    }));

    this.completed = [];
    this.currentIndex = 0;
    this.planEdited = false; // план правили на ходу → предложить сохранить в шаблон
    this._beginTask(now);
  }

  /** Текущее время под нагрузкой, мс. */
  _loadNow(now) {
    return this.loadAccum + (this.loadRunning ? now - this.loadResumeAt : 0);
  }

  _beginTask(now) {
    this.taskStartWall = now;               // для записи (startTime задания)
    this.taskStartLoad = this._loadNow(now); // отметка нагрузки на старте задания
    this.markers = createMarkers();
  }

  get currentPlan() {
    return this.plan[this.currentIndex] || null;
  }

  get isLastTask() {
    return this.currentIndex >= this.plan.length - 1;
  }

  get totalTargetDistance() {
    return this.plan.reduce((s, t) => s + (t.targetDistance || 0), 0);
  }

  get completedDistance() {
    return this.completed.reduce((s, t) => s + t.swumDistance, 0);
  }

  get swumTotal() {
    return this.completedDistance + currentDistance(this.markers);
  }

  // --- Пауза (незапланированная остановка) --------------------------------

  /** Пауза: часы нагрузки замирают, общее время продолжает идти. */
  pause(now) {
    if (!this.loadRunning) return;
    this.loadAccum += now - this.loadResumeAt;
    this.loadRunning = false;
  }

  /** Продолжить: часы нагрузки снова идут. */
  resume(now) {
    if (this.loadRunning) return;
    this.loadResumeAt = now;
    this.loadRunning = true;
  }

  togglePause(now) {
    this.loadRunning ? this.pause(now) : this.resume(now);
    return !this.loadRunning; // вернём true, если теперь на паузе
  }

  // --- Действия во время заплыва -----------------------------------------

  /** Отсечка шага step ∈ {25,50}. Время маркера — по нагрузке. */
  tapSplit(step, now) {
    addMarker(this.markers, step, this._loadNow(now) - this.taskStartLoad);
  }

  undo() {
    return removeLastMarker(this.markers) !== null;
  }

  /**
   * «Защита от дурака»: анализ ТОЛЬКО ЧТО записанного отрезка (§4.3).
   * Если время отрезка сильно расходится с ориентиром «среднее 25 м», значит
   * при нажатии +25/+50, вероятно, ошиблись с дистанцией. Возвращает объект
   * с вариантами коррекции или null (проверка выключена / данных мало / всё ок).
   *   kind: 'slow' — слишком долго → проплыл БОЛЬШЕ, чем нажали.
   *   kind: 'fast' — слишком быстро → проплыл МЕНЬШЕ, чем нажали.
   */
  checkLastSplit() {
    const g = this.settings || {};
    if (g.splitGuard === false) return null;
    const avgSec = Number(g.avg25Sec);
    if (!avgSec || avgSec <= 0) return null;

    const m = this.markers;
    if (m.length < 2) return null;
    const last = m[m.length - 1];
    const prev = m[m.length - 2];
    const step = last.d - prev.d;   // 25 или 50 — как нажали
    const segMs = last.t - prev.t;  // фактическое время отрезка
    if (step <= 0 || segMs <= 0) return null;

    const avgMs = avgSec * 1000;
    const laps = step / 25;                 // столько «квадратов» по мнению приложения
    const impliedPerLap = segMs / laps;     // подразумеваемый темп на 25 м
    const HI = 1.6, LO = 0.6;

    let kind = null;
    if (impliedPerLap > avgMs * HI) kind = "slow";
    else if (laps > 1 && impliedPerLap < avgMs * LO) kind = "fast";
    if (!kind) return null;

    // Варианты дистанции (кратные 25) с темпом на 25 м для каждой — чтобы тренер
    // сам выбрал по «читаемости» темпа. Наиболее вероятная — на один шаг в сторону.
    const options = [25, 50, 75, 100].map((d) => ({ dist: d, perLap: segMs / (d / 25) }));
    const suggested = kind === "slow" ? Math.min(100, step + 25) : Math.max(25, step - 25);
    return { kind, step, segMs, impliedPerLap, avgMs, options, suggested };
  }

  /** Исправить дистанцию последнего отрезка, СОХРАНИВ его время (коррекция отсечки). */
  setLastStep(newDist) {
    const m = this.markers;
    if (m.length < 2) return;
    m[m.length - 1].d = m[m.length - 2].d + newDist;
  }

  // --- Редактирование плана НА ХОДУ (§ план менялся по факту) ---------------
  // Прошедшие задания трогать нельзя (уже проплыты). Текущее — можно менять цель
  // (не ниже уже проплытого). Предстоящие — цель/удаление/добавление.

  /** Изменить цель задания (текущего или предстоящего), кратно 25 м. */
  setTaskTarget(index, meters) {
    if (index < this.currentIndex) return false; // прошедшее — заблокировано
    const p = this.plan[index];
    if (!p) return false;
    let t = Math.max(0, Math.round(meters / 25) * 25);
    if (index === this.currentIndex) {
      const done = currentDistance(this.markers);
      t = Math.max(t, Math.ceil(done / 25) * 25); // не меньше уже проплытого
    }
    if (p.targetDistance !== t) this.planEdited = true;
    p.targetDistance = t;
    return true;
  }

  /** Удалить ПРЕДСТОЯЩЕЕ задание (текущее/прошедшие — нельзя). */
  removeTask(index) {
    if (index <= this.currentIndex || index >= this.plan.length) return false;
    this.plan.splice(index, 1);
    this.planEdited = true;
    return true;
  }

  /** Добавить задание в конец плана. */
  addTask({ name = "Доп. задание", targetDistance = 100 } = {}) {
    this.plan.push({
      taskTemplateId: null,
      name,
      targetDistance: Math.max(25, Math.round(targetDistance / 25) * 25),
      restAfterSec: null, stroke: null, note: null,
    });
    this.planEdited = true;
  }

  /** Обрезать план: убрать все задания после текущего (завершаем на нём). */
  truncateAfterCurrent() {
    if (this.plan.length > this.currentIndex + 1) this.planEdited = true;
    this.plan.splice(this.currentIndex + 1);
  }

  _finalizeCurrentTask(now) {
    const p = this.currentPlan;
    const result = makeTaskResult({
      taskTemplateId: p.taskTemplateId,
      name: p.name,
      targetDistance: p.targetDistance,
      poolLength: this.poolLength,
      startTime: this.taskStartWall,
      endTime: now,
      taskTimeMs: this._loadNow(now) - this.taskStartLoad, // время под нагрузкой
      swumDistance: currentDistance(this.markers),
      splits: toSplits(this.markers),
    });
    this.completed.push(result);
    return result;
  }

  nextTask(now) {
    this._finalizeCurrentTask(now);
    if (this.isLastTask) return { done: true };
    this.currentIndex += 1;
    this._beginTask(now);
    // Задание завершено → авто-пауза (отдых). Нагрузка следующего задания
    // начнёт считаться только после «Продолжить». Общее время идёт всегда.
    this.pause(now);
    return { done: false };
  }

  prevTask(now) {
    if (this.currentIndex === 0 || this.completed.length === 0) return false;
    this.currentIndex -= 1;
    const prev = this.completed.pop();
    this.markers = [{ d: 0, t: 0 }];
    for (const sp of prev.splits) {
      this.markers.push({ d: sp.cumulativeDistance, t: sp.cumulativeTaskTimeMs });
    }
    // Продолжаем время задания (по нагрузке) с ранее накопленного значения.
    const lastT = this.markers[this.markers.length - 1].t;
    this.taskStartLoad = this._loadNow(now) - lastT;
    this.taskStartWall = now;
    return true;
  }

  finish(now) {
    if (this.completed.length <= this.currentIndex) {
      this._finalizeCurrentTask(now);
    }
    this.endTime = now;
    const totalSwum = this.completed.reduce((s, t) => s + t.swumDistance, 0);
    return makeWorkoutSession({
      date: isoDate(this.startTime),
      startTime: this.startTime,
      endTime: now,
      templateId: this.templateId,
      totalTargetDistance: this.totalTargetDistance,
      totalSwumDistance: totalSwum,
      totalTimeMs: now - this.startTime,
      totalLoadMs: this._loadNow(now), // суммарно под нагрузкой
      tasks: this.completed,
    });
  }

  // --- Данные для отрисовки ----------------------------------------------

  /**
   * Данные ЛЮБОГО задания для просмотра (без изменения активного).
   * status: 'done' | 'active' | 'upcoming'. Для done берём записанный результат,
   * для active — живые значения, для upcoming — план.
   */
  viewData(index, now) {
    const count = this.plan.length;
    const p = this.plan[index];
    const pool = this.poolLength;
    let status, name, target, done, taskTimeMs, markers;

    if (index === this.currentIndex) {
      status = "active";
      name = p.name; target = p.targetDistance;
      done = currentDistance(this.markers);
      taskTimeMs = this._loadNow(now) - this.taskStartLoad;
      markers = this.markers;
    } else if (index < this.currentIndex) {
      status = "done";
      const r = this.completed[index];
      name = r.name; target = r.targetDistance;
      done = r.swumDistance; taskTimeMs = r.taskTimeMs;
      markers = [{ d: 0, t: 0 }];
      for (const sp of r.splits) markers.push({ d: sp.cumulativeDistance, t: sp.cumulativeTaskTimeMs });
    } else {
      status = "upcoming";
      name = p.name; target = p.targetDistance;
      done = 0; taskTimeMs = 0; markers = [{ d: 0, t: 0 }];
    }

    const remaining = target ? Math.max(0, target - done) : null;
    return {
      index, count, status, name, note: p.note, target, done,
      remaining, poolsRemaining: target ? remaining / pool : null,
      taskTimeMs, markers, isActive: status === "active",
    };
  }

  snapshot(now) {
    const p = this.currentPlan;
    const taskDone = currentDistance(this.markers);
    const timers = splitTimers(this.markers);
    const swumTotal = this.swumTotal;
    const totalTarget = this.totalTargetDistance;

    const elapsedWorkout = now - this.startTime;
    const loadTotal = this._loadNow(now);
    const restTotal = Math.max(0, elapsedWorkout - loadTotal);
    const density = elapsedWorkout > 0 ? loadTotal / elapsedWorkout : 0;

    return {
      // времена
      elapsedWorkout,               // общее (по стенке)
      elapsedTask: loadTotal - this.taskStartLoad, // время задания (под нагрузкой)
      loadTotal,                    // всего под нагрузкой
      restTotal,                    // всего без нагрузки
      density,                      // моторная плотность 0..1
      paused: !this.loadRunning,
      // прогресс тренировки
      totalTarget,
      swumTotal,
      remainingTotal: totalTarget ? Math.max(0, totalTarget - swumTotal) : null,
      poolsTotal: totalTarget ? Math.max(0, totalTarget - swumTotal) / this.poolLength : null,
      progress: totalTarget ? Math.min(1, swumTotal / totalTarget) : null,
      // текущее задание
      taskName: p.name,
      taskNote: p.note,
      taskTarget: p.targetDistance,
      taskDone,
      taskRemaining: p.targetDistance ? Math.max(0, p.targetDistance - taskDone) : null,
      taskPoolsRemaining: p.targetDistance ? Math.max(0, p.targetDistance - taskDone) / this.poolLength : null,
      // отрезки
      split25: timers[25],
      split50: timers[50],
      split100: timers[100],
      // мета
      canUndo: this.markers.length > 1,
      // шаг последнего отрезка (25/50) — для подсветки последней нажатой кнопки
      lastStepMeters: this.markers.length >= 2
        ? this.markers[this.markers.length - 1].d - this.markers[this.markers.length - 2].d
        : 0,
      isLastTask: this.isLastTask,
      taskIndex: this.currentIndex,
      taskCount: this.plan.length,
      restAfterSec: p.restAfterSec,
    };
  }
}
