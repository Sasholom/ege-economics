(() => {
'use strict';

const DATA = JSON.parse(document.getElementById('tasks-data').textContent);
const TASKS = DATA.tasks;
const TYPES = [...new Set(TASKS.map(t => t.type))];
const LEVELS = {1: 'Начинающий', 2: 'Базовый', 3: 'Уверенный', 4: 'Сильный'};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const typeNo = t => +(t.type.match(/Тип (\d+)/) || [0, 0])[1];

/* ------------------------------------------------------------ хранилище */
const store = {
  get(k, def) { try { const v = localStorage.getItem('eco-' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('eco-' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('eco-' + k); } catch (e) {} },
};
const settings = () => Object.assign({mode: 'builtin', code: '', url: '', key: '', model: ''}, store.get('settings', {}));
const isReady = s => s.mode === 'own' ? !!(s.url && s.key && s.model) : !!s.code;
const profile = () => store.get('profile', {types: {}, note: ''});
const solved = () => new Set(store.get('solved', []));
const stats = () => store.get('stats', {});

/* ------------------------------------------------------------ даты и активность */
const iso = d => d.toLocaleDateString('sv-SE');
const today = () => iso(new Date());
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
function touchDay() {
  const days = store.get('days', []), t = today();
  if (days[days.length - 1] !== t) { days.push(t); store.set('days', days.slice(-400)); }
}
function streak() {
  const days = new Set(store.get('days', []));
  let d = today();
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ------------------------------------------------------------ статистика задач и повторение */
const REVIEW_STEPS = [1, 3, 7];     // через сколько дней повторить: после ошибки, потом ещё дважды
function updStat(n, fn) { const all = stats(); all[n] = fn(all[n] || {w: 0}); store.set('stats', all); }
function noteWrong(n) {
  updStat(n, s => ({...s, w: (s.w || 0) + 1, box: 0, due: addDays(today(), REVIEW_STEPS[0])}));
}
function noteReveal(n) {
  if (solved().has(n) && !(stats()[n] || {}).due) return;
  updStat(n, s => ({...s, r: true, due: s.due || addDays(today(), REVIEW_STEPS[0]), box: s.box || 0}));
}
function noteCorrect(n, viaTutor) {
  updStat(n, s => {
    const out = {...s};
    if (viaTutor) out.t = true;
    if (!solved().has(n) && !s.r && !s.w) out.clean = true;
    if (s.due && s.due <= today()) {
      out.box = (s.box || 0) + 1;
      out.due = out.box >= REVIEW_STEPS.length ? null : addDays(today(), REVIEW_STEPS[out.box]);
    }
    return out;
  });
}
const dueTasks = () => Object.entries(stats()).filter(([, s]) => s.due && s.due <= today()).map(([n]) => +n);
const reviewTasks = () => Object.entries(stats()).filter(([, s]) => s.due).map(([n]) => +n);

/* ------------------------------------------------------------ формулы */
const MATH = {delimiters: [
  {left: '$$', right: '$$', display: true}, {left: '\\[', right: '\\]', display: true},
  {left: '$', right: '$', display: false}, {left: '\\(', right: '\\)', display: false}],
  throwOnError: false};
function renderMath(el) { if (window.renderMathInElement) window.renderMathInElement(el, MATH); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])); }

/* ------------------------------------------------------------ уведомления */
function toast(html) {
  const box = $('#toasts'), el = document.createElement('div');
  el.className = 'toast'; el.innerHTML = html;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

/* ------------------------------------------------------------ тема */
$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('eco-theme', next); } catch (e) {}
});

/* ------------------------------------------------------------ страница */
renderMath($('#app'));

function openTask(n) {
  const art = document.getElementById('task-' + n);
  if (!art) return;
  art.closest('.task-group').open = true;
  art.hidden = false;
  art.scrollIntoView({behavior: 'smooth', block: 'start'});
  art.classList.remove('flash'); void art.offsetWidth; art.classList.add('flash');
}

document.addEventListener('click', e => {
  const chip = e.target.closest('.type-nav a');
  if (chip) {
    e.preventDefault();
    const g = document.querySelector(chip.getAttribute('href'));
    g.open = true; g.scrollIntoView({behavior: 'smooth', block: 'start'});
    return;
  }
  const go = e.target.closest('[data-open-task]');
  if (go) { openTask(+go.dataset.openTask); return; }
  const line = e.target.closest('.sol-line');
  if (!line) return;
  const hint = line.nextElementSibling, open = line.getAttribute('aria-expanded') === 'true';
  line.setAttribute('aria-expanded', String(!open));
  hint.hidden = open;
});

// Кнопки «Как решать / Решение / Ответ» стоят в одном ряду, панели раскрываются под ними.
// Открыл решение или ответ, не решив, — задача уходит на повторение.
document.addEventListener('click', e => {
  const btn = e.target.closest('.reveal-btn');
  if (!btn) return;
  const row = btn.closest('.reveal-row');
  const panel = row.querySelector(`:scope > .reveal-panel[data-panel="${btn.dataset.panel}"]`);
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  panel.hidden = !open;
  if (!open || btn.dataset.panel === 'steps' || btn.closest('.sim-card')) return;
  const n = +btn.closest('.prototype').dataset.task;
  if (!solved().has(n)) { noteReveal(n); touchDay(); refresh(); }
});

