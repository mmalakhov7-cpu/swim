// screens/activeWorkout.js — ЯДРО: экран во время заплыва (ТЗ §4.3, §6).
// Две фазы:
//   1) «Готовность» — показываем план и кнопку «Старт». Секундомер НЕ идёт.
//   2) «Заплыв» — живые секундомеры, 5 таймеров, +25/+50, Undo, ←/→, финиш.

import { Workout } from "../workout.js";
import { addSession } from "../storage.js";
import { formatDuration, formatSplit } from "../timer.js";
import { h, clear, fmtDistPools, fmtMeters } from "../ui.js";
import { createWakeLock } from "../wakeLock.js";

// Пишем в DOM только при реальном изменении. Важно не только для перформанса:
// на iOS Safari перезапись содержимого элемента во время касания ОТМЕНЯЕТ клик по
// нему — из-за этого «Пауза» (текст которой менялся каждый тик) срабатывала не с
// первого раза.
function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

// Аккуратная иконка «инфо» в кружке (наследует currentColor).
const INFO_SVG =
  '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" ' +
  'stroke-width="1.6"><circle cx="12" cy="12" r="9.2"/>' +
  '<path d="M12 11.2v4.8" stroke-linecap="round"/>' +
  '<circle cx="12" cy="7.9" r="1.05" fill="currentColor" stroke="none"/></svg>';

// Иконка «отмена» (загнутая стрелка назад).
const UNDO_SVG =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';

