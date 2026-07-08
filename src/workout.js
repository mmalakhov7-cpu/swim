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
      isLastTask: this.isLastTask,
      taskIndex: this.currentIndex,
      taskCount: this.plan.length,
      restAfterSec: p.restAfterSec,
    };
  }
}
