import {playAnswerSound} from './answer-sounds.mjs?v=34';

const base = 'https://www.cettong.cn/library/cet6/2025_06_1/';
const parts = [
  ['长对话 1', 1, 4, 0],
  ['长对话 2', 5, 8, 236],
  ['短文 1', 9, 11, 433],
  ['短文 2', 12, 15, 641],
  ['讲座 1', 16, 18, 833],
  ['讲座 2', 19, 21, 1103],
  ['讲座 3', 22, 25, 1322]
];
const key = 'C B D A A D C D C B A C C B B D A B A D C D A D B'.split(' ');
const audioTime = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

export function listeningOptions(pages) {
  const questions = [];
  for (const page of pages) {
    let options = null;
    for (const line of page) {
      if (/^(?:Questions\s+\d|Section\s+[ABC]|Part\s+III\b)/.test(line)) options = null;
      const header = /^(\d{1,2})\.\s+(?=A\))/.exec(line);
      if (header && Number(header[1]) === questions.length + 1 && questions.length < key.length) {
        options = {};
        questions.push(options);
      }
      if (!options) continue;
      const text = header ? line.slice(header[0].length) : line;
      const markers = [...text.matchAll(/(?:^|\s)([A-D])\)\s*/g)];
      markers.forEach((match, i) => {
        options[match[1]] = text.slice(match.index + match[0].length, markers[i + 1]?.index).trim();
      });
    }
  }
  const choices = questions.map(options => 'ABCD'.split('').map(letter => options[letter]));
  if (choices.length !== key.length || choices.some(items => items.some(text => !text))) {
    throw new Error('听力原卷选项不完整');
  }
  return choices;
}

