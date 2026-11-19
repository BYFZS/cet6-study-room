export const STUDY_ACTIVITY = 'study-activity';
const IDLE_MS = 3 * 60 * 1000;

export function trackStudyActivity({isStudying, record}) {
  let activeSince = null;
  let lastAction = 0;
  let idleTimer = 0;
  let eligible = false;

  function finish(now = Date.now()) {
    clearTimeout(idleTimer);
    idleTimer = 0;
    if (activeSince === null) return;
    const start = activeSince;
    const end = Math.min(now, lastAction + IDLE_MS);
    activeSince = null;
    if (end > start) record(start, end);
  }

  function checkIdle() {
    const remaining = lastAction + IDLE_MS - Date.now();
    if (remaining > 0) idleTimer = setTimeout(checkIdle, remaining);
    else finish();
  }

  function touch() {
    const now = Date.now();
    if (activeSince !== null && (now < lastAction || now - lastAction >= IDLE_MS)) finish(now);
    activeSince ??= now;
    lastAction = now;
    if (!idleTimer) idleTimer = setTimeout(checkIdle, IDLE_MS);
  }

  function pause() {
    eligible = false;
    finish();
  }

  function refresh() {
    if (document.hidden || !document.hasFocus() || !isStudying()) {
      pause();
      return;
    }
    if (!eligible) {
      eligible = true;
      touch();
    }
  }

  const interact = () => {
    refresh();
    if (eligible) touch();
  };
  for (const event of ['pointerdown', 'keydown', 'input', 'scroll']) {
    document.addEventListener(event, interact, {capture:true, passive:true});
  }
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('blur', pause);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('pagehide', pause);
  return {refresh, pause};
}
