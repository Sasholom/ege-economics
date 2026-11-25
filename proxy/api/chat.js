// Посредник между сайтом и ИИ: ключ хранится в переменных окружения Vercel,
// сайт присылает только диалог и кодовое слово.
//
// Переменные окружения (Vercel → Project → Settings → Environment Variables):
//   AI_API_KEY   — ключ сервиса ИИ (секрет)
//   AI_BASE_URL  — адрес API, совместимого с OpenAI, например https://openrouter.ai/api/v1
//   AI_MODEL     — модель, например openai/gpt-4o-mini
//   ACCESS_CODE  — кодовое слово для входа на сайте (секрет)
//   DAILY_LIMIT  — необязательно: сколько запросов в сутки (по умолчанию 300)
//   ALLOWED_ORIGINS — необязательно: сайты через запятую, которым можно обращаться

const DEFAULT_ORIGINS = ['https://sasholom.github.io', 'http://localhost:8765'];
const MAX_CHARS = 150000;

let day = '';
let count = 0;

function allowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS;
  return env ? env.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_ORIGINS;
}

function corsHeaders(origin) {
  const list = allowedOrigins();
  return {
    'Access-Control-Allow-Origin': list.includes(origin) ? origin : list[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function fail(status, message, headers) {
  return Response.json({ error: { message } }, { status, headers });
}

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request) {
    const headers = corsHeaders(request.headers.get('origin') || '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return fail(405, 'Нужен POST-запрос.', headers);

    const { AI_API_KEY, AI_BASE_URL, AI_MODEL, ACCESS_CODE } = process.env;
    if (!AI_API_KEY || !AI_BASE_URL || !AI_MODEL || !ACCESS_CODE) {
      return fail(500, 'Сервер ИИ ещё не настроен: в Vercel не заданы AI_API_KEY, AI_BASE_URL, AI_MODEL или ACCESS_CODE.', headers);
    }
    let given = request.headers.get('x-access-code') || '';
    try { given = decodeURIComponent(given); } catch { /* оставляем как есть */ }
    if (!sameSecret(given.trim().toLowerCase(), ACCESS_CODE.trim().toLowerCase())) {
      return fail(401, 'Неверное кодовое слово.', headers);
    }

    let body;
    try { body = await request.json(); } catch { return fail(400, 'Некорректный запрос.', headers); }
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content }));
    if (!messages.length) return fail(400, 'Пустой диалог.', headers);
    if (JSON.stringify(messages).length > MAX_CHARS) {
      return fail(413, 'Диалог стал слишком длинным — начните его заново кнопкой ↺.', headers);
    }

    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; count = 0; }
    if (++count > (Number(process.env.DAILY_LIMIT) || 300)) {
      return fail(429, 'На сегодня лимит запросов исчерпан. Попробуйте завтра.', headers);
    }

    const payload = { model: AI_MODEL, messages, stream: body.stream === true };
    if (Number(body.max_tokens) > 0) payload.max_tokens = Math.min(Number(body.max_tokens), 4000);

    let upstream;
    try {
      upstream = await fetch(AI_BASE_URL.trim().replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI_API_KEY.trim() },
        body: JSON.stringify(payload),
      });
    } catch {
      return fail(502, 'Сервис ИИ не отвечает. Проверьте AI_BASE_URL.', headers);
    }

    const out = new Headers(headers);
    out.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
    out.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
