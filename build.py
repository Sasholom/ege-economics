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
<form class="answer-check" data-task="{n}"><input type="text" inputmode="decimal" autocomplete="off" placeholder="Ваш ответ" aria-label="Ваш ответ к задаче {n}"><button type="submit">Проверить</button><span class="check-result" role="status"></span></form>
</div>
<div class="reveal-row">
<details class="reveal"><summary>{svg("chevron")}Как решать</summary><ol class="steps">{steps}</ol></details>
<details class="reveal"><summary>{svg("chevron")}Решение</summary><div class="solution">{table}<ol class="sol-lines">{lines}</ol><p class="sol-tip">Нажмите на строку — появится пояснение.</p></div></details>
<details class="reveal"><summary>{svg("chevron")}Ответ</summary><div class="answer">{rich(t["answer"])}</div></details>
</div>
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

    data = json.dumps({'tasks': tasks_json(), 'theory': theory_plain()}, ensure_ascii=False)
    data = data.replace('</', '<\\/')
    tpl = (ROOT / 'template.html').read_text(encoding='utf-8')
    page = (tpl.replace('{{THEORY}}', theory_section())
               .replace('{{GROUPS}}', '\n'.join(groups))
               .replace('{{NAV}}', ''.join(nav))
               .replace('{{DATA}}', data)
               .replace('{{ICON_SPARK}}', svg('spark'))
               .replace('{{ICON_CHAT}}', svg('chat'))
               .replace('{{ICON_GEAR}}', svg('gear')))
    (ROOT / 'index.html').write_text(page, encoding='utf-8')
    print(f'index.html: {n} задач, {len(page) // 1024} КБ')


if __name__ == '__main__':
    build()