async function readOptions() {
  const pdfjs = await import('./vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({url:base + 'test.pdf', isEvalSupported:false});
  try {
    const pdf = await task.promise;
    const pages = await Promise.all([1,2,3].map(async number => {
      const page = await pdf.getPage(number);
      const {items} = await page.getTextContent();
      return items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('').split('\n').map(line => line.trim());
    }));
    return listeningOptions(pages);
  } finally {
    await task.destroy();
  }
}

export function mountListening(exercise) {
  const add = (parent, tag, text = '') => {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.append(node);
    return node;
  };
  exercise.closest('.practicePanel').classList.add('listeningPanel');
  const picker = add(exercise,'div');
  picker.className = 'listeningParts';
  picker.setAttribute('role','group');
  picker.setAttribute('aria-label','听力分段');
  const buttons = parts.map(([name, first, last], index) => {
    const btn = add(picker,'button',name);
    btn.type = 'button';
    add(btn,'span',first + '–' + last + ' 题');
    btn.onclick = () => select(index);
    return btn;
  });

  const audio = new Audio();
  audio.preload = 'metadata';
  const transport = add(exercise,'div');
  transport.className = 'listeningTransport';
  const play = add(transport,'button','播放本段');
  play.type = 'button';
  play.className = 'primary';
  const seek = add(transport,'input');
  seek.type = 'range';
  seek.min = 0;
  seek.max = 0;
  seek.step = '.1';
  seek.value = 0;
  seek.disabled = true;
  seek.setAttribute('aria-label','本段播放进度');
  const time = add(transport,'span','0:00 / 0:00');
  const playback = add(exercise,'p');
  playback.setAttribute('role','status');
  const content = add(exercise,'section');
  const links = add(exercise,'div');
  links.className = 'listeningLinks';
  for (const [label,href] of [
    ['听力原卷',base+'test.pdf'],
    ['备用分段练习','https://eol.nju.edu.cn/cet6/papers/202506-1.html'],
    ['完整模拟考试','index.html?exam=1']
  ]) {
    const link = add(links,'a',label);
    link.href = href;
    if (href.startsWith('https:')) {link.target='_blank';link.rel='noopener';}
  }
  let selected = 0;
  let choices;
  let loading = true;
  const responses = new Map();
  const submitted = new Set();
  const start = () => parts[selected][3];
  const end = () => parts[selected + 1]?.[3] ?? (Number.isFinite(audio.duration) ? audio.duration : 1557);
  const updatePlayer = () => {
    const duration = Math.max(0, end() - start());
    const elapsed = Math.max(0, Math.min(duration, audio.currentTime - start()));
    seek.max = duration;
    seek.value = elapsed;
    time.textContent = audioTime(elapsed) + ' / ' + audioTime(duration);
    play.textContent = audio.paused ? (elapsed >= duration ? '重播本段' : '播放本段') : '暂停';
  };
  function select(index) {
    audio.pause();
    selected = index;
    playback.textContent = '';
    if (audio.readyState) audio.currentTime = start();
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    updatePlayer();
    renderQuestions();
  }
  play.onclick = async () => {
    if (!audio.paused) {audio.pause();return;}
    try {
      if (audio.currentTime < start() || audio.currentTime >= end() - .15) audio.currentTime = start();
      audio.playbackRate = 1;
      await audio.play();
      playback.textContent = '';
    } catch {
      playback.textContent = '暂时无法播放原录音，可重试或打开备用分段练习。';
    }
  };
  seek.oninput = () => {audio.currentTime = start() + Number(seek.value);updatePlayer();};
  audio.addEventListener('loadedmetadata', () => {
    seek.disabled = false;
    if (audio.currentTime < start()) audio.currentTime = start();
    updatePlayer();
  });
  audio.addEventListener('timeupdate', () => {
    if (!audio.paused && audio.currentTime >= end()) {
      audio.pause();
      audio.currentTime = end();
    }
    updatePlayer();
  });
  for (const event of ['play','pause','ended']) audio.addEventListener(event, updatePlayer);
  audio.addEventListener('error', () => {
    playback.textContent = '原录音暂时无法加载，可打开备用分段练习。';
  });

  function renderQuestions() {
    content.replaceChildren();
    const [name,first,last] = parts[selected];
    add(content,'h3',name + ' · 第 ' + first + '–' + last + ' 题');
    if (!choices) {
      const status = add(content,'p',loading ? '正在读取原卷选项…' : '暂时无法读取原卷选项。');
      status.setAttribute('role','status');
      if (!loading) add(content,'button','重试').onclick = load;
      return;
    }
    const form = add(content,'form');
    const results = [];
    for (let n = first; n <= last; n++) {
      const group = add(form,'fieldset');
      group.className = 'listeningQuestion';
      add(group,'legend','第 ' + n + ' 题');
      for (const [index, text] of choices[n-1].entries()) {
        const label = add(group,'label');
        const input = add(label,'input');
        const letter = 'ABCD'[index];
        input.type = 'radio';
        input.name = 'q' + n;
        input.value = letter;
        input.required = index === 0;
        input.checked = responses.get(n) === letter;
        input.onchange = () => {
          responses.set(n,letter);
          if (submitted.delete(selected)) results.forEach(({result}) => {result.hidden=true;});
        };
        add(label,'span',letter + '. ' + text).lang = 'en';
      }
      const result = add(group,'p');
      result.hidden = true;
      result.className = 'listeningResult';
      result.setAttribute('role','status');
      results.push({n,result});
    }
    const grade = () => {
      let correct = 0;
      for (const {n,result} of results) {
        const right = responses.get(n) === key[n-1];
        correct += Number(right);
        result.textContent = right ? '答对了' : '正确选项 ' + key[n-1];
        result.hidden = false;
      }
      return correct;
    };
    if (submitted.has(selected)) grade();
    const check = add(form,'button','核对本段答案');
    check.className = 'primary';
    form.onsubmit = event => {
      event.preventDefault();
      submitted.add(selected);
      playAnswerSound(grade() === results.length);
    };
  }

  async function load() {
    loading = true;
    renderQuestions();
    try {choices = await readOptions();}
    catch {choices = null;}
    loading = false;
    renderQuestions();
  }
  select(0);
  audio.src = base + 'listening.mp3';
  load();
}
