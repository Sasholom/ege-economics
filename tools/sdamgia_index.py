# -*- coding: utf-8 -*-
"""Индекс похожих задач с «Решу ЕГЭ»: номер, тип, ответ, источник (без текста условий).

Запуск:  python3 tools/sdamgia_index.py [папка-с-сохранёнными-страницами]
Без аргумента скачивает три раздела каталога (кредиты, вклады, оптимальный выбор).
Результат — data/similar.json; потом  python3 build.py.
"""
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://math-ege.sdamgia.ru'
TOPICS = {'credit': 292, 'deposit': 293, 'optimum': 247}
RULES = {
    1: r'на как\w* (минимальн\w* )?(количество|срок)|сколько (лет|месяцев)|наименьш\w* (количество|число) (лет|месяцев)|за сколько',
    2: r'процентн\w* ставк|под как\w* процент|найдите r|значени\w* r\b|при как\w* (наименьш|наибольш)\w* r',
    3: r'(как\w*|наибольш\w*|наименьш\w*) сумм\w*.{0,40}(взят|кредит)|сколько рублей был\w* взят|сумм\w* кредит',
    4: r'(размер|сумм\w*|величин\w*) (ежегодн|ежемесячн)\w* (плат|выплат|транш)|каким\w* должн\w* быть.{0,40}(плат|выплат)|чему (равн\w*|будет равн\w*).{0,30}(плат|выплат)',
    5: r'на сколько.{0,80}(больше|меньше|выгодн)|разниц|какая схема|какой вариант.{0,40}выгодн',
    6: r'таблиц|в соответствии со следующ',
    7: r'на одну и ту же (величину|сумму) меньше|уменьша\w*.{0,30}равномерно|равными долями',
}


def text(fragment):
    s = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', lambda m: ' ' + m.group(1) + ' ', fragment)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html.unescape(s).replace('­', '')
    return re.sub(r'\s+', ' ', s).strip()


def parse(page, topic):
    out = []
    for chunk in page.split('class="prob_nums"')[1:]:
        m = re.search(r'problem\?id=(\d+)', chunk)
        start = chunk.find('class="pbody">')
        if not m or start < 0:
            continue
        body = chunk[start + 14:]
        cut = re.search(r'<!--np-->|class="solution"|id="sol\d', body)
        cond = text(body[:cut.start()] if cut else body).lower().replace('ё', 'е')
        ans = re.search(r'class="answer"[^>]*>(.*?)</div>', chunk, re.S)
        answer = re.sub(r'^Ответ:\s*', '', text(ans.group(1)) if ans else '')
        twice = re.match(r'^(.+?)\.?\s+\1\.?$', answer)
        answer = (twice.group(1) if twice else answer).rstrip('.').strip()
        src = re.search(r'Источник:(.*?)</span>', chunk, re.S)
        origin = text(src.group(1)).rstrip('.') if src else ''
        if topic == 'credit':
            types = [k for k, rx in RULES.items() if re.search(rx, cond)] + [8, 11]
        else:
            types = [9 if topic == 'deposit' else 10, 11]
        out.append({'id': int(m.group(1)), 't': types, 'a': answer, 'o': origin})
    return out


def load(topic, folder):
    if folder:
        return (Path(folder) / f'p{TOPICS[topic]}.html').read_text(encoding='utf-8', errors='replace')
    url = f'{SITE}/test?filter=all&category_id={TOPICS[topic]}&print=true'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8', errors='replace')


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else None
    items = []
    for topic in TOPICS:
        part = parse(load(topic, folder), topic)
        print(topic, len(part))
        items += part
    seen, uniq = set(), []
    for it in items:
        if it['id'] not in seen and it['a']:
            seen.add(it['id'])
            uniq.append(it)
    (ROOT / 'data').mkdir(exist_ok=True)
    (ROOT / 'data' / 'similar.json').write_text(json.dumps(uniq, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for k in range(1, 12):
        print(f'тип {k}: {sum(k in it["t"] for it in uniq)}')


if __name__ == '__main__':
    main()
