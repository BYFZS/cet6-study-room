import {normalize} from './learning-core.mjs?v=6';
import {localStudyDay} from './study-analytics.mjs?v=12';

export const QUIZ_SIZE = 100;
export const QUIZ_ATTEMPT = 'context-quiz';
export const QUIZ_MARK = 'context-quiz-mark';
const QUIZ_CORRECT_LIMIT = 2;
export const quizKey = reviews => reviews.join(';');
const englishPattern = /\[([^\]:]+)(?::([^\]]+))?\]/g;
const chinesePattern = /\{([^{}]+)\}/g;
const clean = value => normalize(String(value).normalize('NFKC')).replace(/[\s…·。！？.!?，、；;,，；]+/g, '');

export function reviewQuizPlan(logs, rounds = [], size = QUIZ_SIZE, now = Date.now()) {
  const taken = new Set(rounds.filter(r => r.mode === QUIZ_ATTEMPT).flatMap(r => r.reviews || []));
  const missedAt = mistakeTimes(logs, rounds);
  const gradedHistory = rounds.filter(item => Number.isFinite(item?.at) && item.at <= now);
  const correctCounts = new Map();
  for (const attempt of quizAttempts(gradedHistory)) {
    const passed = new Set(quizResults(attempt, gradedHistory)
      .filter(item => item.status === 'correct').map(item => item.word));
    for (const word of passed) correctCounts.set(word, (correctCounts.get(word) ?? 0) + 1);
  }
  const first = new Map();
  const dailyReviews = new Set();
  const words = new Set();
  let reviews = [];
  for (const log of logs.filter(x => x?.word && Number.isFinite(x.at) && x.at > 0 && x.at <= now)
    .sort((a, b) => a.at - b.at || a.word.localeCompare(b.word))) {
    const date = localStudyDay(log.at);
    if (!first.has(log.word)) first.set(log.word, date);
    if (date === first.get(log.word)) continue;
    const key = date + '|' + log.word;
    if (dailyReviews.has(key)) continue;
    dailyReviews.add(key);
    if (taken.has(key) || words.has(log.word)) continue;
    words.add(log.word);
    reviews.push(key);
    if (words.size === size) {
      const targets = [...words].filter(word =>
        (missedAt.get(word) ?? Infinity) <= log.at && (correctCounts.get(word) ?? 0) < QUIZ_CORRECT_LIMIT);
      if (targets.length) return {reviews, words: [...words], targets, ready: true};
      // Continue counting when every candidate is either error-free or has passed enough quizzes.
      words.clear();
      reviews = [];
    }
  }
  return {reviews, words: [...words], targets: [], ready: false};
}

export function mistakeTimes(logs, rounds = []) {
  const result = new Map();
  const count = (word, at) => {
    if (word && Number.isFinite(at)) result.set(word, Math.min(at, result.get(word) ?? Infinity));
  };
  for (const log of logs) if (log?.correct === false && !log.relatedAnswer) count(log.word, log.at);
  for (const attempt of quizAttempts(rounds)) {
    for (const item of quizResults(attempt, rounds)) {
      if (item.status === 'wrong') count(item.word, attempt.at);
    }
  }
  return result;
}

export function restrictQuizQuestion(card, target) {
  const answers = Object.fromEntries(Object.entries(card.answers).filter(([word]) => target.has(word)));
  return {
    answers,
    chinese: card.chinese.replace(chinesePattern, (marker, word) =>
      target.has(word) ? marker : card.answers[word][0]),
    english: card.english.replace(englishPattern, (marker, word, phrase) =>
      target.has(word.toLowerCase()) ? marker : phrase || word)
  };
}

export function singleQuestion(word, hints) {
  const provided = hints[word.word];
  const phrase = provided?.phrase || word.word;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp('\\b' + escaped + '\\b', 'i').exec(word.example);
  if (!found) throw new Error('例句缺少目标词：' + word.word);
  const index = found.index;
  const original = found[0];
  const english = word.example.slice(0, index) + '[' + word.word + ':' + original + ']' +
    word.example.slice(index + phrase.length);
  if (provided) return {english, chinese: provided.chinese, answers: {[word.word]: provided.answers}};
  const aliases = [...word.aliases, ...word.meaning.split(/[；、，;\/]/)].map(x => x.trim());
  const matched = [...new Set(aliases.filter(x => x.length >= 2 && word.translation.includes(x)))]
    .sort((a, b) => b.length - a.length)[0];
  if (!matched) throw new Error('词义提示尚未准备：' + word.word);
  const answers = [matched];
  if (!matched.endsWith('的') && aliases.includes(matched + '的')) answers.push(matched + '的');
  return {
    english,
    chinese: word.translation.replace(matched, '{' + word.word + '}').replaceAll(matched, '〔同词〕'),
    answers: {[word.word]: answers}
  };
}

export function makeQuizQuestions(words, deck, hints, combinations) {
  const remaining = new Set(words);
  const positions = new Map(words.map((word, index) => [word, index]));
  const deckByWord = new Map(deck.map(word => [word.word, word]));
  const questions = [];
  for (const card of [...combinations].sort((a, b) => Object.keys(b.answers).length - Object.keys(a.answers).length)) {
    const selected = Object.keys(card.answers).filter(word => remaining.has(word));
    if (selected.length < 2) continue;
    const question = restrictQuizQuestion(card, new Set(selected));
    const visible = question.chinese.replace(chinesePattern, '');
    if (selected.some(word => card.answers[word].some(meaning =>
      meaning.length >= 2 && visible.includes(meaning)))) continue;
    questions.push(question);
    for (const word of selected) remaining.delete(word);
  }
  for (const word of remaining) questions.push(singleQuestion(deckByWord.get(word), hints));
  const earliest = card => Math.min(...Object.keys(card.answers).map(word => positions.get(word)));
  return questions.sort((a, b) => earliest(a) - earliest(b));
}

export const splitEnglish = text => [...text.matchAll(englishPattern)];
export const splitChinese = text => [...text.matchAll(chinesePattern)];

export function scoreQuizWord(input, answers) {
  const response = clean(input);
  if (!response) return 'wrong';
  return answers.some(answer => clean(answer) === response) ? 'correct' : 'pending';
}

export function quizAttempts(rounds = []) {
  const newest = new Map();
  for (const item of rounds) {
    if (item.mode !== QUIZ_ATTEMPT) continue;
    const current = newest.get(item.batch);
    if (!current || item.at > current.at || item.at === current.at && item.id > current.id) newest.set(item.batch, item);
  }
  return [...newest.values()].sort((a, b) => b.at - a.at);
}

export function quizResults(attempt, rounds) {
  const marks = new Map();
  for (const item of rounds) {
    if (item.mode !== QUIZ_MARK || item.attempt !== attempt.id) continue;
    const current = marks.get(item.word);
    if (!current || current.at <= item.at) marks.set(item.word, item);
  }
  return (attempt.results || []).map(item => ({
    ...item, status: marks.has(item.word) ? (marks.get(item.word).correct ? 'correct' : 'wrong') : item.status
  }));
}

export function studyLogWithQuizzes(db) {
  const rounds = db.rounds || [];
  const quizLogs = quizAttempts(rounds).flatMap(attempt =>
    quizResults(attempt, rounds).filter(item => item.status !== 'pending')
      .map(item => ({word: item.word, correct: item.status === 'correct', at: attempt.at})));
  return [...db.logs, ...quizLogs];
}
