import {normalize,spellingMatches} from './learning-core.mjs?v=6';
import {contrastCandidates} from './word-contrasts.mjs?v=10';

const references = [
  ['re-', '常表示「重新」或「向回」。如 rewrite（重写）、recall（回想）。',
    'https://www.merriam-webster.com/dictionary/re-'],
  ['in-', '可以表示「不」，如 inactive（不活跃的），也可以表示「进入」，如 inject（注入）。',
    'https://www.merriam-webster.com/dictionary/in-'],
  ['en-', '可以表示「使能、使成为」，如 enable（使能够），也可以表示「放入」，如 enclose（围住、封入）。',
    'https://www.merriam-webster.com/dictionary/en-'],
  ['un-', '可表示「不、未」，如 unexcused（未获批准的），也可表示解除，如 unpack（拆开包装）。',
    'https://dictionary.cambridge.org/grammar/british-grammar/prefixes'],
  ['con-', '常表示「一起、共同」，和 com-、col-、cor- 同源。如 contribute（贡献）、construct（建造）。',
    'https://www.ahdictionary.com/word/search.html?id=C5517400'],
  ['co-', '表示「一起、共同」，如 coordinate（协调）、cooperate（合作）。',
    'https://ahdictionary.com/word/search.html?q=co-'],
  ['inter-', '表示「在……之间」或「相互」，如 interact（互动）、international（国际的）。',
    'https://dictionary.cambridge.org/grammar/british-grammar/prefixes'],
  ['trans-', '表示「跨越」或「从一处转到另一处」，如 transfer（转移）、transport（运输）。',
    'https://dictionary.cambridge.org/grammar/british-grammar/prefixes'],
  ['sub-', '表示「在……下面」或「等级较低」，如 submarine（潜艇）、subordinate（从属的）。',
    'https://dictionary.cambridge.org/grammar/british-grammar/prefixes']
];

const POS = {
  n:'名词', v:'动词', adj:'形容词', adv:'副词', prep:'介词',
  conj:'连词', pron:'代词', num:'数词', int:'感叹词', phrase:'短语'
};

export function partOfSpeechHTML(word, esc) {
  if (!word?.pos) return '';
  return '<span class="posLabel">'+word.pos.split('/').map(code =>
    esc(code==='phrase'?POS[code]:POS[code] + ' ' + code + '.')).join(' / ')+'</span>';
}

export function meaningsByPartOfSpeechHTML(word, esc) {
  const codes = word.pos?.split('/') || [];
  const glosses = word.posGlosses;
  const row = (pos, meaning) => '<span class="meaningRow">'+partOfSpeechHTML({pos},esc)+'<span>'+esc(meaning)+'</span></span>';
  return glosses && codes.every(code=>glosses[code])
    ? codes.map(code=>row(code,glosses[code])).join('')
    : row(word.pos,word.meaning);
}

export function spellingAlternative(answer, word) {
  const {spellingAlternatives = [], synonyms = []} = word.relations || {};
  return [...spellingAlternatives, ...synonyms].find(item => spellingMatches(answer, item.word));
}

export function wordFamilyHTML(word, esc) {
  if (!word.family) return '';
  const {words, note} = word.family;
  const entries = words.filter(([term]) => term !== word.word).map(([term,pos,meaning]) =>
    '<li><b lang="en">'+esc(term)+'</b>'+partOfSpeechHTML({pos},esc)+' · '+esc(meaning)+'</li>').join('');
  if (!entries || word.phrase) return '';
  return '<section class="morphNotes familyNotes"><h4>'+esc(word.family.heading || '同族词')+'</h4><ul>'+entries+'</ul>'+
    (note ? '<p>'+esc(note)+'</p>' : '')+'</section>';
}