function nums(s) {
  return (String(s).replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1').match(/-?\d+(?:[.,]\d+)?/g) || [])
    .map(x => parseFloat(x.replace(',', '.')));
}
function sameNum(a, b) {
  return [1, 1e3, 1e6, 1e9, 1e-3, 1e-6].some(k => Math.abs(a * k - b) < 1e-6 * Math.max(1, Math.abs(b)));
}
function checkAnswer(answer, input) {
  let need = nums(answer);
  if (!need.length && /восьм/i.test(answer)) need = [8];
  const got = nums(input.replace(/восьм\S*/i, '8'));
  return need.length > 0 && got.length > 0 && need.every(a => got.some(g => sameNum(a, g)));
}

$$('.prototype .answer-check').forEach(form => form.addEventListener('submit', e => {
  e.preventDefault();
  const task = TASKS[form.dataset.task - 1], input = form.querySelector('input'), out = form.querySelector('.check-result');
  if (!input.value.trim()) return;
  const ok = checkAnswer(task.answer, input.value);
  out.textContent = ok ? 'Верно!' : 'Пока неверно';
  out.className = 'check-result ' + (ok ? 'ok' : 'bad');
  touchDay();
  if (ok) { noteCorrect(task.n); markSolved(task.n); } else { noteWrong(task.n); refresh(); }
}));

function markSolved(n) {
  const s = solved(); s.add(n); store.set('solved', [...s]); touchDay(); refresh();
}

function overallLevel() {
  const v = Object.values(profile().types).map(t => t.level).filter(Boolean);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

function paintProgress() {
  const s = solved();
  $$('.prototype').forEach(a => a.classList.toggle('solved', s.has(+a.dataset.task)));
  $('#progress-fill').style.width = (s.size / TASKS.length * 100) + '%';
  $('#progress-text').textContent = `Решено ${s.size} из ${TASKS.length}`;
  $('#stat-solved').textContent = s.size;
  const C = 2 * Math.PI * 52;
  $('#ring-fg').style.strokeDasharray = C;
  $('#ring-fg').style.strokeDashoffset = C * (1 - s.size / TASKS.length);
  $$('.task-group[data-group]').forEach(g => {
    const arts = [...g.querySelectorAll('.prototype')], done = arts.filter(a => s.has(+a.dataset.task)).length;
    const c = g.querySelector('.task-count');
    c.dataset.orig = c.dataset.orig || c.textContent;
    c.textContent = done ? `${done} / ${arts.length} решено` : c.dataset.orig;
    c.classList.toggle('done', done === arts.length);
    const chip = document.querySelector(`.type-nav a[data-group="${g.dataset.group}"]`);
    if (chip) chip.classList.toggle('done', done === arts.length);
  });
  $('#level-dot').dataset.level = overallLevel() || '';
  const st = streak();
  $('#stat-streak').textContent = st;
  $('#stat-streak-label').textContent = st === 1 ? 'день подряд' : st >= 2 && st <= 4 ? 'дня подряд' : 'дней подряд';
}

/* ------------------------------------------------------------ блок «Повторить» */
function paintReview() {
  const due = dueTasks(), all = reviewTasks(), box = $('#review');
  box.hidden = !all.length;
  if (!all.length) return;
  const later = all.length - due.length;
  $('#review-title').textContent = due.length ? `Пора повторить: ${due.length}` : 'Повторение';
  $('#review-sub').textContent = due.length
    ? 'Задачи, где была ошибка или вы смотрели решение. Реши их снова без подсказок.'
    : `Сегодня всё повторено. Ещё ${later} ${later === 1 ? 'задача ждёт' : 'задачи ждут'} своего дня.`;
  $('#review-list').innerHTML = due.map(n => {
    const t = TASKS[n - 1];
    return `<button type="button" class="review-chip" data-open-task="${n}"><b>${n}</b>${esc(t.type.replace(/^Тип \d+\.\s*/, ''))}</button>`;
  }).join('');
}

/* ------------------------------------------------------------ достижения */
const ACH = [
  {id: 'first', icon: '🌱', name: 'Первый шаг', desc: 'Решить первую задачу', test: c => c.solved >= 1},
  {id: 'five', icon: '✋', name: 'Пятёрка', desc: 'Решить 5 задач', test: c => c.solved >= 5},
  {id: 'half', icon: '🌗', name: 'Полпути', desc: 'Решить 25 задач', test: c => c.solved >= 25},
  {id: 'all', icon: '🏆', name: 'Все 50', desc: 'Решить все задачи сайта', test: c => c.solved >= TASKS.length},
  {id: 'credit', icon: '🏦', name: 'Кредитный эксперт', desc: 'Решить все задачи типов 1–8', test: c => c.typeDone(k => k <= 8)},
  {id: 'deposit', icon: '💰', name: 'Вкладчик', desc: 'Решить все задачи на вклады', test: c => c.typeDone(k => k === 9)},
  {id: 'optimum', icon: '📈', name: 'Оптимизатор', desc: 'Решить все задачи на оптимизацию', test: c => c.typeDone(k => k === 10)},
  {id: 'clean', icon: '🎯', name: 'Без подсказок', desc: '10 задач с первой попытки, не открывая решение', test: c => c.clean >= 10},
  {id: 'tutor', icon: '🤝', name: 'В паре с репетитором', desc: 'Довести задачу до ответа вместе с репетитором', test: c => c.tutor >= 1},
  {id: 'review', icon: '🔁', name: 'Работа над ошибками', desc: 'Повторить задачу и решить её верно', test: c => c.reviewed >= 1},
  {id: 'hunter', icon: '🔎', name: 'Охотник за задачами', desc: 'Решить 5 похожих задач с «Решу ЕГЭ»', test: c => c.sim >= 5},
  {id: 'week', icon: '🔥', name: 'Неделя подряд', desc: 'Заниматься 7 дней подряд', test: c => c.streak >= 7},
];
function achContext() {
  const s = solved(), st = stats(), vals = Object.values(st);
  return {
    solved: s.size,
    clean: vals.filter(x => x.clean).length,
    tutor: vals.filter(x => x.t).length + store.get('simTutor', 0),
    reviewed: vals.filter(x => (x.box || 0) >= 1).length,
    sim: store.get('simSolved', []).length,
    streak: streak(),
    typeDone: pred => TASKS.filter(t => pred(typeNo(t))).every(t => s.has(t.n)),
  };
}
function checkAch(silent) {
  const ctx = achContext(), got = new Set(store.get('ach', []));
  const fresh = ACH.filter(a => !got.has(a.id) && a.test(ctx));
  if (!fresh.length) return;
  fresh.forEach(a => got.add(a.id));
  store.set('ach', [...got]);
  if (!silent) fresh.forEach(a => toast(`<span class="toast-icon">${a.icon}</span><span><b>Достижение: ${esc(a.name)}</b><br>${esc(a.desc)}</span>`));
}

function refresh() { paintProgress(); paintReview(); applyFilter(); checkAch(); }

/* ------------------------------------------------------------ поиск и фильтры */
const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/(\d)[\s  ]+(?=\d)/g, '$1').replace(/[{}$\\]/g, '');
const INDEX = TASKS.map(t => norm(`задача ${t.n} ${t.type} ${t.cond}`));
let filter = 'all';
function applyFilter() {
  const q = norm($('#search').value.trim());
  const s = solved(), rev = new Set(reviewTasks());
  const active = q || filter !== 'all';
  let shown = 0;
  $$('.task-group[data-group]').forEach(g => {
    let any = 0;
    g.querySelectorAll('.prototype').forEach(a => {
      const n = +a.dataset.task;
      const byFilter = filter === 'all' || (filter === 'todo' && !s.has(n)) || (filter === 'done' && s.has(n)) || (filter === 'review' && rev.has(n));
      const ok = byFilter && (!q || q.split(/\s+/).every(w => INDEX[n - 1].includes(w)));
      a.hidden = !ok;
      if (ok) any++;
    });
    g.hidden = !any;
    if (active && any && !g.dataset.wasOpen) { g.dataset.wasOpen = g.open ? '1' : '0'; g.open = true; }
    if (!active && g.dataset.wasOpen) { g.open = g.dataset.wasOpen === '1'; delete g.dataset.wasOpen; }
    shown += any;
  });
  $('#no-results').hidden = shown > 0;
  $('#filter-count').textContent = active ? `Найдено: ${$$('.prototype:not([hidden])').length}` : '';
}
$('#search').addEventListener('input', applyFilter);
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  filter = b.dataset.filter;
  $$('#filters [data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  applyFilter();
});

