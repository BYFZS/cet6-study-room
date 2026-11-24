(() => {
  const bridge = window.CET6Android;
  if (!bridge) return;
  function makeMenu(title, triggerLabel) {
    const dialog = document.createElement('dialog');
    dialog.className = 'nativeMenu';
    dialog.setAttribute('aria-label', title);
    const bar = document.createElement('div');
    bar.className = 'nativeMenuTitle';
    const heading = document.createElement('h2');
    heading.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭';
    close.onclick = () => dialog.close();
    bar.append(heading, close);
    const content = document.createElement('div');
    content.className = 'nativeMenuItems';
    dialog.append(bar, content);
    document.body.append(dialog);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = triggerLabel;
    trigger.setAttribute('aria-haspopup', 'dialog');
    content.addEventListener('click', event => {
      if (event.target.closest('a,button')) dialog.close();
    }, true);
    return {trigger, dialog, content};
  }

  function compactNavigation() {
    const moduleNav = document.querySelector('main > .moduleNav');
    const header = document.querySelector('body > header');
    const sidebarLinks = document.getElementById('roomSidebarLinks');
    if (!moduleNav || !header || !sidebarLinks) return;

    const modules = makeMenu('学习模块', '模块');
    modules.trigger.onclick = () => {
      const links = [...sidebarLinks.querySelectorAll('a')].map(link => link.cloneNode(true));
      modules.content.replaceChildren(...links);
      modules.dialog.showModal();
    };

    const more = makeMenu('更多功能', '更多');
    more.trigger.onclick = () => more.dialog.showModal();
    const tools = document.querySelectorAll('#vocabNav a');
    for (const control of header.querySelectorAll('#import,#backup,[data-open-settings]')) more.content.append(control);
    for (const link of tools) more.content.append(link);
    header.append(modules.trigger, more.trigger);
    document.body.classList.add('nativeCompactNavigation');
  }

  function swipeToContinue() {
    const training = document.getElementById('training');
    const next = document.getElementById('nextCard');
    if (!training || !next) return;

    next.textContent = '继续 · 也可右划';
    let swipe;
    const ready = () => !training.hidden && !next.hidden && !next.disabled && !document.querySelector('dialog[open]');
    const reset = () => { swipe = undefined; };
    training.addEventListener('pointerdown', event => {
      if (!event.isPrimary) { reset(); return; }
      if (event.pointerType !== 'touch' || !ready() ||
          event.clientX < 24 || event.clientX > window.innerWidth - 24 ||
          event.target.closest('button,a,input,select,textarea,label,summary,[contenteditable]')) return;
      swipe = {id:event.pointerId, x:event.clientX, y:event.clientY};
    });
    training.addEventListener('pointercancel', reset);
    training.addEventListener('pointerup', event => {
      if (!swipe || swipe.id !== event.pointerId) return;
      const dx = event.clientX - swipe.x;
      const dy = Math.abs(event.clientY - swipe.y);
      reset();
      if (!ready() || dx < 65 || dx < dy * 1.7 || window.getSelection()?.toString()) return;
      next.click();
      if (!training.hidden) {
        window.scrollTo(0, 0);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          training.querySelector('.questionPane')?.animate([
            {transform:'translateX(-18px)', opacity:0.75},
            {transform:'translateX(0)', opacity:1}
          ], {duration:155, easing:'ease-out'});
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    compactNavigation();
    swipeToContinue();
    const settings = document.getElementById('siteSettings');
    if (!settings || typeof bridge.checkForUpdates !== 'function') return;
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = '安卓版本';
    const check = document.createElement('button');
    check.type = 'button';
    check.textContent = '检查更新';
    check.onclick = () => bridge.checkForUpdates();
    section.append(heading, check);
    settings.append(section);
  }, {once:true});

  const createObjectUrl = URL.createObjectURL.bind(URL);
  const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
  const jsonUrls = new Map();
  URL.createObjectURL = blob => {
    const url = createObjectUrl(blob);
    if (blob?.type === 'application/json') jsonUrls.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = url => {
    jsonUrls.delete(url);
    revokeObjectUrl(url);
  };

  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const blob = jsonUrls.get(this.href);
    if (!blob || !this.download) return anchorClick.call(this);
    const name = this.download;
    blob.text().then(json => bridge.saveJson(name, json)).catch(() => {
      window.alert('答卷读取失败，请重新导出。');
    });
  };

  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: class {
      constructor(text) {
        this.text = String(text);
        this.rate = 1;
      }
    }
  });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel: () => bridge.stopSpeech(),
      speak: utterance => bridge.speak(utterance.text, utterance.rate)
    }
  });
})();
