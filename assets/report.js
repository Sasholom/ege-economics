(() => {
'use strict';
const META = JSON.parse(document.getElementById('report-meta').textContent);
const LEVELS = {1: 'Начинающий', 2: 'Базовый', 3: 'Уверенный', 4: 'Сильный'};
const ACH = {first: ['🌱', 'Первый шаг'], five: ['✋', 'Пятёрка'], half: ['🌗', 'Полпути'], all: ['🏆', 'Все 50'],
  credit: ['🏦', 'Кредитный эксперт'], deposit: ['💰', 'Вкладчик'], optimum: ['📈', 'Оптимизатор'], clean: ['🎯', 'Без подсказок'],
  tutor: ['🤝', 'В паре с репетитором'], review: ['🔁', 'Работа над ошибками'], hunter: ['🔎', 'Охотник за задачами'], week: ['🔥', 'Неделя подряд']};
const root = document.getElementById('report');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };

function decode() {
  const code = location.hash.slice(1);
  if (!code) return null;
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
}

let d;
try { d = decode(); } catch (e) { d = null; }
if (!d) {
  root.innerHTML = '<h1>Отчёт не найден</h1><p class="muted">Ссылка неполная. Откройте «Мой уровень» на сайте и скопируйте ссылку на отчёт ещё раз.</p>';
  return;
}

// Номера задач по типам: задачи идут подряд, тип за типом.
const typeOf = [];
META.counts.forEach((c, i) => { for (let k = 0; k < c; k++) typeOf.push(i + 1); });
const solved = new Set(d.s || []);
const perType = META.types.map((name, i) => {
  const nums = typeOf.map((t, j) => t === i + 1 ? j + 1 : 0).filter(Boolean);
  const lv = (d.l || {})[i + 1];
  const wrong = nums.reduce((a, n) => a + ((d.w || {})[n] || 0), 0);
  return {name, total: nums.length, done: nums.filter(n => solved.has(n)).length, level: lv ? lv[0] : 0, note: lv ? lv[1] : '', wrong};
});
const weak = perType.filter(t => (t.level && t.level <= 2) || t.wrong >= 2).map(t => t.name);
const date = new Date(d.d + 'T12:00:00').toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'});
const daysSet = new Set(d.days || []);
const last = [];
for (let i = 27; i >= 0; i--) { const x = new Date(d.d + 'T12:00:00'); x.setDate(x.getDate() - i); last.push(x.toLocaleDateString('sv-SE')); }
const activeDays = last.filter(x => daysSet.has(x)).length;
const pct = Math.round(solved.size / META.total * 100);

document.title = `Отчёт${d.nm ? ' — ' + d.nm : ''} · экономическая задача ЕГЭ`;
root.innerHTML = `
<header class="sheet-head">
  <span class="kicker">Отчёт о подготовке · ${esc(date)}</span>
  <h1>${d.nm ? esc(d.nm) + ': ' : ''}экономическая задача ЕГЭ</h1>
</header>
<section class="rp-tiles">
  <div><b>${solved.size}<small>/${META.total}</small></b><span>задач решено (${pct}%)</span></div>
  <div><b>${d.st || 0}</b><span>${plural(d.st || 0, 'день', 'дня', 'дней')} подряд</span></div>
  <div><b>${activeDays}</b><span>${plural(activeDays, 'день', 'дня', 'дней')} занятий за 4 недели</span></div>
  <div><b>${(d.rv || []).length}</b><span>${plural((d.rv || []).length, 'задача', 'задачи', 'задач')} на повторении</span></div>
</section>
<h2 class="cs-title">Активность за 4 недели</h2>
<div class="rp-days">${last.map(x => `<span class="${daysSet.has(x) ? 'on' : ''}" title="${x}"></span>`).join('')}</div>
<h2 class="cs-title">По типам задач</h2>
<table class="rp-table"><thead><tr><th>Тип</th><th>Решено</th><th>Уровень</th><th>Комментарий репетитора</th></tr></thead><tbody>
${perType.map(t => `<tr><td>${esc(t.name)}</td><td>${t.done} / ${t.total}</td><td><span class="lvl" data-level="${t.level || ''}">${t.level ? LEVELS[t.level] : '—'}</span></td><td>${esc(t.note) || '<span class="muted">—</span>'}</td></tr>`).join('')}
</tbody></table>
${weak.length ? `<h2 class="cs-title">Что подтянуть</h2><ul class="rp-list">${weak.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
${d.note ? `<p class="profile-note"><b>Общая заметка репетитора:</b> ${esc(d.note)}</p>` : ''}
<h2 class="cs-title">Достижения</h2>
<div class="rp-ach">${(d.a || []).length ? d.a.filter(a => ACH[a]).map(a => `<span>${ACH[a][0]} ${esc(ACH[a][1])}</span>`).join('') : '<span class="muted">Пока нет</span>'}</div>
<p class="muted rp-extra">Похожих задач с «Решу ЕГЭ» решено: ${d.sim || 0}. Открыто решение до ответа: ${(d.r || []).length} ${plural((d.r || []).length, 'раз', 'раза', 'раз')}.</p>
<footer class="sheet-foot">Сделано SaSholom · sasholom.github.io/ege-economics</footer>`;
})();
