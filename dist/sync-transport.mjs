export const SYNC_URL = 'https://cet6-sync-nov26.linedsunflower3.chatgpt.site';
const pending = new Map();
const messages = {
  dns:'安卓无法解析同步服务地址。请切换 Wi‑Fi 或移动数据后重试。',
  tls:'安卓无法建立安全连接。请检查系统日期与当前网络。',
  timeout:'同步连接超时。请切换网络后重试。',
  network:'当前网络无法连接同步服务。',
  request:'同步请求无效。'
};

function nativeRequest(bridge, path, method, token, body, signal) {
  window.cet6SyncReply ??= (id, status, text, error) => pending.get(id)?.({status, body:text, error});
  return new Promise((resolve,reject) => {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
    function cleanup() { pending.delete(id); signal.removeEventListener('abort',abort); }
    function abort() { cleanup(); reject(signal.reason); }
    if (signal.aborted) return abort();
    signal.addEventListener('abort',abort,{once:true});
    pending.set(id, reply => { cleanup(); resolve(reply); });
    try { bridge.syncRequest(id,'/v1/'+path,method,token || '',body); }
    catch (error) { cleanup(); reject(error); }
  });
}

export async function syncRequest(path, {method='GET',token,body,signal,timeout=28000} = {}) {
  const controller = new AbortController();
  const stop = () => controller.abort(signal.reason);
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort',stop,{once:true});
  const clock = setTimeout(() => controller.abort(new Error(messages.timeout)),timeout);
  const payload = body === undefined ? null : JSON.stringify(body);
  try {
    const bridge = window.CET6Android;
    let status, text;
    if (typeof bridge?.syncRequest === 'function') {
      const response = await nativeRequest(bridge,path,method,token,payload,controller.signal);
      if (response.error) throw new Error(messages[response.error] || messages.network);
      status = response.status;
      text = response.body;
    } else {
      const headers = {};
      if (token) headers.Authorization = 'Bearer '+token;
      if (payload !== null) headers['Content-Type'] = 'application/json';
      const response = await fetch(SYNC_URL+'/v1/'+path,{
        method,headers,body:payload,credentials:'omit',cache:'no-store',
        redirect:'error',signal:controller.signal
      });
      status = response.status;
      text = await response.text();
    }
    try { return {status,data:JSON.parse(text)}; }
    catch { throw new Error('同步服务返回异常，请稍后重试。'); }
  } catch (error) {
    if (error instanceof TypeError) throw new Error(messages.network);
    throw error;
  } finally {
    clearTimeout(clock);
    signal?.removeEventListener('abort',stop);
  }
}
