import {isProgressWord} from './learning-core.mjs?v=32';

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = entries => Object.fromEntries(entries.sort(([a], [b]) => compareText(a, b)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isClock = stamp => stamp && Number.isFinite(stamp.at) && typeof stamp.device === 'string';

function uniqueTimeline(items) {
  const byContent = new Map(items.map(item => [JSON.stringify(item), item]));
  return [...byContent].sort(([a, one], [b, two]) => one.at - two.at || compareText(a, b))
    .map(([, item]) => item);
}

function choose(one, two) {
  if (!one) return two;
  if (!two) return one;
  const order = one.at - two.at || compareText(one.device, two.device) ||
    compareText(JSON.stringify(one.value), JSON.stringify(two.value));
  return order >= 0 ? one : two;
}

function stamp(value, previous, device, fallback, now) {
  if (isClock(previous) && same(previous.value, value)) {
    return fallback > previous.at ? {at: fallback, device, value} : previous;
  }
  return {at: previous ? Math.max(now, previous.at + 1) : fallback, device, value};
}

export function captureProgress(db, previous, device, now = Date.now()) {
  const logTimes = new Map();
  for (const log of db.logs || []) logTimes.set(log.word, Math.max(logTimes.get(log.word) || 0, log.at));
  const memories = sorted(Object.entries(db.memories).map(([word, memory]) => [
    word, stamp(structuredClone(memory), previous?.memories[word], device,
      Math.max(memory.lastReviewed || 0, memory.confusedAt || 0, logTimes.get(word) || 0), now)
  ]));
  const overrides = sorted([...new Set([...Object.keys(previous?.overrides || {}),
    ...Object.keys(db.overrides || {})])].map(word => [
    word, stamp(db.overrides[word] ?? null, previous?.overrides[word], device, 0, now)
  ]));
  return {
    version: 1, memories, overrides,
    aliases: sorted(Object.entries(db.customAliases || {}).map(([word, values]) => [word, [...new Set(values)].sort()])),
    logs: uniqueTimeline(db.logs || []),
    rounds: uniqueTimeline(db.rounds || [])
  };
}

export function mergeProgress(one, two) {
  if (!two) return one;
  const mergeMap = (left, right, merge) => sorted([...new Set([...Object.keys(left), ...Object.keys(right)])]
    .map(word => [word, merge(left[word], right[word])]));
  return {
    version: 1,
    memories: mergeMap(one.memories, two.memories, choose),
    overrides: mergeMap(one.overrides, two.overrides, choose),
    aliases: mergeMap(one.aliases, two.aliases, (a = [], b = []) => [...new Set([...a, ...b])].sort()),
    logs: uniqueTimeline([...one.logs, ...two.logs]),
    rounds: uniqueTimeline([...one.rounds, ...two.rounds])
  };
}

export function materializeProgress(progress) {
  return {
    memories: Object.fromEntries(Object.entries(progress.memories).map(([word, record]) => [word, record.value])),
    overrides: Object.fromEntries(Object.entries(progress.overrides).filter(([, record]) => record.value !== null)
      .map(([word, record]) => [word, record.value])),
    customAliases: progress.aliases,
    logs: progress.logs,
    rounds: progress.rounds
  };
}

export function verifyProgress(progress) {
  const validMap = (map, check) => map && typeof map === 'object' && !Array.isArray(map) &&
    Object.entries(map).every(([word, value]) => isProgressWord(word) && check(value));
  const memory = item => isClock(item) && item.value && Number.isFinite(item.value.due) &&
    Number.isInteger(item.value.attempts) && item.value.attempts >= 0 &&
    (item.value.protocol !== 3 || Number.isInteger(item.value.stage) && item.value.stage >= 0 && item.value.stage <= 3);
  if (progress?.version !== 1 || !validMap(progress.memories, memory) ||
      !validMap(progress.overrides, item => isClock(item) && [null, 'correct', 'wrong'].includes(item.value)) ||
      !validMap(progress.aliases, items => Array.isArray(items) && items.every(item => typeof item === 'string')) ||
      !Array.isArray(progress.logs) || !progress.logs.every(x =>
        x && isProgressWord(x.word) && typeof x.correct === 'boolean' && Number.isFinite(x.at)) ||
      !Array.isArray(progress.rounds) || !progress.rounds.every(x => x && Number.isFinite(x.at))) {
    throw new Error('同步记录格式无效');
  }
  return progress;
}

export function readProgressClocks(progress) {
  return {
    memories: Object.fromEntries(Object.entries(progress.memories)
      .map(([word, {at, device}]) => [word, {at, device}])),
    overrides: Object.fromEntries(Object.entries(progress.overrides)
      .map(([word, {at, device, value}]) => [word, {at, device, value}]))
  };
}
