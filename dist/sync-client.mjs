import {captureProgress, materializeProgress, mergeProgress, readProgressClocks, verifyProgress}
  from './sync-progress.mjs?v=9';
import {syncRequest as request} from './sync-transport.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const STATE_KEY = 'cet6-sync-device-v1';
const ACCOUNT_KEY = 'cet6-sync-account-owner-v1';
const CLOCKS_KEY = 'cet6-sync-clocks-v1';
const MAX_SEALED = 1_300_000;
const MAX_PLAIN = 24_000_000;

const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const random = size => crypto.getRandomValues(new Uint8Array(size));

function base64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(text) {
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

async function encryptionKey(domain, secret) {
  return crypto.subtle.importKey('raw', await digest(domain + ':' + secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(key, id, payload) {
  const nonce = random(12);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(id)
  }, key, payload));
  const bytes = new Uint8Array(nonce.length + encrypted.length);
  bytes.set(nonce);
  bytes.set(encrypted, nonce.length);
  return base64(bytes);
}

async function unseal(key, id, sealed) {
  const bytes = fromBase64(sealed);
  return new Uint8Array(await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(id)
  }, key, bytes.subarray(12)));
}

async function compress(text) {
  const raw = encoder.encode(text);
  if (raw.byteLength > MAX_PLAIN) throw new Error('学习历史已超过同步容量，请先导出备份');
  if (!globalThis.CompressionStream) return raw;
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes) {
  if (bytes[0] !== 31 || bytes[1] !== 139) return decoder.decode(bytes);
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const utf8 = new TextDecoder();
  let size = 0;
  let result = '';
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) return result + utf8.decode();
      size += value.byteLength;
      if (size > MAX_PLAIN) {
        await reader.cancel();
        throw new Error('同步记录超过读取上限');
      }
      result += utf8.decode(value, {stream: true});
    }
  } finally {
    reader.releaseLock();
  }
}

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

async function roomKeys(secret) {
  return {
    secret,
    id: toHex(await digest('cet6-room:' + secret)).slice(0, 32),
    token: toHex(await digest('cet6-access:' + secret)),
    encryption: await encryptionKey('cet6-progress', secret)
  };
}

export async function tutorAccess() {
  const config = loadJSON(STATE_KEY);
  if (!/^[A-Za-z0-9_-]{43}$/.test(config?.secret || '')) return null;
  const {id, token} = await roomKeys(config.secret);
  return {path:'tutor/' + id, token};
}

function validateAccount(name,password) {
  const username = name.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) throw new Error('账号用 3–32 个字母、数字、下划线或短横线。');
  if (password.length < 12 || password.length > 128) throw new Error('请输入 12–128 个字符的密码。');
  return username;
}

const accountId = async username => toHex(await digest('cet6-account:'+username)).slice(0,32);

async function accountKeys(password,salt) {
  const material = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bytes = new Uint8Array(await crypto.subtle.deriveBits({
    name:'PBKDF2', salt:fromBase64(salt), iterations:600000, hash:'SHA-256'
  },material,512));
  return {
    token:toHex(bytes.subarray(0,32)),
    encryption:await crypto.subtle.importKey('raw',bytes.subarray(32),'AES-GCM',false,['encrypt','decrypt'])
  };
}

async function pairKeys(code) {
  return {
    id: toHex(await digest('cet6-pair:' + code)).slice(0, 32),
    encryption: await encryptionKey('cet6-pair-transfer', code)
  };
}

function restoreObservations(db, config) {
  const saved = loadJSON(CLOCKS_KEY);
  if (!saved || saved.device !== config.device || saved.room !== config.room) return null;
  return {
    memories: Object.fromEntries(Object.entries(saved.clocks.memories).filter(([word]) => db.memories[word])
      .map(([word, clock]) => [word, {...clock, value: structuredClone(db.memories[word])}])),
    overrides: saved.clocks.overrides
  };
}

