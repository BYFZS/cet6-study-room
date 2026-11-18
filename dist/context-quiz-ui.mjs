import {dayKey} from './learning-core.mjs?v=6';
import {QUIZ_ATTEMPT, QUIZ_MARK, QUIZ_SIZE, makeQuizQuestions, quizAttempts, quizKey, quizResults,
  reviewQuizPlan, scoreQuizWord, splitChinese, splitEnglish, mistakeTimes, restrictQuizQuestion} from './context-quiz.mjs?v=19';
import {partOfSpeechHTML} from './feedback-notes.mjs?v=12';

const DRAFT_KEY = 'cet6-context-quiz-draft-v1';
const PAGE_SIZE = 8;

function interpolate(text, matches, esc, render) {
  let output = '', offset = 0;
  for (const match of matches) {
    output += esc(text.slice(offset, match.index)) + render(match);
    offset = match.index + match[0].length;
  }
  return output + esc(text.slice(offset));
}

export function setupContextQuiz({$, esc, getDB, getDeck, hints, combinations, openView, save, message}) {
  const panel = $('quizPanel');
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch {}
  if (!Array.isArray(draft?.questions) || !draft?.responses || typeof draft.page !== 'number') draft = null;
  let report = null;
  let focusedQuestion = null;

  panel.addEventListener('focusin', event => {
    if (!event.target.matches('[data-quiz-word]')) return;
    const question = event.target.closest('.quizQuestion');
    if (!question || question === focusedQuestion) return;
    focusedQuestion = question;
    requestAnimationFrame(() => {
      if (!question.contains(document.activeElement)) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      question.scrollIntoView({block:'center', inline:'nearest', behavior:reduceMotion?'auto':'smooth'});
    });
  });

  function storeDraft() {
    try {
      if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { message('浏览器无法保存小测草稿，请完成后交卷。'); }
  }

  if (draft && draft.rule !== 'mistakes') {
    const db = getDB();
    const missed = new Set(mistakeTimes(db.logs, db.rounds).keys());
    draft.questions = draft.questions.map(card => restrictQuizQuestion(card, missed))
      .filter(card => Object.keys(card.answers).length > 0);
    const retained = new Set(draft.questions.flatMap(card => Object.keys(card.answers)));
    draft.responses = Object.fromEntries(Object.entries(draft.responses).filter(([word]) => retained.has(word)));
    draft.page = Math.max(0, Math.min(draft.page, Math.ceil(draft.questions.length / PAGE_SIZE) - 1));
    draft.rule = 'mistakes';
    if (!retained.size) draft = null;
    storeDraft();
  }

  function progress() {
    const db = getDB();
    return reviewQuizPlan(db.logs, db.rounds);
  }

  function refreshHome() {
    const plan = progress();
    $('quizHomeProgress').value = draft ? QUIZ_SIZE : plan.words.length;
    $('quizHomeStatus').textContent = draft ? '有一份未交卷的小测' : plan.ready ?
      '已复习 100 个不同词，本卷考 '+plan.targets.length+' 个错词。' : `已复习 ${plan.words.length} / ${QUIZ_SIZE} 个不同词`;
    $('quizHomeOpen').textContent = draft ? '继续小测 →' : plan.ready ? '开始小测 →' : '查看进度 →';
  }

  function announceAtGroupEnd(container) {
    if (!draft && !progress().ready) return;
    const button = document.createElement('button');
    button.className = 'quizGroupLink';
    button.textContent = draft ? '继续句中填义小测 →' : '错词小测已就绪 →';
    button.onclick = () => openView('contextQuiz');
    container.append(button);
  }

  function english(card) {
    return interpolate(card.english, splitEnglish(card.english), esc, match =>
      '<mark>' + esc(match[2] || match[1]) + '</mark>');
  }

  function renderPage() {
    const pages = Math.ceil(draft.questions.length / PAGE_SIZE);
    const total = draft.questions.reduce((count, card) => count + Object.keys(card.answers).length, 0);
    const offset = draft.page * PAGE_SIZE;
    const slice = draft.questions.slice(offset, offset + PAGE_SIZE);
    panel.innerHTML = `<h2>句中填义小测</h2><p>看英文句和中文提示，填写高亮词在这句话里的意思。</p>
      <p class="quizProgress" id="quizAnswerProgress"></p>${slice.map((card, index) =>
      `<article class="quizQuestion"><h3>${offset + index + 1}. ${english(card)}</h3>
        <p class="quizHint">${interpolate(card.chinese, splitChinese(card.chinese), esc, match => {
          const word = match[1];
          return '<input type="text" data-quiz-word="'+esc(word)+'" aria-label="'+esc(word)+
            '在句中的中文意思" placeholder="'+esc(word)+'" value="'+esc(draft.responses[word]||'')+
            '" autocomplete="off" maxlength="100">';
        })}</p></article>`).join('')}
      <div class="actions"><button id="quizPrev" ${draft.page === 0 ? 'disabled' : ''}>上一页</button>
      <button id="quizNext" ${draft.page === pages - 1 ? 'disabled' : ''}>下一页</button>
      <button id="quizSubmit" class="primary">交卷</button></div>`;
    const updateCount = () => {
      const count = Object.values(draft.responses).filter(text => text.trim()).length;
      $('quizAnswerProgress').textContent = `第 ${draft.page + 1} / ${pages} 页 · 已答 ${count} / ${total} 词`;
    };
    updateCount();
    panel.querySelectorAll('[data-quiz-word]').forEach(input => input.oninput = () => {
      draft.responses[input.dataset.quizWord] = input.value;
      storeDraft();
      updateCount();
    });
    const move = step => {
      draft.page += step;
      storeDraft();
      renderPage();
      panel.querySelector('h2')?.scrollIntoView({block:'start'});
    };
    $('quizPrev').onclick = () => move(-1);
    $('quizNext').onclick = () => move(1);
    $('quizSubmit').onclick = submit;
  }

  function submit() {
    if (!Object.values(draft.responses).some(value => value.trim())) {
      message('请先填写至少一个词义。');
      return;
    }
    const at = Date.now();
    const results = draft.questions.flatMap(card => Object.entries(card.answers).map(([word, answers]) => {
      const input = draft.responses[word]?.trim() || '';
      return {word, input, answers, status: scoreQuizWord(input, answers)};
    }));
    const attempt = {mode: QUIZ_ATTEMPT, id: crypto.randomUUID(), batch: quizKey(draft.reviews),
      reviews: draft.reviews, at, questions: draft.questions, results};
    const db = getDB();
    db.rounds ??= [];
    db.rounds.push(attempt);
    draft = null;
    storeDraft();
    save();
    message();
    report = attempt.id;
    render();
    panel.querySelector('h2')?.scrollIntoView({block:'start'});
  }

  function renderReport(attempt) {
    const db = getDB(), results = quizResults(attempt, db.rounds);
    const correct = results.filter(item => item.status === 'correct').length;
    const pending = results.filter(item => item.status === 'pending').length;
    const byWord = new Map(results.map(item => [item.word, item]));
    const deckByWord = new Map(getDeck().map(item => [item.word, item]));
    panel.innerHTML = `<h2>小测结果</h2><p class="quizProgress">已判对 ${correct} / ${results.length} 词${pending ? ' · '+pending+' 词待核对' : ''}</p>
      ${pending ? '<p>对照参考释义核对其他说法。含义一致可以判对，确认错误会计入错词记录。</p>' : ''}
      <button id="quizBack">返回小测列表</button>
      ${attempt.questions.map((card, index) => `<article class="quizQuestion"><h3>${index+1}. ${english(card)}</h3>
        <p>${interpolate(card.chinese, splitChinese(card.chinese), esc, match => '<b>'+esc(byWord.get(match[1]).answers[0])+'</b>')}</p>
        <ul>${Object.keys(card.answers).map(word => {
          const row = byWord.get(word);
          const label = {correct:'正确', wrong:'答错', pending:'待核对'}[row.status];
          return `<li><strong>${esc(word)}</strong>${partOfSpeechHTML(deckByWord.get(word),esc)} · ${label} · 你的答案 ${esc(row.input || '空白')}
            <br><small>参考词义 · ${esc(row.answers.join('、'))}</small>
            ${row.status === 'pending' ? `<div class="actions"><button data-quiz-mark="yes" data-quiz-target="${esc(word)}">含义一致</button><button data-quiz-mark="no" data-quiz-target="${esc(word)}">记为答错</button></div>` : ''}</li>`;
        }).join('')}</ul></article>`).join('')}`;
    $('quizBack').onclick = () => { report = null; render(); };
    panel.querySelectorAll('[data-quiz-mark]').forEach(button => button.onclick = () => {
      db.rounds.push({mode: QUIZ_MARK, attempt: attempt.id, word: button.dataset.quizTarget,
        correct: button.dataset.quizMark === 'yes', at: Date.now()});
      save();
      renderReport(attempt);
    });
  }

  function render() {
    const attempts = quizAttempts(getDB().rounds);
    if (draft) { renderPage(); return; }
    const selected = attempts.find(item => item.id === report);
    if (selected) { renderReport(selected); return; }
    const plan = progress();
    panel.innerHTML = `<h2>句中填义小测</h2>
      <p>累计复习 ${QUIZ_SIZE} 个不同词后，从中选有错题记录的词，考它们在句中的意思。</p>
      <progress max="${QUIZ_SIZE}" value="${plan.words.length}" aria-label="复习词数"></progress>
      <p>已复习 ${plan.words.length} / ${QUIZ_SIZE} 个不同词${plan.ready?' · 本卷 '+plan.targets.length+' 个错词':''}</p>
      <button id="quizBegin" class="primary"${plan.ready ? '' : ' disabled'}>开始小测 →</button>
      ${attempts.length ? '<h3>已完成的小测</h3>' + attempts.map(item =>
        '<button class="quizHistory" data-quiz-attempt="'+esc(item.id)+'">'+dayKey(item.at)+' · 查看结果 →</button>').join('') : ''}`;
    $('quizBegin').onclick = () => {
      draft = {reviews: plan.reviews, questions: makeQuizQuestions(plan.targets, getDeck(), hints, combinations),
        responses: {}, page: 0, rule: 'mistakes'};
      storeDraft();
      renderPage();
    };
    panel.querySelectorAll('[data-quiz-attempt]').forEach(button => button.onclick = () => {
      report = button.dataset.quizAttempt;
      render();
    });
  }

  $('quizHomeOpen').onclick = () => openView('contextQuiz');
  return {render, refreshHome, announceAtGroupEnd, hasDraft:()=>Boolean(draft)};
}