export function morphologyHTML(word, esc) {
  const data = word.phrase || word.morphology;
  const heading = word.phrase ? '短语构成' : data?.heading || '词根和词缀';
  const prefix = form => !word.phrase && /^[a-zA-Z]+-$/.test(form) &&
    word.word.startsWith(form.slice(0,-1));
  const partRow = item => '<li class="'+(prefix(item.form)?'prefixPart':'rootPart')+'"><b>'+
    esc(item.form)+'</b> · '+esc(item.meaning)+'</li>';
  const parts = data?.parts?.length ? '<div class="wordParts'+(word.phrase?' phraseParts':'')+'"><h4>'+
    esc(heading)+'</h4><ul>'+data.parts.map(partRow).join('')+'</ul>'+
    (data.note ? '<p class="constructionNote">'+esc(data.note)+'</p>' : '')+
    (data.source && /^https:\/\/[^\s]+$/.test(data.source)
      ? '<a class="fine constructionNote" href="'+esc(data.source)+'" target="_blank" rel="noopener">查词源 ↗</a>' : '')+'</div>' : '';
  const examples = word.phrase?.examples?.length ? '<h4>搭配与用法</h4><ul>' +
    word.phrase.examples.map(([example, meaning]) =>
      '<li><b lang="en">'+esc(example)+'</b> · '+esc(meaning)+'</li>').join('') + '</ul>' : '';
  const relevant = references.filter(([form]) =>
    word.word.startsWith(form.slice(0,-1)) && data?.parts?.some(item => item.form === form));
  const guide = relevant.length ? '<details class="prefixGuide"><summary>常见前缀 '+
    relevant.map(([form]) => esc(form)).join('、')+'</summary><ul>' +
    relevant.map(([form, description, url]) => '<li><b>'+esc(form)+'</b> · '+esc(description)+
      ' <a href="'+esc(url)+'" target="_blank" rel="noopener">词典 ↗</a></li>').join('') +
    '</ul></details>' : '';
  return parts || guide || examples ? '<div class="morphNotes">'+parts+guide+examples+'</div>' : '';
}

export function findMistakenWord(card, word, deck) {
  if (!['done','pending'].includes(card.status) || card.correct || !card.userAnswer || card.userAnswer === '∅') return null;
  const exact = term => String(term).trim().toLowerCase();
  const answer = exact(card.userAnswer);
  if (card.round < 3 && !card.assist) {
    const option = card.options.find(item => exact(item.word) === answer && item.word !== word.word);
    return option ? {...option, ...contrastCandidates(word, deck).find(item => exact(item.word) === answer)} : null;
  }
  if (card.assist) return contrastCandidates(word, deck).find(item => exact(item.word) === answer) || null;

  const meaning = normalize(answer);
  const hasMeaning = item => [...(item.aliases || []), ...item.meaning.split(/[，,；;、]/)]
    .some(alias => normalize(alias) === meaning);
  if (!meaning || hasMeaning(word) || word.relations?.synonyms?.some(hasMeaning)) return null;
  const curated = (word.relations?.confusables || []).filter(hasMeaning);
  if (curated.length) return curated.length === 1 ? curated[0] : null;
  const synonyms = new Set((word.relations?.synonyms || []).map(item => exact(item.word)));
  const matches = deck.filter(item => item.word !== word.word && !synonyms.has(exact(item.word)) && hasMeaning(item));
  return matches.length === 1 ? matches[0] : null;
}

export function confusionComparisonHTML(word, other, deck, esc) {
  const otherWord = deck.find(item => item.word === other.word) || other;
  const note = other.note && other.note !== '注意词形与词义的区别。'
    ? '<p>'+esc(other.note)+'</p>' : '';
  const example = otherWord.example
    ? '<small>'+esc(otherWord.example)+'<br>'+esc(otherWord.translation)+'</small>' : '';
  return '<div class="confusionGrid"><div><b>'+esc(word.word)+'</b><p>'+esc(word.meaning)+'</p><small>'+esc(word.collocation)+'</small></div>'+
    '<div><b>'+esc(other.word)+'</b><p>'+esc(other.meaning)+'</p>'+example+'</div></div>'+note;
}

export function confusionHTML(card, word, deck, esc) {
  const other = findMistakenWord(card, word, deck);
  if (!other) return '';
  return '<details class="confusionPrompt"><summary>你想的是不是 <strong>'+esc(other.word)+
    '</strong>？<span>展开辨析</span></summary>'+confusionComparisonHTML(word, other, deck, esc)+'</details>';
}
