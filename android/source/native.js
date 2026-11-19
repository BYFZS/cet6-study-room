(() => {
  const bridge = window.CET6Android;
  if (!bridge) return;
  document.addEventListener('DOMContentLoaded', () => {
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
