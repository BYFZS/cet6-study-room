import {playAnswerSound} from './answer-sounds.mjs?v=44';

const base = 'https://www.cettong.cn/library/cet6/2025_06_1/';
const clipBase = 'https://www.yingyuzhenti.com/cet-audio/cet6_2025_06_1/';
const parts = [
  ['长对话 1', 1, 4, '7e9855e1a1e6290162f7', 198, [[2,.31,.797]]],
  ['长对话 2', 5, 8, '1ab4207e42b9a768b742', 216, [[3,.394,.91]]],
  ['短文 1', 9, 11, '5cf7830b8ae23b723b9c', 157, [[4,.54,.943]]],
  ['短文 2', 12, 15, 'b9df861b50d6eb173864', 163, [[5,.574,.94],[6,.031,.081]]],
  ['讲座 1', 16, 18, 'baec93109e1d65af509e', 223, [[6,.697,.947],[7,.031,.344]]],
  ['讲座 2', 19, 21, 'b7f2d96e7554931fabb6', 192, [[7,.899,.949],[8,.032,.423]]],
  ['讲座 3', 22, 25, '6edafa10441e88a3a82e', 221, [[9,.032,.529]]]
];
const explanations = [
  '女士说她上周二已打电话向这家公司求助，眼前的维修员是这次才来的。',
  '维修员说自己一接到通知就尽快赶来了，题目问的是他接电话后的行动。',
  '女士说经理因维修人员迟迟未到而十分不满，最贴切的情绪是愤怒。',
  '被问到文件有没有备份时，女士表示经理会知道。这里问的是备份状态。',
  '男士提到不少人会觉得法律工作枯燥，但那是别人的看法。',
  '男士举例说自己的日常工作多半在调解土地相关的纠纷。',
  '男士提到打官司可能耗钱又让人受挫，所以条件允许时会尝试庭外解决。',
  '对话最后谈到法律从业者的人际技能，男士强调应当清晰有力地表达观点。',
  '研究综述针对老人为什么越来越难提取特定记忆提出了解释。',
  '研究发现，老年人较难抑制无关信息，检索目标记忆时往往会连带想起无关内容。',
  '结尾举出的证据是，丰富的记忆可帮助老年人维持创造力，有时还能提升它。',
  '短文指出，许多员工对工作方式、地点和内容缺乏自主权，也很难分享工作带来的收益。',
  '作者把长工时与没有足够的自由时间和心理状态变差联系起来。',
  '短文把自动化列为工作问题之一，因为它可能威胁岗位和工资。',
  '末尾的观点是把生活本身放在首位，工作不应该占据生活的中心。',
  '开头把对努力的积极信念与更好的学习成绩联系起来，提到表现可能超过先前水平相近的人。',
  '实验里音乐实际由研究人员通过隐藏的按钮开启，婴儿看不到这个动作。',
  '婴儿观察到付出努力有价值后，会把这个经验用到随后遇到的新任务上。',
  '整段讲话围绕迟到展开，先说明后果，再提出改掉迟到习惯的方法。',
  '讲者建议早晨总是手忙脚乱的人，在前一天晚上尽量准备妥当。',
  '讲者建议在算好的交通时间之外另外留出一段缓冲，以应对意外延误。',
  '开头提到游客可能觉得不同城市友好或冷淡，强调各地给人的感受各不相同。',
  '这项研究的比较发现是，波士顿居民比其他美国城市的居民更少主动帮助陌生人。',
  '奥康纳说陌生人互相打招呼并不属于波士顿的当地文化。',
  '结尾提到巴黎与纽约在努力改善待客形象，讲者建议波士顿也可以效仿。'
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

async function examPdf(file) {
  const pdfjs = await import('./vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).href;
  return pdfjs.getDocument({
    url:base + file, isEvalSupported:false, disableAutoFetch:true, disableStream:true
  });
}

async function readOptions() {
  const cacheKey = 'cet6-202506-1-listening-options-v1';
  try {
    const saved = JSON.parse(sessionStorage.getItem(cacheKey));
    if (saved?.length === key.length && saved.every(row => Array.isArray(row) &&
      row.length === 4 && row.every(value => typeof value === 'string' && value.trim()))) return saved;
  } catch {}
  const task = await examPdf('test.pdf');
  try {
    const pdf = await task.promise;
    const pages = await Promise.all([1,2,3].map(async number => {
      const page = await pdf.getPage(number);
      const {items} = await page.getTextContent();
      return items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('').split('\n').map(line => line.trim());
    }));
    const options = listeningOptions(pages);
    try {sessionStorage.setItem(cacheKey, JSON.stringify(options));} catch {}
    return options;
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
  audio.preload = 'none';
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
    ['分段音频来源','https://www.yingyuzhenti.com/cet-6/papers/139/listening'],
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
  let reviewPdf;
  let clipReady = false;
  const duration = () => clipReady && Number.isFinite(audio.duration) ? audio.duration : parts[selected][4];
  const updatePlayer = () => {
    const elapsed = clipReady ? Math.max(0,Math.min(duration(),audio.currentTime)) : 0;
    seek.max = duration();
    seek.value = elapsed;
    time.textContent = audioTime(elapsed) + ' / ' + audioTime(duration());
    play.textContent = audio.paused ? (audio.ended ? '重播本段' : '播放本段') : '暂停';
  };
  function select(index) {
    audio.pause();
    selected = index;
    playback.textContent = '';
    seek.disabled = true;
    clipReady = false;
    audio.src = clipBase + parts[index][3] + '.mp3';
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    updatePlayer();
    renderQuestions();
  }
  play.onclick = async () => {
    if (!audio.paused) {audio.pause();return;}
    const index = selected;
    try {
      if (audio.ended) audio.currentTime = 0;
      audio.playbackRate = 1;
      await audio.play();
      if (selected === index) playback.textContent = '';
    } catch {
      if (selected === index) playback.textContent = '暂时无法播放本段，可打开音频来源重试。';
    }
  };
  seek.oninput = () => {audio.currentTime = Number(seek.value);updatePlayer();};
  audio.addEventListener('loadedmetadata', () => {
    clipReady = true;
    seek.disabled = false;
    updatePlayer();
  });
  for (const event of ['timeupdate','play','pause','ended']) audio.addEventListener(event, updatePlayer);
  window.addEventListener('pagehide', () => audio.pause());
  audio.addEventListener('error', () => {
    playback.textContent = '本段录音暂时无法加载，可打开音频来源。';
  });

  async function showTranscript(section, crops) {
    if (!section.hidden) return;
    section.hidden = false;
    add(section,'h4','本段听力原文');
    const link = add(section,'a','打开解析 PDF');
    link.href = base + 'answer.pdf#page=' + crops[0][0];
    link.target = '_blank';
    link.rel = 'noopener';
    const body = add(section,'div');
    const status = add(body,'p','正在读取原文…');
    status.setAttribute('role','status');
    try {
      reviewPdf ??= examPdf('answer.pdf').then(task => task.promise).catch(error => {
        reviewPdf = null;
        throw error;
      });
      const pdf = await reviewPdf;
      const canvases = await Promise.all(crops.map(async ([number,from,to]) => {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({scale:2});
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height * (to-from));
        canvas.className = 'listeningTranscript';
        canvas.setAttribute('role','img');
        canvas.setAttribute('aria-label','听力原文 · 来源 PDF 第 '+number+' 页');
        await page.render({canvasContext:canvas.getContext('2d'),viewport,
          transform:[1,0,0,1,0,-viewport.height*from]}).promise;
        return canvas;
      }));
      body.replaceChildren(...canvases);
    } catch {
      status.textContent = '原文暂时无法加载，可打开解析 PDF。';
    }
  }

  function renderQuestions() {
    content.replaceChildren();
    const [name,first,last,,,crops] = parts[selected];
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
          if (submitted.delete(selected)) {
            results.forEach(({result}) => {result.hidden=true;});
            review.hidden = true;
            review.replaceChildren();
          }
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
        result.textContent = (right ? '答对了' : '正确选项 ' + key[n-1]) + ' · ' + explanations[n-1];
        result.hidden = false;
      }
      return correct;
    };
    const check = add(form,'button','核对本段答案');
    check.className = 'primary';
    const review = add(content,'section');
    review.className = 'listeningReview';
    review.hidden = true;
    if (submitted.has(selected)) {
      grade();
      showTranscript(review,crops);
    }
    form.onsubmit = event => {
      event.preventDefault();
      submitted.add(selected);
      playAnswerSound(grade() === results.length);
      showTranscript(review,crops);
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
  load();
}