/* ------------------------------------------------------------ похожие задачи с «Решу ЕГЭ» */
// На сайте хранится только номер задачи на «Решу ЕГЭ», её тип, ответ и источник.
// Само условие открывается на «Решу ЕГЭ» — так задача остаётся у авторов.
const SIMILAR = DATA.similar || [];
const SDAM = id => `https://math-ege.sdamgia.ru/problem?id=${id}`;
function pickSimilar(task, exceptId) {
  const k = typeNo(task);
  let pool = SIMILAR.filter(i => i.t.includes(k));
  if (pool.length < 3) pool = SIMILAR.filter(i => i.t.includes(k <= 8 ? 8 : 11));
  if (!pool.length) return null;
  const seen = new Set(store.get('seen', []));
  let fresh = pool.filter(i => !seen.has(i.id) && i.id !== exceptId);
  if (!fresh.length) fresh = pool.filter(i => i.id !== exceptId);
  if (!fresh.length) fresh = pool;
  const it = fresh[Math.floor(Math.random() * fresh.length)];
  seen.add(it.id); store.set('seen', [...seen].slice(-600));
  return it;
}

function showSimilar(n, exceptId) {
  const task = TASKS[n - 1], box = document.querySelector(`.similar[data-task="${n}"]`);
  const it = pickSimilar(task, exceptId);
  box.hidden = false;
  if (!it) { box.innerHTML = '<div class="sim-card"><p class="muted">Похожих задач этого типа пока нет.</p></div>'; return; }
  const simSolved = new Set(store.get('simSolved', []));
  box.innerHTML = `<div class="sim-card${simSolved.has(it.id) ? ' solved' : ''}">
    <div class="sim-head"><b>Похожая задача</b><button type="button" class="icon-btn sim-close" title="Скрыть">×</button></div>
    <a class="sim-open" href="${SDAM(it.id)}" target="_blank" rel="noopener">
      <span class="sim-num">№ ${it.id}</span>
      <span><b>Открыть условие на «Решу ЕГЭ»</b><small>Откроется в новой вкладке. Реши и введи ответ здесь.</small></span>
    </a>
    <p class="sim-source">Взято с «Решу ЕГЭ» · задание № ${it.id}${it.o ? ' · ' + esc(it.o) : ''}</p>
    <div class="task-actions">
      <form class="answer-check"><input type="text" autocomplete="off" placeholder="Ваш ответ" aria-label="Ответ к задаче № ${it.id}"><button type="submit">Проверить</button><span class="check-result" role="status"></span></form>
      <button class="tutor-start sim-tutor" type="button">Решать с репетитором</button>
    </div>
    <div class="reveal-row"><div class="reveal-tabs"><button type="button" class="chip-btn sim-more">Другая задача</button><button class="reveal-btn" type="button" data-panel="answer" aria-expanded="false">Ответ</button></div><div class="reveal-panel" data-panel="answer" hidden><div class="answer">${esc(it.a)}</div></div></div>
  </div>`;
  box.querySelector('.sim-close').onclick = () => { box.hidden = true; box.innerHTML = ''; };
  box.querySelector('.sim-more').onclick = () => showSimilar(n, it.id);
  box.querySelector('.sim-tutor').onclick = () => openTutor({ext: true, id: it.id, type: task.type, answer: it.a, url: SDAM(it.id), origin: it.o});
  const form = box.querySelector('.answer-check');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = form.querySelector('input'), out = form.querySelector('.check-result');
    if (!input.value.trim()) return;
    const ok = checkAnswer(it.a, input.value);
    out.textContent = ok ? 'Верно!' : 'Пока неверно';
    out.className = 'check-result ' + (ok ? 'ok' : 'bad');
    touchDay();
    if (ok) { simSolved.add(it.id); store.set('simSolved', [...simSolved]); box.querySelector('.sim-card').classList.add('solved'); refresh(); }
  });
}
$$('.similar-btn').forEach(b => b.addEventListener('click', () => showSimilar(+b.dataset.task)));