export function initProgressSync({getDB, getWords, canApply, apply, onStatus}) {
  let config = loadJSON(STATE_KEY);
  let owner = config?.account || loadJSON(ACCOUNT_KEY);
  let observed = config ? restoreObservations(getDB(), config) : null;
  let pending = null;
  let active = null;
  let starting = false;
  let timer;
  const report = snapshot => onStatus({...snapshot,account:config?.account,owner});
  function saveConfig() {
    localStorage.setItem(STATE_KEY, JSON.stringify(config));
    if (config.account) {
      owner = config.account;
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(owner));
    }
  }

  function checkedUsername(name,password) {
    const username = validateAccount(name,password);
    if (owner && owner !== username) {
      throw new Error('这台设备的本地进度已关联账号 '+owner+'。请登录该账号。');
    }
    return username;
  }

  function remember(snapshot) {
    observed = snapshot;
    try {
      localStorage.setItem(CLOCKS_KEY, JSON.stringify({
        device: config.device, room: config.room, clocks: readProgressClocks(snapshot)
      }));
    } catch {
      // Actual word and answer records are saved independently by the trainer.
    }
  }

  function capture() {
    const snapshot = captureProgress(getDB(), observed, config.device);
    remember(snapshot);
    return snapshot;
  }

  function applyPending(updateStatus = false) {
    if (!pending || !canApply()) return;
    const next = mergeProgress(capture(), pending);
    pending = null;
    apply(materializeProgress(structuredClone(next)));
    remember(next);
    if (updateStatus && config.syncedAt) report({enabled:true,phase:'synced',at:config.syncedAt});
  }

  async function exchange(allowCreate) {
    const keys = await roomKeys(config.secret);
    const path = 'state/' + keys.id;
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await request(path, {token: keys.token});
      const creating = current.status === 404 && allowCreate;
      if (!creating && current.status !== 200) throw new Error('同步空间暂时不可用');
      let remote = null;
      if (!creating) {
        const clear = await unseal(keys.encryption, keys.id, current.data.sealed);
        remote = verifyProgress(JSON.parse(await decompress(clear)), getWords());
      }
      const combined = mergeProgress(mergeProgress(capture(), pending), remote);
      const content = JSON.stringify(combined);
      if (content !== JSON.stringify(remote)) {
        const sealed = await seal(keys.encryption, keys.id, await compress(content));
        if (sealed.length > MAX_SEALED) throw new Error('学习历史已超过同步容量，请先导出备份');
        const result = await request(path, {
          method: 'PUT', token: keys.token, body: {expected: creating ? 0 : current.data.revision, sealed}
        });
        if (result.status === 409) continue;
        if (![200, 201].includes(result.status)) throw new Error('无法保存同步记录，请稍后重试');
      }
      pending = combined;
      applyPending();
      config.syncedAt = Date.now();
      saveConfig();
      report({enabled: true, phase: 'synced', at: config.syncedAt, pending: Boolean(pending)});
      return keys;
    }
    throw new Error('另一台设备正在更新，稍后自动重试');
  }

  async function connect(secret, allowCreate, username) {
    starting = true;
    try {
      const keys = await roomKeys(secret);
      config = {secret, room: keys.id, device: toHex(random(16)), account:username};
      observed = null;
      pending = null;
      return await exchange(allowCreate);
    } catch (error) {
      config = null;
      observed = null;
      pending = null;
      localStorage.removeItem(CLOCKS_KEY);
      throw error;
    } finally {
      starting = false;
    }
  }

  function run() {
    if (!config || starting || active) return active;
    if (!navigator.onLine) {
      report({enabled: true, phase: 'offline'});
      return;
    }
    active = exchange(false).catch(error => {
      report({enabled: true, phase: 'retry', detail: error.message});
    }).finally(() => {
      active = null;
    });
    return active;
  }

  function changed() {
    if (!config) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!config || starting) return;
      try {
        capture();
        applyPending();
        run();
      } catch (error) {
        report({enabled: true, phase: 'retry', detail: error.message});
      }
    }, 850);
  }

  window.addEventListener('online', run);
  window.addEventListener('focus', run);
  window.addEventListener('offline', () => { if (config) report({enabled: true, phase: 'offline'}); });
  window.addEventListener('pagehide', () => { if (config && !starting) capture(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  setInterval(() => { if (!document.hidden) run(); }, 20000);
  if (config) {
    report({enabled: true, phase: 'waiting', at: config.syncedAt});
    run();
  } else report({enabled: false, phase: 'off'});

  return {
    changed, applyPending: () => applyPending(true),
    async register(name,password) {
      const username = checkedUsername(name,password);
      if (owner) throw new Error('该设备已有同步账号，请选择登录。');
      const id = await accountId(username);
      const salt = base64(random(16));
      const auth = await accountKeys(password,salt);
      const keys = await roomKeys(config?.secret || base64(random(32)));
      const device = config?.device || toHex(random(16));
      const body = {
        salt, room:keys.id, roomToken:keys.token,
        sealed:await seal(auth.encryption,id,encoder.encode(keys.secret))
      };
      if (!config) {
        const snapshot = captureProgress(getDB(),null,device);
        body.initial = await seal(keys.encryption,keys.id,await compress(JSON.stringify(snapshot)));
        if (body.initial.length > MAX_SEALED) throw new Error('学习历史已超过同步容量，请先导出备份。');
      }
      const result = await request('account/'+id,{method:'PUT',token:auth.token,body});
      if (result.status === 409) throw new Error('账号已存在或当前同步空间已有账号。请尝试登录。');
      if (result.status !== 201) throw new Error('账号暂时无法创建，请稍后重试。');
      config = {...config,secret:keys.secret,room:keys.id,device,account:username};
      saveConfig();
      report({enabled:true,phase:'waiting',at:config.syncedAt});
      run();
    },
    async login(name,password) {
      const username = checkedUsername(name,password);
      const badPassword = '账号或密码不正确。';
      const id = await accountId(username);
      const path = 'account/'+id;
      const lookup = await request(path);
      if (lookup.status === 404) throw new Error(badPassword);
      if (lookup.status !== 200) throw new Error('账号服务暂时不可用。');
      const auth = await accountKeys(password,lookup.data.salt);
      const result = await request(path,{method:'POST',token:auth.token});
      if (result.status === 429) throw new Error('尝试次数过多，请过几分钟再登录。');
      if (result.status === 401) throw new Error(badPassword);
      if (result.status !== 200) throw new Error('账号服务暂时不可用。');
      const secret = decoder.decode(await unseal(auth.encryption,id,result.data.sealed));
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('账号同步数据无效。');
      const keys = await roomKeys(secret);
      if (keys.id !== result.data.room) throw new Error('账号同步数据不匹配。');
      if (config && config.room !== keys.id) {
        throw new Error('本机已绑定另一个同步空间。请先导出学习记录并断开原有同步。');
      }
      if (!config) await connect(secret,false,username);
      else {
        config = {...config,account:username};
        saveConfig();
        report({enabled:true,phase:'waiting',at:config.syncedAt});
        run();
      }
    },
    async createCode() {
      if (owner && !config) throw new Error('请先登录本机的同步账号。');
      const keys = config ? await roomKeys(config.secret) : await connect(base64(random(32)), true);
      const code = base64(random(16));
      const pairing = await pairKeys(code);
      const sealed = await seal(pairing.encryption, pairing.id, encoder.encode(keys.secret));
      const result = await request('pair/' + pairing.id, {
        method: 'PUT', token: keys.token, body: {room: keys.id, sealed}
      });
      if (result.status !== 201) throw new Error('暂时无法生成配对码，请稍后重试');
      return code;
    },
    async join(code) {
      if (owner) throw new Error('本机已有同步账号，请用账号登录。');
      if (config) throw new Error('请先断开本机原有同步');
      code = code.trim();
      if (!/^[A-Za-z0-9_-]{22}$/.test(code)) throw new Error('请粘贴电脑生成的完整配对码');
      const pairing = await pairKeys(code);
      const result = await request('pair/' + pairing.id, {method: 'POST'});
      if (result.status !== 200) throw new Error('配对码已使用或过期，请在电脑重新生成');
      const secret = decoder.decode(await unseal(pairing.encryption, pairing.id, result.data.sealed));
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('配对数据无效');
      await connect(secret, false);
    },
    async disconnect() {
      await active;
      clearTimeout(timer);
      config = null;
      observed = null;
      pending = null;
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(CLOCKS_KEY);
      report({enabled: false, phase: 'off'});
    }
  };
}
