/**
 * Swim Diary — бэкенд на Google Sheets (Google Apps Script).
 *
 * Хранит настройки, шаблоны тренировок и результаты в этой таблице и отдаёт их
 * веб-приложению по HTTP (JSON API). Работает как читать-запись слой вместо
 * localStorage.
 *
 * ── УСТАНОВКА ─────────────────────────────────────────────────────────────
 *  1. Открой таблицу → Расширения → Apps Script.
 *  2. Вставь этот файл целиком в Code.gs (замени содержимое) и Сохрани.
 *  3. Выбери функцию setup() и нажми «Выполнить». Разреши доступ к таблице.
 *     (Создаст листы Settings/Templates/TemplateTasks/Sessions/Results.)
 *  4. Развернуть → Новое развёртывание → тип «Веб-приложение»:
 *        Описание:     swim api
 *        Выполнять как: Я (твой аккаунт)
 *        Есть доступ:   Все (Anyone)
 *     Нажми «Развернуть», разреши, СКОПИРУЙ «URL веб-приложения» (…/exec).
 *  5. Пришли этот URL — я подключу к нему приложение.
 *
 *  Проверка: открой URL в браузере — вернётся JSON {"ok":true,"data":{...}}.
 *  После изменений в коде: Развернуть → Управление развёртываниями →
 *  ✎ (карандаш) → Версия «Новая» → Развернуть (URL остаётся прежним).
 */

// ID этой таблицы (из ссылки). Можно оставить '' если скрипт привязан к таблице.
var SPREADSHEET_ID = '1dBZ_D0bHgAXHHpOg4su7PuUdAtPXHzcxCwcIfX2bRpE';

var SHEETS = {
  settings:      { name: 'Settings',      headers: ['key', 'value'] },
  templates:     { name: 'Templates',     headers: ['templateId', 'name', 'taskCount', 'totalDistance', 'updatedAt'] },
  templateTasks: { name: 'TemplateTasks', headers: ['templateId', 'order', 'taskId', 'name', 'targetDistance', 'stroke', 'restAfterSec', 'note'] },
  sessions:      { name: 'Sessions',      headers: ['sessionId', 'date', 'startTime', 'endTime', 'templateId', 'totalTarget', 'totalSwum', 'totalTimeMs', 'totalLoadMs', 'densityPct'] },
  results:       { name: 'Results',       headers: ['sessionId', 'order', 'taskName', 'target', 'poolLength', 'taskTimeMs', 'swumDistance', 'startTime', 'endTime', 'splitsJSON'] },
};

function ss_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(key) {
  var def = SHEETS[key];
  var ss = ss_();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Запусти вручную ОДИН раз — создаст все листы и дефолтные настройки. */
function setup() {
  Object.keys(SHEETS).forEach(sheet_);
  var sh = sheet_('settings');
  if (sh.getLastRow() < 2) {
    sh.getRange(2, 1, 3, 2).setValues([
      ['poolLength', 25],
      ['keepAwake', true],
      ['showTenths', true],
    ]);
  }
  return 'OK: листы созданы';
}

// ───────────────────────── HTTP ─────────────────────────

function doGet(e) {
  return json_(handle_((e && e.parameter && e.parameter.action) || 'getAll', {}));
}

function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return json_(handle_(req.action || 'getAll', req.payload || {}));
}

function handle_(action, payload) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { ok: false, error: 'busy' }; }
  try {
    if (action === 'getAll') return { ok: true, data: getAll_() };
    if (action === 'batch') {
      // Пачка операций одним запросом (быстро для массовых изменений).
      (payload.ops || []).forEach(function (op) { applyOp_(op.action, op.payload); });
      return { ok: true };
    }
    applyOp_(action, payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    lock.releaseLock();
  }
}