/* ------------------------------------------------------------ настройки */
const dlg = $('#settings');
const modeRadios = $$('input[name="ai-mode"]');
function showMode(mode) {
  modeRadios.forEach(r => { r.checked = r.value === mode; });
  $$('.mode-pane').forEach(p => { p.hidden = p.dataset.mode !== mode; });
}
modeRadios.forEach(r => r.addEventListener('change', () => { showMode(r.value); $('#set-status').textContent = ''; }));
function openSettings(msg) {
  const s = settings();
  showMode(s.mode);
  $('#set-code').value = s.code;
  $('#set-url').value = s.url; $('#set-key').value = s.key; $('#set-model').value = s.model;
  $('#set-preset').value = [...$('#set-preset').options].some(o => o.value === s.url) ? s.url : '';
  $('#set-status').textContent = msg || '';
  dlg.showModal();
}
$('#open-settings').onclick = () => openSettings();
$('#set-cancel').onclick = () => dlg.close();
$('#set-preset').onchange = e => { if (e.target.value) $('#set-url').value = e.target.value; };
const readForm = () => ({
  mode: (modeRadios.find(r => r.checked) || {}).value || 'builtin',
  code: $('#set-code').value.trim(),
  url: $('#set-url').value.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, ''),
  key: $('#set-key').value.trim(), model: $('#set-model').value.trim()});
$('#settings-form').addEventListener('submit', e => {
  const s = readForm();
  if (!isReady(s)) {
    e.preventDefault();
    $('#set-status').textContent = s.mode === 'own' ? 'Заполните адрес, ключ и модель.' : 'Введите кодовое слово.';
    return;
  }
  store.set('settings', s);
});
$('#set-test').onclick = async () => {
  const st = $('#set-status'); st.textContent = 'Проверяю…';
  try {
    const r = await callAI(readForm(), [{role: 'user', content: 'Ответь одним словом: работает'}], null, 30);
    st.textContent = 'Работает: «' + r.slice(0, 40) + '»';
  } catch (err) { st.textContent = err.message; }
};

