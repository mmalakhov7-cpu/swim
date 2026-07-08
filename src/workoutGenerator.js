// workoutGenerator.js — ЗАГЛУШКА автогенерации последовательности заданий.
//
// Правила генерации пользователь предоставит позже (ТЗ §4.2, §12.4). Сейчас модуль
// существует ради стабильного интерфейса: экраны/шаблоны уже могут его звать, а когда
// появятся правила — меняется только тело generate(), без переделки моделей и вызовов.
//
// Контракт: на вход — параметры (цель по объёму, уровень, доступное время и т.п.),
// на выход — массив TaskTemplate-совместимых объектов (см. models.makeTaskTemplate),
// который без изменений кладётся в WorkoutTemplate.tasks.

import { makeTaskTemplate } from "./models.js";

/**
 * @param {object} params — параметры генерации (пока не используются).
 * @returns {Array<object>} список заданий (TaskTemplate-совместимых).
 */
export function generate(params = {}) {
  // TODO: реализовать по правилам пользователя.
  // Пока честно возвращаем пустой список — вызывающая сторона это учитывает.
  return [];
}

/** Признак готовности правил (для UI: показывать ли кнопку «Сгенерировать»). */
export const isImplemented = false;

/** Пример ручного «болвана», чтобы было что показать при демонстрации интерфейса. */
export function exampleTasks() {
  return [
    makeTaskTemplate({ name: "Разминка 400 м", targetDistance: 400 }),
    makeTaskTemplate({ name: "Основная 1200 м", targetDistance: 1200 }),
    makeTaskTemplate({ name: "Заминка 400 м", targetDistance: 400 }),
  ];
}
