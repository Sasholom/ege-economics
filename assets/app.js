(() => {
'use strict';

const DATA = JSON.parse(document.getElementById('tasks-data').textContent);
const TASKS = DATA.tasks;
const TYPES = [...new Set(TASKS.map(t => t.type))];
const LEVELS = {1: 'Начинающий', 2: 'Базовый', 3: 'Уверенный', 4: 'Сильный'};
const $ = s => document.querySelector(s);

/* ------------------------------------------------------------ хранилище */
const store = {
  get(k, def) { try { const v = localStorage.getItem('eco-' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('eco-' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('eco-' + k); } catch (e) {} },
};
const settings = () => store.get('settings', {url: '', key: '', model: ''});
const profile = () => store.get('profile', {types: {}, note: ''});
const solved = () => new Set(store.get('solved', []));

/* ------------------------------------------------------------ формулы */
const MATH = {delimiters: [
  {left: '$$', right: '$$', display: true}, {left: '\\[', right: '\\]', display: true},
  {left: '$', right: '$', display: false}, {left: '\\(', right: '\\)', display: false}],
  throwOnError: false};
function renderMath(el) { if (window.renderMathInElement) window.renderMathInElement(el, MATH); }

/* ------------------------------------------------------------ страница */
renderMath($('#app'));

document.addEventListener('click', e => {
  const chip = e.target.closest('.type-nav a');
  if (chip) {
    e.preventDefault();
    const g = document.querySelector(chip.getAttribute('href'));
    g.open = true; g.scrollIntoView({behavior: 'smooth', block: 'start'});
    return;
  }
  const line = e.target.closest('.sol-line');
  if (!line) return;
  const hint = line.nextElementSibling, open = line.getAttribute('aria-expanded') === 'true';
  line.setAttribute('aria-expanded', String(!open));
  hint.hidden = open;
});

function nums(s) {
  return (String(s).replace(/(\d)[\s ](?=\d{3}\b)/g, '$1').match(/-?\d+(?:[.,]\d+)?/g) || [])
    .map(x => parseFloat(x.replace(',', '.')));
}
function sameNum(a, b) {
  return [1, 1e3, 1e6, 1e9, 1e-3, 1e-6].some(k => Math.abs(a * k - b) < 1e-6 * Math.max(1, Math.abs(b)));
}
function checkAnswer(task, input) {
  let need = nums(task.answer);
  if (!need.length && /восьм/i.test(task.answer)) need = [8];
  const got = nums(input.replace(/восьм\S*/i, '8'));
  return need.length > 0 && got.length > 0 && need.every(a => got.some(g => sameNum(a, g)));
}

document.querySelectorAll('.answer-check').forEach(form => form.addEventListener('submit', e => {
  e.preventDefault();
  const task = TASKS[form.dataset.task - 1], input = form.querySelector('input'), out = form.querySelector('.check-result');
  if (!input.value.trim()) return;
  const ok = checkAnswer(task, input.value);
  out.textContent = ok ? 'Верно!' : 'Пока неверно';
  out.className = 'check-result ' + (ok ? 'ok' : 'bad');
  if (ok) markSolved(task.n);
}));

function markSolved(n) {
  const s = solved(); s.add(n); store.set('solved', [...s]); paintProgress();
}
function paintProgress() {
  const s = solved();
  document.querySelectorAll('.prototype').forEach(a => a.classList.toggle('solved', s.has(+a.dataset.task)));
  $('#progress-fill').style.width = (s.size / TASKS.length * 100) + '%';
  $('#progress-text').textContent = `Решено ${s.size} из ${TASKS.length}`;
  $('#stat-solved').textContent = s.size;
  const C = 2 * Math.PI * 52;
  $('#ring-fg').style.strokeDasharray = C;
  $('#ring-fg').style.strokeDashoffset = C * (1 - s.size / TASKS.length);
  document.querySelectorAll('.task-group[data-group]').forEach(g => {
    const arts = [...g.querySelectorAll('.prototype')], done = arts.filter(a => s.has(+a.dataset.task)).length;
    const c = g.querySelector('.task-count');
    c.dataset.orig = c.dataset.orig || c.textContent;
    c.textContent = done ? `${done} / ${arts.length} решено` : c.dataset.orig;
    c.classList.toggle('done', done === arts.length);
    const chip = document.querySelector(`.type-nav a[data-group="${g.dataset.group}"]`);
    if (chip) chip.classList.toggle('done', done === arts.length);
  });
  const lv = overallLevel();
  $('#level-dot').dataset.level = lv || '';
}
function overallLevel() {
  const v = Object.values(profile().types).map(t => t.level).filter(Boolean);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}
paintProgress();

/* ------------------------------------------------------------ настройки */
const dlg = $('#settings');
function openSettings(msg) {
  const s = settings();
  $('#set-url').value = s.url; $('#set-key').value = s.key; $('#set-model').value = s.model;
  $('#set-preset').value = [...$('#set-preset').options].some(o => o.value === s.url) ? s.url : '';
  $('#set-status').textContent = msg || '';
  dlg.showModal();
}
$('#open-settings').onclick = () => openSettings();
$('#set-cancel').onclick = () => dlg.close();
$('#set-preset').onchange = e => { if (e.target.value) $('#set-url').value = e.target.value; };
const readForm = () => ({url: $('#set-url').value.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, ''),
  key: $('#set-key').value.trim(), model: $('#set-model').value.trim()});
$('#settings-form').addEventListener('submit', e => {
  const s = readForm();
  if (!s.url || !s.key || !s.model) { e.preventDefault(); $('#set-status').textContent = 'Заполните все поля.'; return; }
  store.set('settings', s);
});
$('#set-test').onclick = async () => {
  const st = $('#set-status'); st.textContent = 'Проверяю…';
  try {
    const r = await callAI(readForm(), [{role: 'user', content: 'Ответь одним словом: работает'}], null, 30);
    st.textContent = 'Работает: «' + r.slice(0, 40) + '»';
  } catch (err) { st.textContent = err.message; }
};

/* ------------------------------------------------------------ профиль */
const pdlg = $('#profile');
$('#open-profile').onclick = () => {
  const p = profile(), s = solved();
  const rows = TYPES.map(t => {
    const r = p.types[t], cnt = TASKS.filter(x => x.type === t), done = cnt.filter(x => s.has(x.n)).length;
    return `<div class="profile-row"><span class="name">${esc(t)}<br><small class="muted">решено ${done} из ${cnt.length}${r && r.note ? ' · ' + esc(r.note) : ''}</small></span>`
      + `<span class="lvl" data-level="${r ? r.level : ''}">${r ? LEVELS[r.level] : 'не оценён'}</span></div>`;
  }).join('');
  $('#profile-body').innerHTML = rows + (p.note ? `<p class="profile-note"><b>Заметка репетитора:</b> ${esc(p.note)}</p>` : '');
  pdlg.showModal();
};
$('#profile-close').onclick = () => pdlg.close();
$('#profile-reset').onclick = () => {
  if (!confirm('Стереть оценки уровня, решённые задачи и все диалоги с репетитором?')) return;
  Object.keys(localStorage).filter(k => k.startsWith('eco-') && k !== 'eco-settings').forEach(k => localStorage.removeItem(k));
  pdlg.close(); paintProgress();
};

/* ------------------------------------------------------------ ИИ */
async function callAI(s, messages, onDelta, maxTokens) {
  if (!s.url || !s.key || !s.model) throw new Error('Не настроен ИИ: откройте «Настройки ИИ».');
  const body = {model: s.model, messages, stream: !!onDelta};
  if (maxTokens) body.max_tokens = maxTokens;
  let res;
  try {
    res = await fetch(s.url + '/chat/completions', {method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.key}, body: JSON.stringify(body)});
  } catch (e) {
    throw new Error('Сервис не отвечает или не пускает запросы из браузера (CORS). Проверьте адрес API.');
  }
  if (!res.ok) {
    let t = await res.text();
    try { const j = JSON.parse(t); t = (j.error && (j.error.message || j.error)) || j.message || t; } catch (e) {}
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

ПЛАН ЗАНЯТИЯ
1. Диагностика. Прежде чем решать, задай 2 коротких вопроса по теории, которая нужна именно для этой задачи (например: «чему равен коэффициент $b$ при ставке 12,5%?», «что происходит с долгом после платежа?», «как найти сумму выплат при дифференцированных платежах?»). По одному вопросу за раз. После каждого ответа коротко скажи, верно или нет, и поправь. Если уровень ученика по этому типу уже известен (см. профиль ниже) и он «Уверенный» или «Сильный», хватит одного вопроса.
2. Оценка уровня. После диагностики оцени уровень по шкале: 1 — Начинающий (не знает основ: процентов, коэффициента $b$), 2 — Базовый (знает формулы, но путается в применении), 3 — Уверенный (понимает схему, ошибается в деталях и счёте), 4 — Сильный (решает сам). Скажи ученику уровень одной фразой, без обидных слов.
3. Решение по шагам, под уровень:
   - уровень 1–2: дроби задачу на маленькие шаги, напоминай нужную формулу, предлагай заполнить таблицу «долг с % — платёж — остаток» по строке;
   - уровень 3: спрашивай, какой следующий шаг, подсказывай только при ошибке;
   - уровень 4: попроси составить уравнение или план целиком, проверяй.
   Каждый раз жди ответа ученика. Проверяй его вычисления внимательно; если его способ отличается от эталона, но верен — принимай.
4. Подсказки: если ученик просит подсказку, давай её по нарастающей — сначала намёк, потом конкретнее. Не выдавай ответ и полное решение, пока ученик сам не получит ответ или прямо не попросит показать решение. Если попросил — покажи решение целиком и понятно.
5. Финал: когда ученик получил верный ответ, коротко похвали, в 1–2 предложениях подведи главную идею задачи и предложи похожую задачу этого же типа.

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
Ученик принесёт свою экономическую задачу. Сначала попроси прислать условие полностью (текстом). Когда получишь условие: определи тип из списка, скажи его ученику, сам аккуратно реши задачу про себя (эталона нет — проверяй вычисления дважды) и дальше иди по плану занятия: диагностика → оценка уровня → решение по шагам. Если условие неполное или это не экономическая задача — скажи об этом.

ПРОФИЛЬ УЧЕНИКА
${profileText('')}

Начни: поздоровайся в одну фразу и попроси прислать условие задачи.`;
}

/* ------------------------------------------------------------ чат */
const tutor = $('#tutor'), log = $('#tutor-log'), form = $('#tutor-form'), text = $('#tutor-text');
let chat = null;   // {id, task, messages:[{role, content, hidden}]}
let busy = false;

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])); }

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

function bubble(role, content, typing) {
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'me' : role === 'assistant' ? 'ai' : 'sys');
  if (typing) div.classList.add('typing');
  fill(div, role, content);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}
function fill(div, role, content) {
  if (role === 'user') div.textContent = content;
  else if (role === 'assistant') div.innerHTML = md(visible(content));
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
  if (t && /\[\[solved\]\]/i.test(content)) markSolved(t.n);
  paintLevel(); paintProgress();
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
  document.querySelectorAll('#tutor-quick button').forEach(x => { x.disabled = b; });
}

function save() { store.set('chat-' + chat.id, chat.messages); }

function openTutor(task) {
  const id = task ? String(task.n) : 'free';
  chat = {id, task, messages: store.get('chat-' + id, [])};
  $('#tutor-subtitle').textContent = task ? `Задача ${task.n} · ${task.type}` : 'Своя задача';
  tutor.hidden = false; document.body.classList.add('tutor-open');
  log.innerHTML = '';
  paintLevel();
  for (const m of chat.messages) if (!m.hidden) bubble(m.role, m.content);
  if (!chat.messages.length) send('Привет! Я готов заниматься.', true);
  text.focus();
}

function systemPrompt() { return chat.task ? taskPrompt(chat.task) : freePrompt(); }

async function send(content, hidden) {
  if (busy || !content.trim()) return;
  const s = settings();
  if (!s.key) {
    const b = bubble('sys', 'Чтобы репетитор заработал, укажите сервис, ключ и модель.<br><button class="solid" type="button">Открыть настройки ИИ</button>');
    b.querySelector('button').onclick = () => openSettings();
    return;
  }
  chat.messages.push({role: 'user', content, hidden: !!hidden});
  if (!hidden) bubble('user', content);
  save();
  setBusy(true);
  const div = bubble('assistant', '', true);
  let raf = 0, last = '';
  try {
    const msgs = [{role: 'system', content: systemPrompt()}, ...chat.messages.map(m => ({role: m.role, content: m.content}))];
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
    div.remove();
    chat.messages.pop(); save();
    const b = bubble('sys', esc(err.message) + '<br><button class="ghost" type="button">Повторить</button>');
    b.querySelector('button').onclick = () => { b.remove(); send(content, hidden); };
    if (!hidden) log.querySelectorAll('.msg.me').forEach((x, i, all) => { if (i === all.length - 1) x.remove(); });
    if (!hidden) text.value = content;
  } finally {
    setBusy(false);
    log.scrollTop = log.scrollHeight;
  }
}

form.addEventListener('submit', e => { e.preventDefault(); const v = text.value; text.value = ''; autoGrow(); send(v); });
text.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
const autoGrow = () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 160) + 'px'; };
text.addEventListener('input', autoGrow);
$('#tutor-quick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) send(b.dataset.say); });
$('#tutor-close').onclick = () => { tutor.hidden = true; document.body.classList.remove('tutor-open'); };
$('#tutor-restart').onclick = () => {
  if (busy || !confirm('Начать этот диалог заново?')) return;
  store.del('chat-' + chat.id); openTutor(chat.task);
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !tutor.hidden && !document.querySelector('dialog[open]')) $('#tutor-close').click(); });

document.querySelectorAll('.tutor-start').forEach(b => b.addEventListener('click', () => openTutor(TASKS[b.dataset.task - 1])));
$('#free-task').onclick = () => openTutor(null);
})();
