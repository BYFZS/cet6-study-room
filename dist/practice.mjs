import {playAnswerSound} from './answer-sounds.mjs';

const listening = 'When the university library first extended its evening hours, staff expected most visitors to borrow books. In fact, many students came to use the quiet study rooms. Some shared crowded flats, while others had long gaps between work and evening classes. After reviewing the feedback, the library kept more study rooms open and moved the closing time of the borrowing desk back to its original hour.';
const reading = 'A team compared two groups of learners who studied the same set of unfamiliar words. One group studied for thirty minutes in a single session. The other split the same amount of time across three days. Both groups did equally well on a test immediately after their final session. A week later, however, the group that had spaced out its practice remembered more words. The result suggests that the timing of practice matters when the goal is to remember information over time.';
const shortTasks = {
  listening: {
    title:'听力 · 图书馆延长开放',
    hint:'听一遍短文，抓住预期和实际情况的差别，再选答案。本练习使用合成语音。',
    passage:listening,
    question:'Why did many students visit the library in the evening?',
    options:['To borrow more books.', 'To find a quiet place to study.', 'To attend evening classes.', 'To give staff feedback.'],
    answer:1,
    note:'In fact 提示实际情况。录音说许多学生来用安静的自习室。borrow books 是工作人员原先的预期。'
  },
  reading: {
    title:'阅读 · 间隔复习',
    hint:'读完短文后选答案。注意两次测试的时间，以及结论来自哪一次。',
    passage:reading,
    question:'What advantage did the group that split its practice across three days show?',
    options:['They spent less time studying.', 'They learned a larger set of words.', 'They scored higher immediately after studying.', 'They remembered more words a week later.'],
    answer:3,
    note:'定位 A week later, however。两组总学习时间相同，即时测试成绩也相当。优势出现在一周后的记忆测试。'
  }
};
const writingTasks = {
  writing: {
    title:'写作 · 校园学习空间',
    hint:'用英语写约 150–200 词。表明立场，给一个具体例子，再提出一项可行建议。',
    prompt:'Some students prefer quiet study rooms, while others need places for group discussion. What should universities do to meet both needs?',
    sample:'Universities can meet both needs by separating quiet areas from rooms for discussion. For example, students preparing for exams could use a silent floor, while project teams could book a room for short meetings. Clear signs and a simple booking system would help each group find a suitable space.',
    label:'参考段落与自查',
    note:'检查开头有没有明确提出分区方案，例子是否同时照顾两类学生，结尾是否提出具体的管理办法。',
    resource:['语句手册与范文','word-handbook.html?view=sentences&from=writing']
  },
  translation: {
    title:'翻译 · 社区图书馆',
    hint:'先把三句话译完，再逐句核对。可以先写出主语和谓语，再补细节。',
    prompt:'近年来，越来越多的社区图书馆延长了开放时间。居民可以在下班后借书或使用自习室。一些图书馆还举办读书活动，让邻居有机会互相交流。',
    sample:'In recent years, more and more community libraries have extended their opening hours. Residents can borrow books or use the study rooms after work. Some libraries also hold reading events, giving neighbours a chance to talk with one another.',
    label:'参考译文与自查',
    note:'检查是否译出了时间、两项服务和活动目的。注意 extend opening hours、after work 和 give someone a chance to do something。'
  }
};

const skill = new URLSearchParams(location.search).get('skill');
const selected = Object.hasOwn(shortTasks,skill) || Object.hasOwn(writingTasks,skill) ? skill : 'listening';
const task = shortTasks[selected] ?? writingTasks[selected];
const exercise = document.getElementById('practiceExercise');
const add = (parent, tag, text) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  parent.append(el);
  return el;
};
document.title = task.title + ' · CET6 复习室';
document.querySelector('[data-skill="' + selected + '"]').setAttribute('aria-current','page');
document.getElementById('practiceTitle').textContent = task.title;
document.getElementById('practiceHint').textContent = task.hint;

if (Object.hasOwn(shortTasks,selected)) {
  const isListening = selected === 'listening';
  if (isListening) {
    const play = add(exercise,'button','播放听力');
    play.type = 'button';
    const audioStatus = add(exercise,'span');
    audioStatus.setAttribute('role','status');
    play.onclick = () => {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        audioStatus.textContent = '当前设备无法播放合成语音，可以展开原文。';
        return;
      }
      const utterance = new SpeechSynthesisUtterance(task.passage);
      utterance.lang = 'en-US';
      utterance.rate = 0.88;
      utterance.onerror = () => { audioStatus.textContent = '语音暂时不可用，可以展开原文。'; };
      speechSynthesis.cancel();
      audioStatus.textContent = '';
      speechSynthesis.speak(utterance);
      play.textContent = '重听';
    };
    window.addEventListener('pagehide',() => window.speechSynthesis?.cancel());
  } else {
    const passage = add(exercise,'p',task.passage);
    passage.className = 'practicePassage';
    passage.lang = 'en';
  }
  const form = add(exercise,'form');
  const group = add(form,'fieldset');
  add(group,'legend',task.question).lang = 'en';
  const feedback = add(exercise,'p');
  feedback.setAttribute('role','status');
  let script;
  for (const [index,option] of task.options.entries()) {
    const label = add(group,'label');
    const input = add(label,'input');
    input.type = 'radio';
    input.name = 'choice';
    input.value = index;
    input.required = index === 0;
    add(label,'span',String.fromCharCode(65+index)+'. '+option).lang = 'en';
  }
  add(form,'button','核对答案').className = 'primary';
  if (isListening) {
    script = add(exercise,'details');
    add(script,'summary','听力原文');
    add(script,'p',task.passage).lang = 'en';
  }
  form.onsubmit = event => {
    event.preventDefault();
    const correct = Number(new FormData(form).get('choice')) === task.answer;
    playAnswerSound(correct);
    feedback.textContent = (correct ? '答对了。' : '参考答案为 '+String.fromCharCode(65+task.answer)+'。')+task.note;
    if (script) script.open = true;
  };
} else {
  const prompt = add(exercise,'p',task.prompt);
  prompt.className = 'practicePassage';
  if (selected === 'writing') prompt.lang = 'en';
  const label = add(exercise,'label','英文草稿');
  label.htmlFor = 'practiceDraft';
  const draft = add(exercise,'textarea');
  draft.id = 'practiceDraft';
  draft.lang = 'en';
  const status = add(exercise,'p');
  status.className = 'fine';
  status.setAttribute('role','status');
  const key = 'cet6-practice-draft-' + selected;
  try { draft.value = localStorage.getItem(key) || ''; } catch {}
  draft.oninput = () => {
    try { localStorage.setItem(key,draft.value); status.textContent = '草稿已保存到本机。'; }
    catch { status.textContent = '浏览器暂时无法保存草稿。'; }
  };
  const details = add(exercise,'details');
  add(details,'summary',task.label);
  add(details,'p',task.sample).lang = 'en';
  add(details,'p',task.note);
  if (task.resource) add(details,'a',task.resource[0]).href = task.resource[1];
}
