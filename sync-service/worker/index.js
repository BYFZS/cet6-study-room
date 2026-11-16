const CLIENTS = new Set([
  'https://cet6-study-nov26-parrot.linedsunflower3.chatgpt.site',
  'https://appassets.androidplatform.net'
]);
const MAX_STATE = 1_300_000;
const MAX_PAIR = 500;
const ROOM_LIMIT = 128;
const PAIR_LIMIT = 4;
const ROOM_TTL = 180 * 24 * 60 * 60 * 1000;
const PAIR_TTL = 10 * 60 * 1000;
const encoder = new TextEncoder();

function response(origin, status, value) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
  if (CLIENTS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'GET, PUT, POST, OPTIONS';
    headers['Access-Control-Max-Age'] = '600';
  }
  return new Response(value === undefined ? null : JSON.stringify(value), {status, headers});
}

async function readBody(request, limit) {
  if (!request.body || Number(request.headers.get('Content-Length')) > limit) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, {stream: true});
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function bearerHash(request) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if (!token) return null;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validSealed(value, limit) {
  return typeof value === 'string' && value.length > 40 && value.length <= limit &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

async function state(request, db, id, send) {
  const access = await bearerHash(request);
  if (!access) return send(401, {error: 'unauthorized'});
  const row = await db.prepare('SELECT revision, sealed FROM sync_rooms WHERE id = ? AND access_hash = ?')
    .bind(id, access).first();
  if (request.method === 'GET') {
    return row ? send(200, row) : send(404, {error: 'missing'});
  }
  if (request.method !== 'PUT') return send(405, {error: 'method'});
  const body = await readBody(request, MAX_STATE + 100);
  if (!Number.isSafeInteger(body?.expected) || body.expected < 0 || !validSealed(body.sealed, MAX_STATE)) {
    return send(400, {error: 'payload'});
  }
  const now = Date.now();
  if (body.expected === 0) {
    if (row) return send(409, {error: 'revision'});
    await db.prepare('DELETE FROM sync_rooms WHERE updated < ?').bind(now - ROOM_TTL).run();
    const created = await db.prepare(`INSERT OR IGNORE INTO sync_rooms (id, access_hash, revision, sealed, updated)
      SELECT ?, ?, 1, ?, ? WHERE (SELECT COUNT(*) FROM sync_rooms) < ? RETURNING revision`)
      .bind(id, access, body.sealed, now, ROOM_LIMIT).first();
    if (created) return send(201, created);
    const existing = await db.prepare('SELECT revision FROM sync_rooms WHERE id = ?').bind(id).first();
    return existing ? send(409, {error: 'revision'}) : send(503, {error: 'capacity'});
  }
  if (!row) return send(404, {error: 'missing'});
  const updated = await db.prepare(`UPDATE sync_rooms SET revision = revision + 1, sealed = ?, updated = ?
    WHERE id = ? AND access_hash = ? AND revision = ? RETURNING revision`)
    .bind(body.sealed, now, id, access, body.expected).first();
  return updated ? send(200, updated) : send(409, {error: 'revision'});
}

async function pair(request, db, id, send) {
  if (request.method === 'POST') {
    const claimed = await db.prepare('DELETE FROM sync_pairs WHERE id = ? AND expires > ? RETURNING sealed')
      .bind(id, Date.now()).first();
    return claimed ? send(200, claimed) : send(404, {error: 'expired'});
  }
  if (request.method !== 'PUT') return send(405, {error: 'method'});
  const access = await bearerHash(request);
  if (!access) return send(401, {error: 'unauthorized'});
  const body = await readBody(request, MAX_PAIR + 100);
  if (typeof body?.room !== 'string' || !/^[0-9a-f]{32}$/.test(body.room) ||
      !validSealed(body.sealed, MAX_PAIR)) return send(400, {error: 'payload'});
  const now = Date.now();
  await db.prepare('DELETE FROM sync_pairs WHERE expires <= ?').bind(now).run();
  const made = await db.prepare(`INSERT OR IGNORE INTO sync_pairs (id, room_id, sealed, expires)
    SELECT ?, id, ?, ? FROM sync_rooms
    WHERE id = ? AND access_hash = ? AND (SELECT COUNT(*) FROM sync_pairs WHERE room_id = ?) < ?
    RETURNING expires`)
    .bind(id, body.sealed, now + PAIR_TTL, body.room, access, body.room, PAIR_LIMIT).first();
  return made ? send(201, made) : send(409, {error: 'pair-unavailable'});
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const send = (status, value) => response(origin, status, value);
    const path = new URL(request.url).pathname;
    if (path === '/' && request.method === 'GET') return send(200, {service: 'CET6 encrypted sync', version: 1});
    if (!CLIENTS.has(origin)) return send(403, {error: 'origin'});
    const route = path.match(/^\/v1\/(state|pair)\/([0-9a-f]{32})$/);
    if (!route) return send(404, {error: 'missing'});
    if (request.method === 'OPTIONS') return send(204);
    return route[1] === 'state' ? state(request, env.DB, route[2], send) : pair(request, env.DB, route[2], send);
  }
};
