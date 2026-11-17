import {normalize} from './learning-core.mjs?v=6';

export const BAND_WIDTH = 1000;
export const BAND_COUNT = 8;
export const BAND_SAMPLE = 20;
export const MAX_SIZE = BAND_COUNT * BAND_WIDTH;
export const ANSWER_LIMIT = 100;

export const wordBand = rank => Math.ceil(rank / BAND_WIDTH);
const clean = text => normalize(String(text ?? '').normalize('NFKC')).replace(/[\s“”"‘’]+/g, '');
const unknown = new Set(['不会','不知道','不认识','不记得','没印象','忘了','空白','不懂','不清楚']);

export function gradeMeaning(response, answers, mark) {
  if (mark === 'correct' || mark === 'wrong') return mark;
  const raw = String(response?.text ?? '').trim();
  if (response?.unknown || !clean(raw) || unknown.has(clean(raw))) return 'wrong';
  const aliases = new Set(answers.map(clean));
  if (aliases.has(clean(raw))) return 'correct';
  const parts = raw.split(/[，,；;、\/\n]+/).map(clean).filter(Boolean);
  return parts.length && parts.every(part => aliases.has(part)) ? 'correct' : 'pending';
}

// Approximate uncertainty across independent frequency strata. Add half a response to
// either outcome when estimating variance so full or empty bands do not appear exact.
function aggregate(bands, includesPending) {
  let estimate = 0, variance = 0;
  for (const band of bands) {
    const count = band.correct + (includesPending ? band.pending : 0);
    const p = (count + 0.5) / (band.sample + 1);
    estimate += BAND_WIDTH * count / band.sample;
    variance += BAND_WIDTH ** 2 * p * (1 - p) / band.sample;
  }
  return {estimate, margin: 1.96 * Math.sqrt(variance)};
}

export function estimateVocabulary(bank, responses = {}, marks = {}) {
  const bands = Array.from({length: BAND_COUNT}, (_, index) => ({
    level: index + 1, sample: 0, correct: 0, wrong: 0, pending: 0
  }));
  const rows = bank.map(item => {
    const band = bands[wordBand(item.rank) - 1];
    const response = responses[item.word];
    const result = gradeMeaning(response, item.answers, marks[item.word]);
    band.sample++;
    band[result]++;
    return {...item, answer: response?.text || '', result};
  });
  const low = aggregate(bands, false);
  const high = aggregate(bands, true);
  const pending = bands.reduce((sum, band) => sum + band.pending, 0);
  return {
    bands, rows, pending,
    estimate: Math.round(low.estimate / 100) * 100,
    lower: Math.max(0, Math.floor((low.estimate - low.margin) / 100) * 100),
    upper: Math.min(MAX_SIZE, Math.ceil((high.estimate + high.margin) / 100) * 100),
    atCeiling: bands.at(-1).correct / bands.at(-1).sample >= 0.85
  };
}

export function verifyVocabBank(bank) {
  const words = new Set();
  const blocks = new Set();
  for (const item of bank) {
    const block = Math.floor((item.rank - 1) / (BAND_WIDTH / BAND_SAMPLE));
    if (!/^[a-z][a-z-]+$/.test(item.word) || words.has(item.word) || blocks.has(block) ||
        !Number.isInteger(item.rank) || item.rank < 1 || item.rank > MAX_SIZE ||
        !Array.isArray(item.answers) || item.answers.length < 2 ||
        item.answers.some(answer => typeof answer !== 'string' || !clean(answer))) {
      throw new Error('词汇量题库格式无效');
    }
    words.add(item.word);
    blocks.add(block);
  }
  if (bank.length !== BAND_COUNT * BAND_SAMPLE) throw new Error('词汇量题库题数不完整');
  return bank;
}
