# -*- coding: utf-8 -*-
"""Собирает index.html из content.py.  Запуск:  python3 build.py"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import content  # noqa: E402
MARKS = {'p': 'peach', 'b': 'blue', 'g': 'green', 'u': 'purple'}


# ---------------------------------------------------------------- разметка
def _marks(text, to_html):
    """Разворачивает {p|...}: учитывает вложенные фигурные скобки LaTeX."""
    out, i = [], 0
    while i < len(text):
        m = re.compile(r'\{([pbgu])\|').match(text, i)
        if not m:
            out.append(html.escape(text[i], quote=False) if to_html else text[i])
            i += 1
            continue
        depth, j = 1, m.end()
        while j < len(text) and depth:
            depth += {'{': 1, '}': -1}.get(text[j], 0)
            j += 1
        inner = _marks(text[m.end():j - 1], to_html)
        out.append(f'<mark class="{MARKS[m.group(1)]}">{inner}</mark>' if to_html else inner)
        i = j
    return ''.join(out)


def rich(text):
    return _marks(text, True)


def plain(text):
    return _marks(text, False)


def table_html(head, rows):
    h = ''.join(f'<th>{rich(c)}</th>' for c in head)
    b = ''.join('<tr>' + ''.join(f'<td>{rich(c)}</td>' for c in r) + '</tr>' for r in rows)
    return f'<div class="table-scroll"><table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>'


def table_plain(head, rows):
    return '\n'.join(' | '.join(plain(c) for c in r) for r in [head, *rows])


def block_html(par):
    if par.startswith('FORMULA:'):
        return f'<div class="formula">$${html.escape(par[8:], quote=False)}$$</div>'
    if par.startswith('TABLE:'):
        rows = [r.split('|') for r in par[6:].split(';')]
        return table_html(rows[0], rows[1:])
    return f'<p>{rich(par)}</p>'


def block_plain(par):
    if par.startswith('FORMULA:'):
        return f'$${par[8:]}$$'
    if par.startswith('TABLE:'):
        return 'Таблица:\n' + '\n'.join(' | '.join(r.split('|')) for r in par[6:].split(';'))
    return plain(par)


# ---------------------------------------------------------------- иконки
ICON = {
    'chevron': '<path d="m6 9 6 6 6-6"/>',
    'spark': '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    'chat': '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    'gear': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    'check': '<path d="m5 12 5 5L20 7"/>',
    'doc': '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    'camera': '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    'repeat': '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    'moon': '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
}


def svg(name, cls=''):
    c = f' class="{cls}"' if cls else ''
    return (f'<svg{c} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICON[name]}</svg>')


def summary(no, name, extra=''):
    return (f'<summary class="task-summary"><span class="task-no">{no}</span>'
            f'<span class="task-name">{name}</span>{extra}{svg("chevron", "chevron")}</summary>')


# ---------------------------------------------------------------- страница
def theory_section():
    cards = []
    for th in content.THEORY:
        body = ''
        if 'table' in th:
            body += table_html(*th['table'])
        body += ''.join(block_html(p) for p in th['html'])
        cards.append(f'<article class="theory-card"><h3>{html.escape(th["title"])}</h3>{body}</article>')
    return ('<details class="task-group theory" id="theory">'
            + summary(svg('book'), 'Теория: всё, что нужно знать перед задачами')
            + f'<div class="task-content theory-grid">{"".join(cards)}</div></details>')


def task_article(n, group, t):
    cond = ''.join(block_html(p) for p in t['cond'])
    lines = ''.join(
        f'<li class="sol-row"><button class="sol-line" type="button" aria-expanded="false">{rich(f)}</button>'
        f'<div class="sol-hint" hidden>{rich(h)}</div></li>' for f, h in t['lines'])
    table = ''
    if 'table' in t:
        table = f'<div class="sol-table"><div class="sol-label">Таблица долга</div>{table_html(*t["table"])}</div>'
    steps = ''.join(f'<li>{rich(s)}</li>' for s in t['steps'])
    return f'''<article class="prototype" id="task-{n}" data-task="{n}">
<h3 class="prototype-title">Задача {n}<span class="solved-mark" title="Решена">{svg("check")}</span></h3>
<div class="condition">{cond}</div>
<div class="task-actions">
<button class="tutor-start" type="button" data-task="{n}">{svg("spark")}Решать с репетитором</button>
<button class="similar-btn" type="button" data-task="{n}">{svg("repeat")}Похожая задача</button>
<form class="answer-check" data-task="{n}"><input type="text" inputmode="decimal" autocomplete="off" placeholder="Ваш ответ" aria-label="Ваш ответ к задаче {n}"><button type="submit">Проверить</button><span class="check-result" role="status"></span></form>
</div>
<div class="reveal-row">
<details class="reveal" data-kind="steps"><summary>{svg("chevron")}Как решать</summary><ol class="steps">{steps}</ol></details>
<details class="reveal"><summary>{svg("chevron")}Решение</summary><div class="solution">{table}<ol class="sol-lines">{lines}</ol><p class="sol-tip">Нажмите на строку — появится пояснение.</p></div></details>
<details class="reveal"><summary>{svg("chevron")}Ответ</summary><div class="answer">{rich(t["answer"])}</div></details>
</div>
<div class="similar" data-task="{n}" hidden></div>
</article>'''


def tasks_json():
    data, n = [], 0
    for g in content.GROUPS:
        for t in g['tasks']:
            n += 1
            data.append({
                'n': n,
                'type': f"{g['no']}. {g['name']}",
                'cond': '\n'.join(block_plain(p) for p in t['cond']),
                'table': table_plain(*t['table']) if 'table' in t else '',
                'solution': [f'{plain(f)}  — {plain(h)}' for f, h in t['lines']],
                'steps': [plain(s) for s in t['steps']],
                'answer': plain(t['answer']),
            })
    return data


def theory_plain():
    parts = []
    for th in content.THEORY:
        parts.append('## ' + th['title'])
        if 'table' in th:
            parts.append(table_plain(*th['table']))
        parts += [block_plain(p) for p in th['html']]
    return '\n'.join(parts)


def build():
    groups, nav, n = [], [], 0
    for gi, g in enumerate(content.GROUPS, 1):
        arts = []
        for t in g['tasks']:
            n += 1
            arts.append(task_article(n, g, t))
        cnt = len(g['tasks'])
        short = g['name'].replace('Кредит: ', '')
        name = html.escape(short[:1].upper() + short[1:])
        kind = 'Кредит' if g['name'].startswith('Кредит') else ''
        badge = f'<span class="task-count" data-group="{gi}">{cnt} задач{"и" if 2 <= cnt <= 4 else ""}</span>'
        title = (f'<span class="kind">{kind}</span>' if kind else '') + name
        groups.append(f'<details class="task-group" id="type-{gi}" data-group="{gi}">'
                      + summary(f'<small>тип</small>{gi}', title, badge)
                      + f'<div class="task-content">{"".join(arts)}</div></details>')
        nav.append(f'<a href="#type-{gi}" data-group="{gi}"><b>{gi}</b>{name}</a>')

    similar_path = ROOT / 'data' / 'similar.json'
    similar = json.loads(similar_path.read_text(encoding='utf-8')) if similar_path.exists() else []
    data = json.dumps({'tasks': tasks_json(), 'theory': theory_plain(), 'similar': similar}, ensure_ascii=False)
    data = data.replace('</', '<\\/')
    tpl = (ROOT / 'template.html').read_text(encoding='utf-8')
    page = (tpl.replace('{{THEORY}}', theory_section())
               .replace('{{GROUPS}}', '\n'.join(groups))
               .replace('{{NAV}}', ''.join(nav))
               .replace('{{DATA}}', data)
               .replace('{{ICON_SPARK}}', svg('spark'))
               .replace('{{ICON_CHAT}}', svg('chat'))
               .replace('{{ICON_GEAR}}', svg('gear'))
               .replace('{{ICON_MOON}}', svg('moon'))
               .replace('{{ICON_SUN}}', svg('sun'))
               .replace('{{ICON_DOC}}', svg('doc'))
               .replace('{{ICON_SEARCH}}', svg('search'))
               .replace('{{ICON_CAMERA}}', svg('camera'))
               .replace('{{ICON_MIC}}', svg('mic')))
    (ROOT / 'index.html').write_text(page, encoding='utf-8')
    print(f'index.html: {n} задач, {len(page) // 1024} КБ')
    build_cheatsheet()
    build_report()


# ---------------------------------------------------------------- шпаргалка
TYPE_TIPS = [
    'Платим максимум каждый период и ведём таблицу «долг с % — платёж — остаток», пока долг с процентами не станет меньше платежа. Последний платёж неполный — он тоже считается.',
    'Записываем равенство для последней строки таблицы через $b$, например $Sb^2 = x(b+1)$. Находим $b$, затем $r = 100(b-1)$.',
    'Из условия аннуитета: $S = \\dfrac{x(b^n-1)}{b^n(b-1)}$. Для двух лет: $S = \\dfrac{x(b+1)}{b^2}$.',
    'Платёж: $x = \\dfrac{Sb^n(b-1)}{b^n-1}$. Для двух лет $x = \\dfrac{Sb^2}{b+1}$, для трёх $x = \\dfrac{Sb^3}{b^2+b+1}$.',
    'Считаем общую сумму выплат по каждой схеме отдельно и вычитаем. Переплата = выплаты − кредит.',
    'Платёж месяца = долг до начисления $\\times\\, b$ − следующий остаток. Сумма выплат = $b\\cdot$(сумма долгов до начисления) − (сумма остатков после платежей).',
    'Долг каждый раз уменьшается на $\\dfrac{S}{n}$. Сумма выплат: $S + \\dfrac{r}{100}S\\cdot\\dfrac{n+1}{2}$. Самый большой платёж — первый.',
    'Строим таблицу строго по условию: что растёт, что выплачивается, какие данные неизвестны. Затем одно уравнение на неизвестное.',
    'Вклад за период умножается на $b$. Каждый взнос или снятие — отдельное слагаемое со своей степенью $b$ (сколько раз на него начислили проценты).',
    'Целевая функция одной переменной → производная → нули и знаки. Если ответ целый — проверяем соседние целые точки. Линейная функция — максимум на краю.',
    'Вводим переменные, переводим условие в уравнения и неравенства. Отношения и проценты часто сокращают неизвестную величину.',
]


def build_cheatsheet():
    cards = []
    for th in content.THEORY:
        body = table_html(*th['table']) if 'table' in th else ''
        body += ''.join(block_html(p) for p in th['html'])
        cards.append(f'<article class="cs-card"><h3>{html.escape(th["title"])}</h3>{body}</article>')
    tips = ''.join(
        f'<li><b>{g["no"]}. {html.escape(g["name"])}</b><span>{html.escape(tip, quote=False)}</span></li>'
        for g, tip in zip(content.GROUPS, TYPE_TIPS))
    page = f'''<!DOCTYPE html>
<html lang="ru" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Шпаргалка — экономическая задача ЕГЭ</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Unbounded:wght@600;700&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/print.css">
</head>
<body class="sheet">
<div class="sheet-bar no-print"><a class="ghost" href="./">← На сайт</a><button class="solid" type="button" onclick="print()">Скачать PDF</button><span class="muted">В окне печати выберите «Сохранить как PDF».</span></div>
<main class="sheet-page">
<header class="sheet-head"><span class="kicker">ЕГЭ · профильная математика</span><h1>Экономическая задача: шпаргалка</h1></header>
<section class="cs-grid">{"".join(cards)}</section>
<h2 class="cs-title">Как решать каждый тип</h2>
<ol class="cs-tips">{tips}</ol>
<footer class="sheet-foot">Сделано SaSholom · sasholom.github.io/ege-economics</footer>
</main>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body,{{delimiters:[{{left:'$$',right:'$$',display:true}},{{left:'$',right:'$',display:false}}],throwOnError:false}})"></script>
</body>
</html>'''
    (ROOT / 'cheatsheet.html').write_text(page, encoding='utf-8')
    print('cheatsheet.html готова')


# ---------------------------------------------------------------- отчёт
def build_report():
    meta = {'types': [f"{g['no']}. {g['name']}" for g in content.GROUPS],
            'counts': [len(g['tasks']) for g in content.GROUPS],
            'total': sum(len(g['tasks']) for g in content.GROUPS)}
    page = f'''<!DOCTYPE html>
<html lang="ru" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Отчёт о подготовке — экономическая задача ЕГЭ</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Unbounded:wght@600;700&display=swap">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/print.css">
</head>
<body class="sheet">
<div class="sheet-bar no-print"><a class="ghost" href="./">← На сайт</a><button class="solid" type="button" onclick="print()">Скачать PDF</button></div>
<main class="sheet-page" id="report"><p class="muted">Загружаю отчёт…</p></main>
<script type="application/json" id="report-meta">{json.dumps(meta, ensure_ascii=False)}</script>
<script defer src="assets/report.js"></script>
</body>
</html>'''
    (ROOT / 'report.html').write_text(page, encoding='utf-8')
    print('report.html готов')


if __name__ == '__main__':
    build()
