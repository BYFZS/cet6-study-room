import {initProgressSync} from './sync-client.mjs?v=24';

export function setupSyncUI(options) {
  const byId = id => document.getElementById(id);
  const dialog = byId('syncDialog');
  const error = byId('syncMessage');
  const create = byId('createSyncCode');
  const join = byId('joinSyncCode');
  const unlink = byId('stopSync');
  const input = byId('syncJoinInput');
  const code = byId('syncCodeValue');
  const accountForm = byId('syncAccountForm');
  const register = byId('registerSyncAccount');
  const login = byId('loginSyncAccount');
  const username = byId('syncAccountName');
  const password = byId('syncAccountPassword');
  let enabled = false;
  let account, owner;
  let busy = false;

  function controls() {
    create.textContent = enabled ? '生成新配对码' : '启用同步并生成配对码';
    byId('syncJoin').hidden = enabled;
    unlink.hidden = !enabled;
    accountForm.hidden = Boolean(account);
    register.hidden = Boolean(owner);
    byId('syncLegacy').hidden = Boolean(owner) && !enabled;
    username.readOnly = Boolean(owner);
    if (owner) username.value = owner;
    unlink.textContent = account ? '退出同步账号' : '断开本机同步';
    for (const button of [create, join, unlink, register, login]) button.disabled = busy;
  }

  function status(snapshot) {
    enabled = snapshot.enabled;
    account = snapshot.account;
    window.dispatchEvent(new CustomEvent('cet6-sync-account', {detail:account}));
    owner = snapshot.owner;
    const updated = snapshot.at ? new Date(snapshot.at).toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit'
    }) : '';
    const label = {
      off: '词汇进度保存在本机',
      waiting: '正在连接同步服务…',
      offline: '当前离线 · 联网后自动同步',
      retry: '同步暂停 · 已保存到本机',
      synced: snapshot.pending ? '已同步 · 在当前题结束后更新' : '已自动同步 · ' + updated
    }[snapshot.phase];
    byId('syncStatus').textContent = label;
    byId('syncDialogStatus').textContent = account ? account + ' · ' + label : label;
    if (snapshot.phase === 'retry') error.textContent = snapshot.detail;
    else if (snapshot.phase === 'synced' && !busy) error.textContent = '';
    controls();
  }

  const sync = initProgressSync({...options, onStatus: status});
  async function action(doWork) {
    if (busy) return;
    busy = true;
    error.textContent = '';
    controls();
    try { await doWork(); } catch (err) {
      error.textContent = err.message;
    } finally {
      busy = false;
      controls();
    }
  }

  byId('showSync').onclick = () => dialog.showModal();
  byId('closeSync').onclick = () => dialog.close();
  dialog.addEventListener('close',()=>{password.value='';});
  accountForm.onsubmit = event => {
    event.preventDefault();
    const creating = event.submitter === register;
    const pass = password.value;
    password.value = '';
    action(async () => {
      if (creating) await sync.register(username.value,pass);
      else await sync.login(username.value,pass);
      if (!error.textContent) error.textContent = creating ? '账号已创建。请在另一台设备登录同一账号。' : '已登录，联网后自动同步。';
    });
  };
  create.onclick = () => action(async () => {
    code.value = await sync.createCode();
    byId('syncCodePanel').hidden = false;
    code.select();
  });
  byId('copySyncCode').onclick = async () => {
    try {
      await navigator.clipboard.writeText(code.value);
      error.textContent = '配对码已复制。';
    } catch { code.select(); }
  };
  const pair = () => action(async () => {
    await sync.join(input.value);
    input.value = '';
    error.textContent = '已绑定，联网时会自动同步。';
  });
  join.onclick = pair;
  input.onkeydown = event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      pair();
    }
  };
  unlink.onclick = () => action(async () => {
    if (!confirm('断开后，这台设备会停止和其他设备同步。已保存的本机进度会保留。')) return;
    await sync.disconnect();
    code.value = '';
    byId('syncCodePanel').hidden = true;
  });
  return sync;
}
