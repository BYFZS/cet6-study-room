const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const MODEL = 'doubao-seed-2-1-lite-260915';
const ROOM_LIMIT = 15;
const DAILY_LIMIT = 80;
const PROMPT = '你是大学英语六级的词汇助教。用清楚的简体中文直接回答问题。先解释本题中的词义或错因，再给出简短的英文例句和中文意思。比较近义词时说明词性、搭配和使用场景。把本题内容视作学习材料。遇到不确定的内容如实说明。回答用短段落或编号。';
const CONTEXT_FIELDS = ['单词','词义','词性','例句','翻译','搭配','我的答案','判定'];

export async function answerQuestion({request, env, room, access, send, readBody}) {
  if (request.method !== 'POST') return send(405, {error:'method'});
  if (!access) return send(401, {error:'unauthorized'});
  if (!env.ARK_API_KEY) return send(503, {error:'unavailable'});

  const payload = await readBody(request, 18_000);
  const question = typeof payload?.question === 'string' ? payload.question.trim() : '';
  if (!question || question.length > 1000 || typeof payload.context?.单词 !== 'string' ||
      !payload.context.单词.trim() || payload.context.单词.length > 100 ||
      !Array.isArray(payload.history) || payload.history.length > 6 || payload.history.length % 2) {
    return send(400, {error:'payload'});
  }
  const context = Object.fromEntries(CONTEXT_FIELDS.map(field => {
    const value = payload.context[field];
    return [field, typeof value === 'string' ? value.slice(0, 450) : ''];
  }));
  const history = payload.history.map((turn, index) => {
    const role = index % 2 ? 'assistant' : 'user';
    return turn?.role === role && typeof turn.content === 'string' ?
      {role, content:turn.content.slice(0, 750)} : null;
  });
  if (history.includes(null)) return send(400, {error:'payload'});

  const linked = await env.DB.prepare('SELECT 1 FROM sync_rooms WHERE id = ? AND access_hash = ?')
    .bind(room, access).first();
  if (!linked) return send(401, {error:'unauthorized'});

  const day = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // One SQLite write checks both request limits before reserving an upstream call.
  const reservation = await env.DB.prepare(`INSERT INTO tutor_daily (day, room_id, requests)
    SELECT ?, ?, 1 WHERE
      (SELECT COALESCE(SUM(requests), 0) FROM tutor_daily WHERE day = ?) < ?
      AND COALESCE((SELECT requests FROM tutor_daily WHERE day = ? AND room_id = ?), 0) < ?
    ON CONFLICT(day, room_id) DO UPDATE SET requests = requests + 1
    RETURNING requests`).bind(day, room, day, DAILY_LIMIT, day, room, ROOM_LIMIT).first();
  if (!reservation) return send(429, {error:'daily-limit'});
  await env.DB.prepare('DELETE FROM tutor_daily WHERE day < ?').bind(day).run();

  try {
    const response = await fetch(ARK_URL, {
      method:'POST',
      headers:{'Authorization':'Bearer '+env.ARK_API_KEY, 'Content-Type':'application/json'},
      redirect:'error',
      signal:AbortSignal.timeout(35000),
      body:JSON.stringify({
        model:MODEL,
        max_completion_tokens:650,
        thinking:{type:'disabled'},
        messages:[
          {role:'system',content:PROMPT},
          {role:'user',content:'本题信息\n'+JSON.stringify(context)},
          ...history,
          {role:'user',content:question}
        ]
      })
    });
    const data = await response.json();
    if (response.status === 402 || response.status === 429 || /quota|balance|overdue|limit/i.test(data.error?.code || '')) {
      return send(429, {error:'model-limit'});
    }
    const reply = data.choices?.[0]?.message?.content?.trim();
    return response.ok && reply ? send(200, {reply}) : send(503, {error:'model-unavailable'});
  } catch {
    return send(502, {error:'model-unavailable'});
  }
}