function applyOp_(action, payload) {
  switch (action) {
    case 'saveSettings':   saveSettings_(payload);      break;
    case 'saveTemplate':   saveTemplate_(payload);      break;
    case 'deleteTemplate': deleteTemplate_(payload.id); break;
    case 'addSession':     addSession_(payload);        break;
    case 'deleteSession':  deleteSession_(payload.id);  break;
    case 'importAll':      importAll_(payload);         break;
    default: throw new Error('unknown action: ' + action);
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────── READ ─────────────────────────

function rows_(key) {
  var sh = sheet_(key);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = SHEETS[key].headers;
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (r) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function bool_(v) { return v === true || v === 'true' || v === 1; }

// Дата в "yyyy-MM-dd". Google Sheets мог превратить строку даты в ячейку-дату —
// тогда getValues вернёт Date, и без нормализации получим кривую строку.
function dateStr_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}

function getAll_() {
  // settings
  var settings = { poolLength: 25, units: 'm', keepAwake: true, showTenths: true };
  rows_('settings').forEach(function (r) {
    if (r.key === 'poolLength') settings.poolLength = Number(r.value) || 25;
    else if (r.key === 'keepAwake') settings.keepAwake = bool_(r.value);
    else if (r.key === 'showTenths') settings.showTenths = bool_(r.value);
  });

  // templates + tasks
  var tByT = {};
  rows_('templateTasks').forEach(function (r) {
    (tByT[r.templateId] = tByT[r.templateId] || []).push({
      order: Number(r.order) || 0,
      id: String(r.taskId),
      name: String(r.name),
      targetDistance: Number(r.targetDistance) || 0,
      stroke: r.stroke === '' ? null : (r.stroke == null ? null : String(r.stroke)),
      restAfterSec: (r.restAfterSec === '' || r.restAfterSec == null) ? null : Number(r.restAfterSec),
      note: r.note === '' ? null : (r.note == null ? null : String(r.note)),
    });
  });
  var templates = rows_('templates').map(function (r) {
    var tasks = (tByT[r.templateId] || [])
      .sort(function (a, b) { return a.order - b.order; })
      .map(function (t) { delete t.order; return t; });
    return { id: String(r.templateId), name: String(r.name), tasks: tasks };
  });

  // sessions + results
  var rByS = {};
  rows_('results').forEach(function (r) {
    var splits = [];
    try { splits = JSON.parse(r.splitsJSON || '[]'); } catch (e) {}
    (rByS[r.sessionId] = rByS[r.sessionId] || []).push({
      order: Number(r.order) || 0,
      taskTemplateId: null,
      name: String(r.taskName),
      targetDistance: Number(r.target) || 0,
      poolLength: Number(r.poolLength) || 25,
      startTime: Number(r.startTime) || 0,
      endTime: Number(r.endTime) || 0,
      taskTimeMs: Number(r.taskTimeMs) || 0,
      swumDistance: Number(r.swumDistance) || 0,
      splits: splits,
    });
  });
  var sessions = rows_('sessions').map(function (r) {
    var tasks = (rByS[r.sessionId] || [])
      .sort(function (a, b) { return a.order - b.order; })
      .map(function (t) { delete t.order; return t; });
    return {
      id: String(r.sessionId), date: dateStr_(r.date),
      startTime: Number(r.startTime) || 0, endTime: Number(r.endTime) || 0,
      templateId: r.templateId ? String(r.templateId) : null,
      totalTargetDistance: Number(r.totalTarget) || 0,
      totalSwumDistance: Number(r.totalSwum) || 0,
      totalTimeMs: Number(r.totalTimeMs) || 0,
      totalLoadMs: Number(r.totalLoadMs) || 0,
      tasks: tasks,
    };
  });

  return { settings: settings, templates: templates, sessions: sessions };
}

// ───────────────────────── WRITE ─────────────────────────

function saveSettings_(s) {
  var sh = sheet_('settings');
  clearData_(sh);
  sh.getRange(2, 1, 3, 2).setValues([
    ['poolLength', s.poolLength != null ? s.poolLength : 25],
    ['keepAwake', !!s.keepAwake],
    ['showTenths', !!s.showTenths],
  ]);
}

function saveTemplate_(t) {
  deleteTemplate_(t.id); // upsert = удалить + добавить заново
  var tasks = t.tasks || [];
  var total = tasks.reduce(function (a, x) { return a + (Number(x.targetDistance) || 0); }, 0);
  sheet_('templates').appendRow([t.id, t.name, tasks.length, total, new Date()]);
  var tt = sheet_('templateTasks');
  var rowsToAdd = tasks.map(function (x, i) {
    return [t.id, i, x.id, x.name, x.targetDistance || 0, x.stroke || '',
      x.restAfterSec == null ? '' : x.restAfterSec, x.note || ''];
  });
  if (rowsToAdd.length) {
    tt.getRange(tt.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
  }
}

function deleteTemplate_(id) {
  deleteRowsWhere_('templates', 'templateId', id);
  deleteRowsWhere_('templateTasks', 'templateId', id);
}

function addSession_(s) {
  var dens = s.totalTimeMs ? Math.round((s.totalLoadMs || 0) / s.totalTimeMs * 100) : '';
  sheet_('sessions').appendRow([
    s.id, s.date, s.startTime, s.endTime, s.templateId || '',
    s.totalTargetDistance || 0, s.totalSwumDistance || 0,
    s.totalTimeMs || 0, s.totalLoadMs || 0, dens,
  ]);
  var rs = sheet_('results');
  var tasks = s.tasks || [];
  var rowsToAdd = tasks.map(function (t, i) {
    return [s.id, i, t.name, t.targetDistance || 0, t.poolLength || 25,
      t.taskTimeMs || 0, t.swumDistance || 0, t.startTime || 0, t.endTime || 0,
      JSON.stringify(t.splits || [])];
  });
  if (rowsToAdd.length) {
    rs.getRange(rs.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
  }
}

function deleteSession_(id) {
  deleteRowsWhere_('sessions', 'sessionId', id);
  deleteRowsWhere_('results', 'sessionId', id);
}

function importAll_(data) {
  ['templates', 'templateTasks', 'sessions', 'results'].forEach(function (k) { clearData_(sheet_(k)); });
  if (data.settings) saveSettings_(data.settings);
  (data.templates || []).forEach(saveTemplate_);
  (data.sessions || []).forEach(addSession_);
}

// ───────────────────────── helpers ─────────────────────────

function clearData_(sh) {
  var last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
}

function deleteRowsWhere_(key, col, value) {
  var sh = sheet_(key);
  var last = sh.getLastRow();
  if (last < 2) return;
  var idx = SHEETS[key].headers.indexOf(col);
  var values = sh.getRange(2, idx + 1, last - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === String(value)) sh.deleteRow(i + 2);
  }
}