/* ------------------------------------------------------------ профиль, достижения, отчёт */
const pdlg = $('#profile');
$('#open-profile').onclick = () => {
  const p = profile(), s = solved();
  const rows = TYPES.map(t => {
    const r = p.types[t], cnt = TASKS.filter(x => x.type === t), done = cnt.filter(x => s.has(x.n)).length;
    return `<div class="profile-row"><span class="name">${esc(t)}<br><small class="muted">решено ${done} из ${cnt.length}${r && r.note ? ' · ' + esc(r.note) : ''}</small></span>`
      + `<span class="lvl" data-level="${r ? r.level : ''}">${r ? LEVELS[r.level] : 'не оценён'}</span></div>`;
  }).join('');
  $('#profile-body').innerHTML = rows + (p.note ? `<p class="profile-note"><b>Заметка репетитора:</b> ${esc(p.note)}</p>` : '');
  const got = new Set(store.get('ach', []));
  $('#ach-count').textContent = `${got.size} из ${ACH.length}`;
  $('#ach-grid').innerHTML = ACH.map(a => `<div class="ach${got.has(a.id) ? ' got' : ''}" title="${esc(a.desc)}"><span class="ach-icon">${a.icon}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join('');
  $('#student-name').value = store.get('name', '');
  pdlg.showModal();
};
$('#profile-close').onclick = () => pdlg.close();
$('#student-name').addEventListener('change', e => store.set('name', e.target.value.trim()));
$('#profile-reset').onclick = () => {
  if (!confirm('Стереть оценки уровня, решённые задачи, достижения и все диалоги с репетитором?')) return;
  Object.keys(localStorage).filter(k => k.startsWith('eco-') && !['eco-settings', 'eco-theme', 'eco-name'].includes(k)).forEach(k => localStorage.removeItem(k));
  pdlg.close(); refresh();
};

function reportData() {
  const p = profile(), st = stats(), s = solved();
  const lv = {};
  TYPES.forEach((t, i) => { const r = p.types[t]; if (r) lv[i + 1] = [r.level, r.note || '']; });
  const w = {}, r = [];
  for (const [n, x] of Object.entries(st)) { if (x.w) w[n] = x.w; if (x.r) r.push(+n); }
  return {v: 1, d: today(), nm: store.get('name', ''), s: [...s].sort((a, b) => a - b), l: lv, w, r,
    rv: reviewTasks(), st: streak(), days: store.get('days', []).slice(-60), a: store.get('ach', []),
    sim: store.get('simSolved', []).length, note: p.note || ''};
}
function reportUrl() {
  const bytes = new TextEncoder().encode(JSON.stringify(reportData()));
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return new URL('report.html', location.href).href.split('#')[0] + '#' + code;
}
$('#report-open').onclick = () => window.open(reportUrl(), '_blank', 'noopener');
$('#report-copy').onclick = async () => {
  const url = reportUrl();
  try { await navigator.clipboard.writeText(url); toast('<span class="toast-icon">📋</span><span>Ссылка на отчёт скопирована — отправьте её репетитору или родителям.</span>'); }
  catch (e) { prompt('Скопируйте ссылку на отчёт:', url); }
};

/* ------------------------------------------------------------ ИИ */
async function callAI(s, messages, onDelta, maxTokens) {
  if (!isReady(s)) throw new Error('Не настроен ИИ: откройте «Настройки ИИ».');
  const own = s.mode === 'own';
  const body = {messages, stream: !!onDelta};
  if (own) body.model = s.model;
  if (maxTokens) body.max_tokens = maxTokens;
  let res;
  try {
    res = await fetch(own ? s.url + '/chat/completions' : window.AI_PROXY, {method: 'POST',
      headers: own ? {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.key}
                   : {'Content-Type': 'application/json', 'X-Access-Code': encodeURIComponent(s.code)},
      body: JSON.stringify(body)});
  } catch (e) {
    throw new Error(own ? 'Сервис не отвечает или не пускает запросы из браузера (CORS). Проверьте адрес API.'
                        : 'Сервер репетитора не отвечает. Проверьте интернет и попробуйте ещё раз.');
  }
  if (!res.ok) {
    let t = await res.text();
    try { const j = JSON.parse(t); t = (j.error && (j.error.message || j.error)) || j.message || t; } catch (e) {}
    if (res.status === 401 && !own) throw new Error('Неверное кодовое слово. Исправьте его в «Настройках ИИ».');
    if (res.status === 413) throw new Error(String(t));
    throw new Error(`Ошибка ${res.status}: ${String(t).slice(0, 300)}`);
  }
  const ctype = res.headers.get('content-type') || '';
  if (!onDelta || !ctype.includes('event-stream')) {
    const j = await res.json();
    const txt = j.choices?.[0]?.message?.content ?? '';
    if (onDelta) onDelta(txt);
    return txt;
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    buf += dec.decode(value, {stream: true});
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const d = l.slice(5).trim();
      if (d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        if (j.error) throw new Error(j.error.message || 'Ошибка сервиса');
        const piece = j.choices?.[0]?.delta?.content;
        if (piece) { full += piece; onDelta(full); }
      } catch (e) { if (e.message && !(e instanceof SyntaxError)) throw e; }
    }
  }
  return full;
}

const BASE_PROMPT = `Ты — ИИ-репетитор по задаче №16 ЕГЭ по профильной математике (экономическая задача: кредиты, вклады, оптимизация). Ты работаешь как интерактивный тренажёр: ведёшь ученика по задаче вопросами, а не решаешь за него.

КАК ОБЩАТЬСЯ
- Пиши по-русски, на «ты», коротко: обычно 2–5 предложений. Одно сообщение — один вопрос к ученику.
- Формулы пиши в LaTeX: $...$ внутри строки, $$...$$ отдельной строкой. Дробная часть — через запятую: $1{,}1$. Можно **жирный** и списки.
- Будь доброжелательным, но честным: если ответ неверный, так и скажи и объясни, где ошибка.
- Ученик может диктовать голосом: не придирайся к опечаткам и словам вместо цифр («десять процентов» = 10%).

ФОТО РЕШЕНИЯ
Если ученик прислал фото своего решения: внимательно прочитай записи, проверь каждую строку и назови первую ошибку (где именно и почему). Если всё верно — так и скажи. Не переписывай решение целиком, если ученик не просит. Если на фото ничего не разобрать — попроси переснять ближе и при хорошем свете.

ПЛАН ЗАНЯТИЯ
1. Диагностика. Прежде чем решать, задай 2 коротких вопроса по теории, которая нужна именно для этой задачи (например: «чему равен коэффициент $b$ при ставке 12,5%?», «что происходит с долгом после платежа?», «как найти сумму выплат при дифференцированных платежах?»). По одному вопросу за раз. После каждого ответа коротко скажи, верно или нет, и поправь. Если уровень ученика по этому типу уже известен (см. профиль ниже) и он «Уверенный» или «Сильный», хватит одного вопроса.
2. Оценка уровня. После диагностики оцени уровень по шкале: 1 — Начинающий (не знает основ: процентов, коэффициента $b$), 2 — Базовый (знает формулы, но путается в применении), 3 — Уверенный (понимает схему, ошибается в деталях и счёте), 4 — Сильный (решает сам). Скажи ученику уровень одной фразой, без обидных слов.
3. Решение по шагам, под уровень:
   - уровень 1–2: дроби задачу на маленькие шаги, напоминай нужную формулу, предлагай заполнить таблицу «долг с % — платёж — остаток» по строке;
   - уровень 3: спрашивай, какой следующий шаг, подсказывай только при ошибке;
   - уровень 4: попроси составить уравнение или план целиком, проверяй.
   Каждый раз жди ответа ученика. Проверяй его вычисления внимательно; если его способ отличается от эталона, но верен — принимай.
4. Подсказки: если ученик просит подсказку, давай её по нарастающей — сначала намёк, потом конкретнее. Не выдавай ответ и полное решение, пока ученик сам не получит ответ или прямо не попросит показать решение. Если попросил — покажи решение целиком и понятно.
5. Финал: когда ученик получил верный ответ, коротко похвали, в 1–2 предложениях подведи главную идею задачи и посоветуй нажать «Похожая задача» под условием, чтобы закрепить.

СЛУЖЕБНЫЕ МЕТКИ (ученик их не видит, их читает программа)
- Когда оцениваешь или меняешь оценку уровня, добавь в самом конце сообщения отдельной строкой: [[level:N|type:K|короткий комментарий, что умеет и что подтянуть]] — N от 1 до 4, K — номер типа из списка ниже.
- Когда ученик сам получил верный окончательный ответ, добавь в конце строку [[solved]].

ТИПЫ ЗАДАЧ
${TYPES.map(t => '- ' + t).join('\n')}

ТЕОРИЯ, НА КОТОРУЮ ОПИРАЕМСЯ
${DATA.theory}`;

function profileText(typeName) {
  const p = profile(), lines = [];
  for (const [t, r] of Object.entries(p.types)) lines.push(`- ${t}: уровень ${r.level} (${LEVELS[r.level]})${r.note ? ' — ' + r.note : ''}`);
  let s = lines.length ? 'Известные оценки уровня ученика:\n' + lines.join('\n') : 'Ученик ещё не оценивался — это первое занятие.';
  if (typeName) s += `\nТекущий тип задачи: ${typeName}.`;
  s += `\nРешено задач на сайте: ${solved().size} из ${TASKS.length}.`;
  return s;
}

function taskPrompt(t) {
  if (t.ext) {
    return `${BASE_PROMPT}

СЕЙЧАС ЗАДАЧА С САЙТА «РЕШУ ЕГЭ» № ${t.id} (${t.url}), подобрана как похожая на «${t.type}».
Условия у тебя нет: ученик открыл его на «Решу ЕГЭ». Попроси прислать условие — скопировать текст или сфотографировать экран. Не придумывай условие сам.
ЭТО ВИДИШЬ ТОЛЬКО ТЫ: ответ с сайта — ${t.answer || 'не указан'}. Когда получишь условие, реши задачу сам аккуратно и сверься с этим ответом, прежде чем проверять ученика.

ПРОФИЛЬ УЧЕНИКА
${profileText(t.type)}

Начни: поздоровайся в одну фразу и попроси прислать условие задачи № ${t.id} с «Решу ЕГЭ» (текстом или фото). После этого — по плану занятия.`;
  }
  return `${BASE_PROMPT}

СЕЙЧАС ЗАДАЧА ${t.n} (${t.type})
Условие (ученик его видит):
${t.cond}

ЭТО ВИДИШЬ ТОЛЬКО ТЫ — эталонное решение, не показывай его раньше времени:
${t.table ? 'Таблица долга:\n' + t.table + '\n' : ''}Строки решения:
${t.solution.map(s => '• ' + s).join('\n')}
Шаги: ${t.steps.join(' ')}
Ответ: ${t.answer}

ПРОФИЛЬ УЧЕНИКА
${profileText(t.type)}

Начни: поздоровайся в одну фразу, назови тип задачи и задай первый диагностический вопрос.`;
}

function freePrompt() {
  return `${BASE_PROMPT}

РЕЖИМ «СВОЯ ЗАДАЧА»
Ученик принесёт свою экономическую задачу. Сначала попроси прислать условие полностью — текстом или фото. Когда получишь условие: определи тип из списка, скажи его ученику, сам аккуратно реши задачу про себя (эталона нет — проверяй вычисления дважды) и дальше иди по плану занятия: диагностика → оценка уровня → решение по шагам. Если условие неполное или это не экономическая задача — скажи об этом.

ПРОФИЛЬ УЧЕНИКА
${profileText('')}

Начни: поздоровайся в одну фразу и попроси прислать условие задачи (можно сфотографировать).`;
}

/* ------------------------------------------------------------ чат */
const tutor = $('#tutor'), log = $('#tutor-log'), form = $('#tutor-form'), text = $('#tutor-text');
let chat = null;   // {id, task, messages:[{role, content, hidden, img?, hasImg?}]}
let busy = false;
let pendingImg = null;

function md(src) {
  const math = [];
  let s = src.replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$/g, m => { math.push(m); return `\u0000${math.length - 1}\u0000`; });
  s = esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>')
    .replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
  const out = []; let list = null;
  for (const raw of s.split('\n')) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    const item = ul || ol;
    if (item) {
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { if (list) out.push(`</${list.tag}>`); list = {tag}; out.push(`<${tag}>`); }
      out.push(`<li>${item[1]}</li>`); continue;
    }
    if (list) { out.push(`</${list.tag}>`); list = null; }
    if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`</${list.tag}>`);
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => esc(math[i]));
}

const TAG_RE = /\[\[(level|solved)[^\]]*\]\]/gi;
const visible = s => s.replace(TAG_RE, '').replace(/\[\[[^\]]*$/, '').trim();

function bubble(role, content, opts = {}) {
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'me' : role === 'assistant' ? 'ai' : 'sys');
  if (opts.typing) div.classList.add('typing');
  fill(div, role, content, opts);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}
function fill(div, role, content, opts = {}) {
  if (role === 'user') {
    div.textContent = content;
    if (opts.img) { const im = document.createElement('img'); im.src = opts.img; im.alt = 'Фото решения'; im.className = 'msg-photo'; div.prepend(im); }
    else if (opts.hasImg) { const tag = document.createElement('span'); tag.className = 'msg-photo-tag'; tag.textContent = '📷 фото решения'; div.prepend(tag); }
  } else if (role === 'assistant') div.innerHTML = md(visible(content));
  else div.innerHTML = content;
  renderMath(div);
}

function applyTags(content) {
  const t = chat.task;
  for (const m of content.matchAll(/\[\[level\s*:?\s*([1-4])(?:\s*\|\s*type\s*:?\s*(\d+))?(?:\s*\|\s*([^\]]*))?\]\]/gi)) {
    const typeName = t ? t.type : TYPES[(+m[2] || 0) - 1];
    const p = profile();
    if (typeName) p.types[typeName] = {level: +m[1], note: (m[3] || '').trim()};
    else p.note = (m[3] || '').trim();
    store.set('profile', p);
  }
  if (t && /\[\[solved\]\]/i.test(content)) {
    if (t.ext) {
      const ss = new Set(store.get('simSolved', [])); ss.add(t.id); store.set('simSolved', [...ss]);
      store.set('simTutor', store.get('simTutor', 0) + 1);
    } else { noteCorrect(t.n, true); markSolved(t.n); }
  }
  paintLevel(); refresh();
}

function paintLevel() {
  const el = $('#tutor-level'), p = profile();
  const r = chat && chat.task ? p.types[chat.task.type] : null;
  const lv = r ? r.level : overallLevel();
  el.hidden = !lv;
  if (lv) el.textContent = 'Уровень: ' + LEVELS[lv];
}

function setBusy(b) {
  busy = b;
  $('#tutor-send').disabled = b;
  $$('#tutor-quick button').forEach(x => { x.disabled = b; });
}

function save() { store.set('chat-' + chat.id, chat.messages.map(({img, ...m}) => m)); }

function openTutor(task) {
  const id = !task ? 'free' : task.ext ? 'sdam-' + task.id : String(task.n);
  chat = {id, task, messages: store.get('chat-' + id, [])};
  $('#tutor-subtitle').textContent = !task ? 'Своя задача' : task.ext ? `Похожая задача · «Решу ЕГЭ» № ${task.id}` : `Задача ${task.n} · ${task.type}`;
  tutor.hidden = false; document.body.classList.add('tutor-open');
  log.innerHTML = '';
  clearAttach();
  paintLevel();
  for (const m of chat.messages) if (!m.hidden) bubble(m.role, m.content, {hasImg: m.hasImg});
  if (!chat.messages.length) send('Привет! Я готов заниматься.', true);
  if (matchMedia('(pointer:fine)').matches) text.focus();
}

function systemPrompt() { return chat.task ? taskPrompt(chat.task) : freePrompt(); }

function requestMessages() {
  let lastImg = -1;
  chat.messages.forEach((m, i) => { if (m.img) lastImg = i; });
  return chat.messages.map((m, i) => {
    if (m.role === 'user' && i === lastImg) {
      return {role: 'user', content: [{type: 'text', text: m.content}, {type: 'image_url', image_url: {url: m.img}}]};
    }
    const extra = m.hasImg ? '\n[Ученик прикладывал к этому сообщению фото решения.]' : '';
    return {role: m.role, content: m.content + extra};
  });
}

async function send(content, hidden, img) {
  if (busy || (!content.trim() && !img)) return;
  const s = settings();
  if (!isReady(s)) {
    const b = bubble('sys', (s.mode === 'own' ? 'Укажите сервис, ключ и модель.' : 'Введите кодовое слово, чтобы включить репетитора.')
      + '<br><button class="solid" type="button">Открыть настройки ИИ</button>');
    b.querySelector('button').onclick = () => openSettings();
    return;
  }
  if (chat.task && !chat.task.ext && /покажи.{0,20}решени|сда[юё]сь/i.test(content)) { noteReveal(chat.task.n); refresh(); }
  const msg = {role: 'user', content, hidden: !!hidden};
  if (img) { msg.img = img; msg.hasImg = true; }
  chat.messages.push(msg);
  const mine = hidden ? null : bubble('user', content, {img});
  save();
  touchDay();
  setBusy(true);
  const div = bubble('assistant', '', {typing: true});
  let raf = 0, last = '';
  try {
    const msgs = [{role: 'system', content: systemPrompt()}, ...requestMessages()];
    const full = await callAI(s, msgs, txt => {
      last = txt;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; fill(div, 'assistant', last); log.scrollTop = log.scrollHeight; });
    });
    cancelAnimationFrame(raf);
    div.classList.remove('typing');
    if (!full.trim()) throw new Error('Модель вернула пустой ответ. Попробуйте ещё раз или выберите другую модель.');
    fill(div, 'assistant', full);
    chat.messages.push({role: 'assistant', content: full});
    save();
    applyTags(full);
  } catch (err) {
    cancelAnimationFrame(raf);
    div.remove();
    chat.messages.pop(); save();
    if (mine) mine.remove();
    const b = bubble('sys', esc(err.message) + '<br><button class="ghost" type="button">Повторить</button>');
    b.querySelector('button').onclick = () => { b.remove(); send(content, hidden, img); };
    if (!hidden) { text.value = content; autoGrow(); if (img) setAttach(img); }
  } finally {
    setBusy(false);
    log.scrollTop = log.scrollHeight;
  }
}

form.addEventListener('submit', e => {
  e.preventDefault();
  let v = text.value;
  const img = pendingImg;
  if (!v.trim() && img) v = 'Проверь, пожалуйста, моё решение на фото.';
  if (busy || (!v.trim() && !img)) return;
  text.value = ''; autoGrow(); clearAttach();
  send(v, false, img);
});
text.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
const autoGrow = () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 160) + 'px'; };
text.addEventListener('input', autoGrow);
$('#tutor-quick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) send(b.dataset.say); });
$('#tutor-close').onclick = () => { stopVoice(); tutor.hidden = true; document.body.classList.remove('tutor-open'); };
$('#tutor-restart').onclick = () => {
  if (busy || !confirm('Начать этот диалог заново?')) return;
  store.del('chat-' + chat.id); openTutor(chat.task);
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !tutor.hidden && !document.querySelector('dialog[open]')) $('#tutor-close').click(); });

$$('.prototype .tutor-start').forEach(b => b.addEventListener('click', () => openTutor(TASKS[b.dataset.task - 1])));
$('#free-task').onclick = () => openTutor(null);

/* ------------------------------------------------------------ фото решения */
function setAttach(dataUrl) {
  pendingImg = dataUrl;
  $('#attach').hidden = false;
  $('#attach-img').src = dataUrl;
}
function clearAttach() { pendingImg = null; $('#attach').hidden = true; $('#attach-img').removeAttribute('src'); $('#photo-input').value = ''; }
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не получилось открыть фото. Попробуйте JPG или PNG.')); };
    im.src = url;
  });
}
async function compress(file) {
  const im = await loadImage(file);
  const max = 1600, k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(im, 0, 0, c.width, c.height);
  let q = 0.85, out = c.toDataURL('image/jpeg', q);
  while (out.length > 2_500_000 && q > 0.4) { q -= 0.15; out = c.toDataURL('image/jpeg', q); }
  return out;
}
$('#tutor-photo').onclick = () => $('#photo-input').click();
$('#photo-input').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try { setAttach(await compress(f)); text.placeholder = 'Подпишите фото или просто отправьте'; }
  catch (err) { bubble('sys', esc(err.message)); }
});
$('#attach-remove').onclick = clearAttach;

/* ------------------------------------------------------------ голосовой ввод */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function stopVoice() { if (rec) { try { rec.stop(); } catch (e) {} } }
if (!SR) $('#tutor-mic').hidden = true;
else {
  $('#tutor-mic').onclick = () => {
    if (rec) { stopVoice(); return; }
    rec = new SR();
    rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = false;
    const base = text.value ? text.value.replace(/\s*$/, ' ') : '';
    rec.onresult = ev => {
      let said = '';
      for (const r of ev.results) said += r[0].transcript;
      text.value = base + said; autoGrow();
    };
    rec.onerror = ev => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') bubble('sys', 'Браузер не дал доступ к микрофону. Разрешите его в настройках сайта.');
      else if (ev.error !== 'no-speech' && ev.error !== 'aborted') bubble('sys', 'Голосовой ввод не сработал: ' + esc(ev.error));
    };
    rec.onend = () => { rec = null; $('#tutor-mic').classList.remove('rec'); $('#tutor-mic').setAttribute('aria-pressed', 'false'); text.focus(); };
    $('#tutor-mic').classList.add('rec'); $('#tutor-mic').setAttribute('aria-pressed', 'true');
    try { rec.start(); } catch (e) { rec = null; $('#tutor-mic').classList.remove('rec'); }
  };
}

/* ------------------------------------------------------------ старт */
paintProgress();
paintReview();
checkAch(true);
})();
