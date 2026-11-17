import {normalize} from './learning-core.mjs?v=6';
import {contrastCandidates} from './word-contrasts.mjs?v=10';

const references = [
  ['re-', '常表示「重新」或「向回」。如 rewrite（重写）、recall（回想）。',
    'https://www.merriam-webster.com/dictionary/re-'],
  ['in-', '可以表示「不」，如 inactive（不活跃的），也可以表示「进入」，如 inject（注入）。',
    'https://www.merriam-webster.com/dictionary/in-'],
  ['en-', '可以表示「使能、使成为」，如 enable（使能够），也可以表示「放入」，如 enclose（围住、封入）。',
    'https://www.merriam-webster.com/dictionary/en-']
];

const POS = {
  n:'名词', v:'动词', adj:'形容词', adv:'副词', prep:'介词',
  conj:'连词', pron:'代词', num:'数词', int:'感叹词'
};

export function partOfSpeechHTML(word, esc) {
  if (!word?.pos) return '';
  return '<span class="posLabel">'+word.pos.split('/').map(code =>
    esc(POS[code] + ' ' + code + '.')).join(' / ')+'</span>';
}

export function morphologyHTML(word, esc) {
  const data = word.morphology;
  const parts = data?.parts?.length ? '<h4>词根和词缀</h4><ul>' +
    data.parts.map(item => '<li><b>'+esc(item.form)+'</b> · '+esc(item.meaning)+'</li>').join('') + '</ul>' +
    (data.note ? '<p>'+esc(data.note)+'</p>' : '') + (data.source && /^https:\/\/[^\s]+$/.test(data.source)
      ? '<a class="fine" href="'+esc(data.source)+'" target="_blank" rel="noopener">查词源 ↗</a>' : '') : '';
  const guide = '<details class="prefixGuide"><summary>常见前缀 re-、in-、en-</summary><ul>' +
    references.map(([form, description, url]) => '<li><b>'+esc(form)+'</b> · '+esc(description)+
      ' <a href="'+esc(url)+'" target="_blank" rel="noopener">词典 ↗</a></li>').join('') +
    '</ul><p class="fine">遇到具体单词时，结合它的构词和句中含义判断。</p></details>';
  return '<div class="morphNotes">'+parts+guide+'</div>';
}

export function findMistakenWord(card, word, deck) {
  if (card.status !== 'done' || card.correct || !card.userAnswer || card.userAnswer === '∅') return null;
  const candidates = contrastCandidates(word, deck);
  const exact = term => String(term).trim().toLowerCase();
  const answer = exact(card.userAnswer);
  if (card.round < 3 && !card.assist) {
    const option = card.options.find(item => exact(item.word) === answer && item.word !== word.word);
    if (option) return {...option, ...candidates.find(item => exact(item.word) === answer)};
  }
  if (card.assist) return candidates.find(item => exact(item.word) === answer) || null;
  const matches = candidates.filter(item => item.meaning.split(/[，,；;、]/)
    .some(meaning => normalize(meaning) === normalize(answer)));
  return matches.length === 1 ? matches[0] : null;
}

export function confusionHTML(card, word, deck, esc) {
  const other = findMistakenWord(card, word, deck);
  if (!other) return '';
  const otherWord = deck.find(item => item.word === other.word);
  const note = other.note && other.note !== '注意词形与词义的区别。'
    ? '<p>'+esc(other.note)+'</p>' : '';
  const example = otherWord
    ? '<small>'+esc(otherWord.example)+'<br>'+esc(otherWord.translation)+'</small>' : '';
  return '<details class="confusionPrompt"><summary>是不是把 <strong>'+esc(word.word)+'</strong> 和 <strong>'+
    esc(other.word)+'</strong> 混淆了？<span>展开辨析</span></summary><div class="confusionGrid">'+
    '<div><b>'+esc(word.word)+'</b><p>'+esc(word.meaning)+'</p><small>'+esc(word.collocation)+'</small></div>'+
    '<div><b>'+esc(other.word)+'</b><p>'+esc(other.meaning)+'</p>'+example+'</div></div>'+note+'</details>';
}
