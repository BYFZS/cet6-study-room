import {DAY} from './learning-core.mjs?v=6';

const MAX_ANSWER_MS = 3 * 60 * 1000;
const MIN_REPEATED_ERRORS = 2;
const UTC_OFFSET = 8 * 60 * 60 * 1000;
const midnight = key => Date.parse(key + 'T00:00:00+08:00');
const utcDay = key => new Date(key + 'T00:00:00Z');
export const localStudyDay = time => new Date(time + UTC_OFFSET).toISOString().slice(0, 10);

export function shiftDay(key, days) {
  return localStudyDay(midnight(key) + days * DAY);
}

export function shiftMonth(month, count) {
  const date = utcDay(month + '-01');
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7);
}

export function calendarDays(month) {
  const first = month + '-01';
  const leading = (utcDay(first).getUTCDay() + 6) % 7;
  const days = Math.round((midnight(shiftMonth(month, 1) + '-01') - midnight(first)) / DAY);
  const cells = Array.from({length: Math.ceil((leading + days) / 7) * 7}, (_, index) => {
    const offset = index - leading;
    return offset >= 0 && offset < days ? shiftDay(first, offset) : null;
  });
  return cells;
}

function answerInterval(log) {
  const timing = log.timing;
  if (!timing?.reliable || !Number.isFinite(timing.activeMs) || timing.activeMs <= 0) return null;
  const end = Number.isFinite(timing.answeredAt) && timing.answeredAt > 0
    ? Math.min(timing.answeredAt, log.at) : log.at;
  const start = Number.isFinite(timing.shownAt) && timing.shownAt > 0 ? timing.shownAt : 0;
  const duration = Math.min(timing.activeMs, end - start, MAX_ANSWER_MS);
  return duration > 0 ? [end - duration, end] : null;
}

function unionDuration(ranges) {
  let total = 0;
  let lastEnd = 0;
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    if (end <= lastEnd) continue;
    total += end - Math.max(start, lastEnd);
    lastEnd = end;
  }
  return total;
}

export function summarizeStudy(logs, now = Date.now()) {
  const firstDay = new Map();
  const days = new Map();
  const wrong = new Map();
  const day = key => {
    if (!days.has(key)) days.set(key, {words: new Set(), ranges: [], attempts: 0});
    return days.get(key);
  };

  for (const log of logs) {
    if (!log || typeof log.word !== 'string' || !Number.isFinite(log.at) || log.at <= 0 ||
        log.at > now || typeof log.correct !== 'boolean') continue;
    const key = localStudyDay(log.at);
    const seen = firstDay.get(log.word);
    if (!seen || key < seen) firstDay.set(log.word, key);
    const entry = day(key);
    entry.words.add(log.word);
    entry.attempts++;

    const interval = answerInterval(log);
    if (interval) {
      let [start, end] = interval;
      while (start < end) {
        const timeDay = localStudyDay(start);
        const segmentEnd = Math.min(end, midnight(timeDay) + DAY);
        day(timeDay).ranges.push([start, segmentEnd]);
        start = segmentEnd;
      }
    }

    if (log.correct) continue;
    if (!wrong.has(log.word)) wrong.set(log.word, {word: log.word, count: 0, spelling: 0, days: new Set(), latest: 0});
    const miss = wrong.get(log.word);
    miss.count++;
    if (log.assist) miss.spelling++;
    miss.days.add(key);
    miss.latest = Math.max(miss.latest, log.at);
  }

  const daily = new Map();
  for (const [key, entry] of days) {
    const newWords = [...entry.words].filter(word => firstDay.get(word) === key).length;
    daily.set(key, {
      newWords, reviewed: entry.words.size - newWords, practiced: entry.words.size,
      attempts: entry.attempts, milliseconds: unionDuration(entry.ranges)
    });
  }
  const repeated = [...wrong.values()].filter(item => item.count >= MIN_REPEATED_ERRORS)
    .sort((a, b) => b.count - a.count || b.latest - a.latest || a.word.localeCompare(b.word));
  return {daily, repeated};
}

export function heatLevel(practiced) {
  if (practiced >= 20) return 4;
  if (practiced >= 10) return 3;
  if (practiced >= 5) return 2;
  return practiced > 0 ? 1 : 0;
}

export function formatStudyTime(milliseconds) {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分 ${seconds % 60} 秒`;
}