export function renderActiveWorkout(root, ctx) {
  const pending = ctx.state.pendingStart;
  if (!pending) {
    ctx.navigate("#/prepare");
    return;
  }
  const settings = ctx.settings;

  // План заданий (для превью на экране готовности).
  const plan =
    pending.template && pending.template.tasks && pending.template.tasks.length
      ? pending.template.tasks
      : [{ name: "Свободное плавание", targetDistance: 0 }];
  const totalTarget = plan.reduce((a, t) => a + (t.targetDistance || 0), 0);
  const poolLength = settings.poolLength || 25;

  renderReady();

  // ================= ФАЗА 1: ГОТОВНОСТЬ =================
  function renderReady() {
    root.innerHTML = "";
    root.appendChild(
      h("div.screen",
        h("header.appbar",
          h("button.icon-btn", { onclick: () => ctx.navigate("#/prepare"), title: "Назад" }, "‹"),
          h("h1", "Готовы?"),
          h("div.appbar-actions"),
        ),

        h("section.card",
          h("h2", pending.template ? pending.template.name : "Свободная тренировка"),
          totalTarget
            ? h("div.ready-total",
                h("div.ready-big", fmtDistPools(totalTarget, poolLength)),
                h("div.ready-cap", `${plan.length} заданий · всего`),
              )
            : h("p.muted", "Без плана — просто считаем отсечки."),
          h("ul.plan-list",
            ...plan.map((t, i) =>
              h("li.plan-row",
                h("span.plan-num", `${i + 1}`),
                h("div.plan-mid",
                  h("div.plan-name", t.name),
                  t.note ? h("div.plan-note", t.note) : null,
                ),
                h("span.plan-dist", t.targetDistance ? `${fmtMeters(t.targetDistance)} м` : "свободно"),
              )
            )
          ),
        ),

        // Старт — секундомер пойдёт только отсюда.
        h("button.big-primary.start", { onclick: startWorkout }, "Старт ▶"),
        h("p.hint", "Секундомер начнёт идти после нажатия «Старт»."),
      )
    );
  }

  // ================= ФАЗА 2: ЗАПЛЫВ =================
  function startWorkout() {
    ctx.state.pendingStart = null;
    const tenths = settings.showTenths;
    const workout = new Workout({ template: pending.template, settings, now: Date.now() });
    let finished = false;

    root.innerHTML = "";
    const el = {};
    const timer = (label, extraClass = "") =>
      h(`div.timer${extraClass ? "." + extraClass : ""}`,
        h("div.timer-val", "0:00.0"),
        h("div.timer-label", label),
      );

    const workoutTimer = timer("Тренировка", "big");
    const taskTimer = timer("Задание", "big");
    let sdSig = ""; // сигнатура последней отрисовки таблицы разбивки (кэш)
    let viewIndex = 0; // какое задание СМОТРИМ (не обязательно активное)

    el.totalRemain = h("div.metric-val");
    el.totalSub = h("div.metric-sub");
    el.progBar = h("div.progress-fill");
    el.vLoad = h("div.density-val", "0:00");
    el.vRest = h("div.density-val", "0:00");
    el.vDens = h("div.density-val", "0%");
    el.density = h("div.density-row",
      h("div.density-chip", el.vLoad, h("div.density-label", "Нагрузка")),
      h("div.density-chip", el.vRest, h("div.density-label", "Отдых")),
      h("div.density-chip", el.vDens, h("div.density-label", "Плотность")),
    );
    el.taskName = h("div.task-name");
    el.taskStatus = h("span.task-status");
    el.descBtn = h("button.desc-btn", {
      onclick: toggleDesc, html: INFO_SVG,
      title: "Описание задания", "aria-label": "Описание задания",
    });
    el.descBox = h("div.desc-box hidden");
    el.taskMetricLabel = h("div.metric-label", "Осталось по заданию");
    el.taskRemain = h("div.metric-val");
    el.taskSub = h("div.metric-sub");
    el.toCurrentBtn = h("button.to-current hidden", { onclick: goCurrent }, "● К текущему заданию");
    el.undoBtn = h("button.undo-tap", {
      onclick: onUndo, html: UNDO_SVG,
      title: "Отменить последний сплит", "aria-label": "Отменить последний сплит",
    });
    el.pauseBtn = h("button.ctrl.pause", { onclick: onPause }, "⏸ Пауза");
    el.swipeL = h("span.swipe-hint.left", "‹");
    el.swipeR = h("span.swipe-hint.right", "›");
    el.pagerCount = h("span.pager-count");
    el.restBanner = h("div.rest-banner hidden");
    el.splitTable = h("div.split-table");

    const screen = h("div.screen.active",
      h("section.card.top",
        h("div.hero-row",
          h("div.hero-metric",
            h("div.metric-label", "Осталось по тренировке"),
            el.totalRemain, el.totalSub),
          workoutTimer,
        ),
        h("div.progress", el.progBar),
        el.density,
      ),

      (el.taskCard = h("section.card.task.swipeable",
        h("div.task-viewport",
          (el.taskSlide = h("div.task-slide",
            h("div.task-head-row",
              h("div.task-head-left", el.taskName, el.taskStatus),
              el.descBtn),
            el.descBox,
            h("div.hero-row",
              h("div.hero-metric",
                el.taskMetricLabel,
                el.taskRemain, el.taskSub),
              taskTimer,
            ),
            h("div.task-pager", el.swipeL, el.pagerCount, el.swipeR),
            el.toCurrentBtn,
          )),
        ),
      )),

      el.splitTable,
      el.restBanner,

      // Отсечки + отмена последнего сплита в одной строке.
      h("div.tap-row",
        (el.tap25 = h("button.tap.tap25", { onclick: () => onTap(25) }, "+25 м")),
        (el.tap50 = h("button.tap.tap50", { onclick: () => onTap(50) }, "+50 м")),
        el.undoBtn,
      ),
      // Пауза: останавливает время под нагрузкой (общее продолжает идти).
      el.pauseBtn,
      h("button.secondary.finish", { onclick: onFinish }, "Завершить тренировку"),
    );
    root.appendChild(screen);

    // Свайп по карточке задания: вправо — предыдущее, влево — следующее.
    setupTaskSwipe(el.taskCard);

    const vWorkout = workoutTimer.querySelector(".timer-val");
    const vTask = taskTimer.querySelector(".timer-val");

    const wake = createWakeLock();
    if (settings.keepAwake) wake.enable();

    function tick() {
      const now = Date.now();
      const s = workout.snapshot(now);          // АКТИВНАЯ тренировка (живая)
      const v = workout.viewData(viewIndex, now); // ПРОСМАТРИВАЕМОЕ задание
      const browsing = viewIndex !== workout.currentIndex;

      // Верхняя карточка — всегда по активной тренировке (идёт своим чередом).
      setText(vWorkout, formatDuration(s.elapsedWorkout, { tenths }));
      if (s.totalTarget) {
        setText(el.totalRemain, fmtDistPools(s.remainingTotal, workout.poolLength));
        setText(el.totalSub, `из ${fmtMeters(s.totalTarget)} м`);
        el.progBar.style.width = `${Math.round(s.progress * 100)}%`;
      } else {
        setText(el.totalRemain, `${fmtMeters(s.swumTotal)} м`);
        setText(el.totalSub, "свободное плавание");
        el.progBar.style.width = "0%";
      }
      setText(el.vLoad, formatDuration(s.loadTotal, { tenths: false }));
      setText(el.vRest, formatDuration(s.restTotal, { tenths: false }));
      setText(el.vDens, `${Math.round(s.density * 100)}%`);
      setText(el.pauseBtn, s.paused ? "▶ Продолжить" : "⏸ Пауза");
      el.pauseBtn.classList.toggle("resumed", s.paused);
      screen.classList.toggle("paused", s.paused);

      // ===== Карточка задания и таблица — по ПРОСМАТРИВАЕМОМУ заданию =====
      setText(vTask, formatDuration(v.taskTimeMs, { tenths }));
      renderSplitTable(v);
      setText(el.taskName, v.name);
      setText(el.pagerCount, `${v.index + 1} / ${v.count}`);

      // Статус-бейдж и метка остатка.
      setText(el.taskStatus, v.status === "done" ? "✓ выполнено" : v.status === "upcoming" ? "предстоит" : "");
      el.taskStatus.className = "task-status" + (browsing ? " " + v.status : "");
      if (v.status === "done") {
        setText(el.taskMetricLabel, "Проплыто в задании");
        setText(el.taskRemain, v.target ? fmtDistPools(v.done, workout.poolLength) : `${fmtMeters(v.done)} м`);
        setText(el.taskSub, v.target ? `цель ${fmtMeters(v.target)} м` : "без цели");
      } else if (v.status === "upcoming") {
        setText(el.taskMetricLabel, "Цель задания");
        setText(el.taskRemain, v.target ? fmtDistPools(v.target, workout.poolLength) : "свободно");
        setText(el.taskSub, v.target ? `${fmtMeters(v.target)} м · предстоит` : "без фиксированной цели");
      } else {
        setText(el.taskMetricLabel, "Осталось по заданию");
        if (v.target) {
          setText(el.taskRemain, fmtDistPools(v.remaining, workout.poolLength));
          setText(el.taskSub, `цель ${fmtMeters(v.target)} м`);
        } else {
          setText(el.taskRemain, `${fmtMeters(v.done)} м`);
          setText(el.taskSub, "без фиксированной цели");
        }
      }

      // Описание — по просматриваемому заданию.
      const note = (v.note || "").trim();
      if (note) {
        el.descBtn.style.display = "";
        setText(el.descBox, note);
        if (el.descBox._forTask !== v.index) {
          el.descBox.classList.add("hidden");
          el.descBtn.classList.remove("open");
          el.descBox._forTask = v.index;
        }
      } else {
        el.descBtn.style.display = "none";
        el.descBox.classList.add("hidden");
      }

      // «К текущему» — видна только при просмотре не-активного задания.
      el.toCurrentBtn.classList.toggle("hidden", !browsing);
      el.swipeL.classList.toggle("off", viewIndex === 0);
      el.swipeR.classList.toggle("off", viewIndex >= v.count - 1);

      // Отсечки/Undo относятся к АКТИВНОМУ заданию. При просмотре другого —
      // блокируем (чтобы не путаться), активное при этом продолжает идти.
      el.undoBtn.disabled = browsing || !s.canUndo;
      const rem = s.taskRemaining;
      const targeted = s.taskTarget > 0;
      el.tap25.disabled = browsing || s.paused || (targeted && rem <= 0);
      el.tap50.disabled = browsing || s.paused || (targeted && rem < 50);
    }

    const interval = setInterval(tick, 100);
    tick();

    function onTap(step) {
      workout.tapSplit(step, Date.now());
      buzz();
      const s = workout.snapshot(Date.now());
      if (s.taskTarget > 0 && s.taskDone >= s.taskTarget) {
        if (s.isLastTask) {
          // Последнее задание доплыто → тренировка завершается (время останавливается).
          buzz(40);
          finishFlow();
          return;
        }
        // Задание доплыто → следующее (авто-пауза = отдых). Смотрим уже новое активное.
        workout.nextTask(Date.now());
        viewIndex = workout.currentIndex;
        buzz(30);
        maybeShowRest();
      }
      tick();
    }
    function onUndo() {
      if (workout.undo()) buzz(10);
      tick();
    }
    // «К текущему» — вернуть просмотр на активное задание.
    function goCurrent() {
      if (viewIndex === workout.currentIndex) return;
      const dir = workout.currentIndex > viewIndex ? "next" : "prev";
      animateSwap(dir, () => { viewIndex = workout.currentIndex; tick(); });
    }
    // Свайп = ПРОСМОТР соседнего задания. Активное не меняется, пауза не ставится.
    let animating = false;
    function swipePrev() {
      if (animating || viewIndex === 0) return;
      animateSwap("prev", () => { viewIndex -= 1; tick(); });
    }
    function swipeNext() {
      if (animating || viewIndex >= workout.plan.length - 1) return;
      animateSwap("next", () => { viewIndex += 1; tick(); });
    }
    // Анимация «карусели»: уходящая карточка уезжает в сторону свайпа, а новая
    // одновременно въезжает с другой стороны.
    function animateSwap(dir, commit) {
      const slide = el.taskSlide;
      const vp = slide.parentElement;
      const w = vp.clientWidth || 320;
      const sign = dir === "next" ? -1 : 1; // next → уходим влево
      animating = true;

      // Снимок уходящего задания (клон), поверх вьюпорта.
      const ghost = slide.cloneNode(true);
      ghost.classList.add("ghost");
      vp.appendChild(ghost);

      // Реальный слайд получает новое содержимое и встаёт за краем (входящая сторона).
      commit();
      slide.style.transition = "none";
      slide.style.transform = `translateX(${-sign * w}px)`;
      void slide.offsetWidth; // reflow

      const ease = "transform 240ms cubic-bezier(.22,.61,.36,1)";
      ghost.style.transition = ease;
      slide.style.transition = ease;
      ghost.style.transform = `translateX(${sign * w}px)`;
      slide.style.transform = "translateX(0)";

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        ghost.remove();
        slide.style.transition = "none";
        slide.style.transform = "";
        animating = false;
      };
      slide.addEventListener("transitionend", finish, { once: true });
      setTimeout(finish, 320);
    }
    // Свайп по карточке задания: вправо → предыдущее, влево → следующее.
    function setupTaskSwipe(card) {
      let sx = null, sy = null;
      const reset = () => { sx = sy = null; };
      card.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
      card.addEventListener("pointercancel", reset);
      card.addEventListener("pointerup", (e) => {
        if (sx == null) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        reset();
        // Только явно горизонтальный жест считаем свайпом.
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        if (dx > 0) swipePrev(); else swipeNext();
      });
    }
    function onPause() {
      workout.togglePause(Date.now());
      buzz(20);
      tick();
    }
    function toggleDesc() {
      const hidden = el.descBox.classList.toggle("hidden");
      el.descBtn.classList.toggle("open", !hidden);
    }
    // Таблица разбивки: строки по 25 м, колонки 25 / 50 / 100 м. Время отрезка
    // длины N стоит в своей колонке на строке, где заканчивается этот отрезок
    // (50 — через строку, 100 — через три). Перерисовываем при изменении (кэш sdSig).
    function renderSplitTable(v) {
      const markers = v.markers;
      const done = markers[markers.length - 1].d;
      const target = v.target || 0;
      const sig = v.index + ":" + v.status + ":" + markers.map((m) => m.d + "@" + m.t).join(",") + ":" + target;
      if (sig === sdSig) return;
      sdSig = sig;
      clear(el.splitTable);

      el.splitTable.append(
        h("div.st-head",
          h("span.st-title", "Разбивка задания"),
          h("span.st-sub",
            target ? `${fmtMeters(done)} / ${fmtMeters(target)} м` : `${fmtMeters(done)} м`),
        )
      );

      const maxD = target > 0 ? target : done;
      const nRows = Math.ceil(maxD / 25);
      if (nRows === 0) {
        el.splitTable.append(h("div.st-empty", "Нажимайте +25 / +50 — отрезки появятся здесь."));
        return;
      }

      // Раскладываем на 25-метровые «квадраты». +50 делим пополам (среднее),
      // +25 — точное время. q[i] — время i-го квадрата; est[i] — оценка это или точ.
      const q = [], est = [];
      for (let i = 1; i < markers.length; i++) {
        const seg = markers[i].t - markers[i - 1].t;
        const laps = Math.max(1, Math.round((markers[i].d - markers[i - 1].d) / 25));
        for (let k = 0; k < laps; k++) { q.push(seg / laps); est.push(laps > 1); }
      }
      const doneLaps = q.length;
      // Сумма квадратов [a..b] (1-based), либо null если не все проплыты.
      const sum = (a, b) => { let s = 0; for (let i = a; i <= b; i++) { if (i > doneLaps) return null; s += q[i - 1]; } return s; };

      const grid = h("div.st-grid");
      grid.append(
        h("div.st-row.st-hd",
          h("span.st-c0", "#"), h("span", "25 м"), h("span", "50 м"), h("span", "100 м")),
      );
      for (let i = 1; i <= nRows; i++) {
        const swum = i <= doneLaps;
        // 25 м
        const c25 = swum
          ? h(`span.${est[i - 1] ? "st-est" : "st-val"}`, formatSplit(q[i - 1], { tenths }))
          : h("span.st-dash", "—");
        // 50 м — на чётных строках (сумма пары)
        let c50 = h("span.st-blank", "");
        if (i % 2 === 0) { const s = sum(i - 1, i); c50 = s != null ? h("span.st-val", formatSplit(s, { tenths })) : h("span.st-dash", "—"); }
        // 100 м — каждая 4-я строка (сумма четырёх)
        let c100 = h("span.st-blank", "");
        if (i % 4 === 0) { const s = sum(i - 3, i); c100 = s != null ? h("span.st-val", formatSplit(s, { tenths })) : h("span.st-dash", "—"); }

        // Рамка на крайней (последней проплытой) строке.
        const isLast = swum && i === doneLaps;
        grid.append(
          h(`div.st-row${swum ? "" : ".st-todo"}${isLast ? ".st-last" : ""}`,
            h(`span.st-c0${swum ? ".done" : ""}`, `${i}`),
            c25, c50, c100),
        );
      }
      el.splitTable.append(grid);
    }
    function onFinish() {
      if (confirm("Завершить тренировку и сохранить?")) finishFlow();
    }

    function finishFlow() {
      if (finished) return;
      finished = true;
      const session = workout.finish(Date.now());
      addSession(session);
      stop();
      ctx.navigate(`#/session/${session.id}`);
    }

    function maybeShowRest() {
      const restSec = workout.plan[workout.currentIndex - 1]?.restAfterSec;
      if (!restSec) return;
      let left = restSec;
      const banner = el.restBanner;
      banner.classList.remove("hidden");
      const paint = () => (banner.textContent = `Отдых: ${left} с (тап — пропустить)`);
      paint();
      const restInt = setInterval(() => {
        left -= 1;
        if (left <= 0) { clearInterval(restInt); banner.classList.add("hidden"); }
        else paint();
      }, 1000);
      banner.onclick = () => { clearInterval(restInt); banner.classList.add("hidden"); };
    }

    function buzz(ms = 15) {
      if (navigator.vibrate) { try { navigator.vibrate(ms); } catch {} }
    }
    function stop() {
      clearInterval(interval);
      wake.disable();
    }

    ctx.onCleanup(() => stop());
  }
}
