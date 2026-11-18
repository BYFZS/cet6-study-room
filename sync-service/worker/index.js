import {answerQuestion} from './tutor.js';

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

async function hashToken(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

const bearerHash = request => hashToken(request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]);

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
    await db.prepare('DELETE FROM sync_rooms WHERE updated < ? AND id NOT IN (SELECT room_id FROM sync_accounts)')
      .bind(now - ROOM_TTL).run();
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

async function account(request, db, id, send) {
  if (request.method === 'GET') {
    const row = await db.prepare('SELECT salt FROM sync_accounts WHERE id = ?').bind(id).first();
    return row ? send(200, row) : send(404, {error:'account-missing'});
  }
  const access = await bearerHash(request);
  if (!access) return send(401, {error:'unauthorized'});
  if (request.method === 'POST') {
    const exists = await db.prepare('SELECT 1 FROM sync_accounts WHERE id = ?').bind(id).first();
    if (!exists) return send(401, {error:'unauthorized'});
    const window = Math.floor(Date.now() / 600000);
    const permitted = await db.prepare(`INSERT INTO sync_account_attempts (account_id, window, count) VALUES (?, ?, 1)
      ON CONFLICT(account_id) DO UPDATE SET
         count = CASE WHEN window = excluded.window THEN count + 1 ELSE 1 END, window = excluded.window
      WHERE window <> excluded.window OR count < 10 RETURNING count`).bind(id,window).first();
    if (!permitted) return send(429, {error:'login-limit'});
    const row = await db.prepare('SELECT room_id AS room, sealed FROM sync_accounts WHERE id = ? AND access_hash = ?')
      .bind(id,access).first();
    if (!row) return send(401, {error:'unauthorized'});
    await db.prepare('DELETE FROM sync_account_attempts WHERE account_id = ?').bind(id).run();
    return send(200,row);
  }
  if (request.method !== 'PUT') return send(405, {error:'method'});
  const body = await readBody(request, MAX_STATE + 1000);
  const roomAccess = await hashToken(body?.roomToken);
  if (!roomAccess || typeof body.room !== 'string' || !/^[0-9a-f]{32}$/.test(body.room) ||
      typeof body.salt !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(body.salt) ||
      !validSealed(body.sealed, 200) ||
      (body.initial !== undefined && !validSealed(body.initial, MAX_STATE))) {
    return send(400,{error:'payload'});
  }
  const link = db.prepare(`INSERT OR IGNORE INTO sync_accounts (id,salt,access_hash,room_id,sealed)
    SELECT ?,?,?,id,? FROM sync_rooms WHERE id = ? AND access_hash = ?`)
    .bind(id,body.salt,access,body.sealed,body.room,roomAccess);
  let linked;
  if (body.initial !== undefined) {
    const now = Date.now();
    const results = await db.batch([
      db.prepare('DELETE FROM sync_rooms WHERE updated < ? AND id NOT IN (SELECT room_id FROM sync_accounts)')
        .bind(now - ROOM_TTL),
      db.prepare(`INSERT OR IGNORE INTO sync_rooms (id,access_hash,revision,sealed,updated)
        SELECT ?,?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM sync_accounts WHERE id = ?)
        AND (SELECT COUNT(*) FROM sync_rooms) < ?`)
        .bind(body.room,roomAccess,body.initial,now,id,ROOM_LIMIT),
      link
    ]);
    linked = results[2];
  } else {
    linked = await link.run();
  }
  if (linked.meta.changes === 1) return send(201,{room:body.room});
  const conflict = await db.prepare('SELECT 1 FROM sync_accounts WHERE id = ? OR room_id = ?')
    .bind(id,body.room).first();
  return conflict ? send(409,{error:'account-conflict'}) : send(503,{error:'account-unavailable'});
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
    const tutor = path.match(/^\/v1\/tutor\/([0-9a-f]{32})$/);
    if (tutor) {
      if (request.method === 'OPTIONS') return send(204);
      const access = await bearerHash(request);
      return answerQuestion({request, env, room:tutor[1], access, send, readBody});
    }
    const route = path.match(/^\/v1\/(state|pair|account)\/([0-9a-f]{32})$/);
    if (!route) return send(404, {error: 'missing'});
    if (request.method === 'OPTIONS') return send(204);
    if (route[1] === 'account') return account(request, env.DB, route[2], send);
    return route[1] === 'state' ? state(request, env.DB, route[2], send) : pair(request, env.DB, route[2], send);
  }
};
