import assert from 'node:assert/strict';
import {calendarDays, formatStudyTime, heatLevel, shiftMonth, studyTimeHeatLevel, summarizeStudy} from './dist/study-analytics.mjs';

const time = (day, clock) => Date.parse(`2026-11-${day}T${clock}+08:00`);
const log = (word, day, clock, options = {}) => ({
  word, at: time(day, clock), correct: true, ...options
});
const timed = activeMs => ({reliable: true, activeMs});
const logs = [
  log('avoid', 18, '08:00:30', {correct: false, timing: timed(30000)}),
  log('avoid', 17, '23:40:00', {correct: false}),
  log('likely', 18, '08:00:40', {timing: timed(20000)}),
  log('likely', 18, '08:02:00', {correct: false, assist: true}),
  log('assume', 18, '00:00:05', {timing: timed(10000)}),
  log('benefit', 18, '09:00:00', {timing: timed(500000)}),
  log('concern', 18, '09:01:00', {timing: {reliable: false, activeMs: 5000}}),
  log('avoid', 18, '10:00:00', {correct: false}),
  log('maintain', 19, '09:00:00')
];
const {daily, repeated} = summarizeStudy(logs, time(18, '20:00:00'));
const expectedHours = entries => Object.assign(Array(24).fill(0), entries);
assert.deepEqual(daily.get('2026-11-17'), {
  newWords: 1, reviewed: 0, practiced: 1, attempts: 1, milliseconds: 5000, hourlyMs: expectedHours({23:5000})
});
assert.deepEqual(daily.get('2026-11-18'), {
  newWords: 4, reviewed: 1, practiced: 5, attempts: 7, milliseconds: 225000, hourlyMs: expectedHours({0:5000,8:220000})
});
assert.equal(daily.has('2026-11-19'), false);
const acrossHour = summarizeStudy([
  log('avoid', 18, '13:00:25', {timing: timed(45000)}),
  log('likely', 18, '13:00:05', {timing: timed(10000)})
], time(18, '20:00:00')).daily.get('2026-11-18');
assert.equal(acrossHour.milliseconds, 45000);
assert.deepEqual(acrossHour.hourlyMs, expectedHours({12:20000,13:25000}));
assert.deepEqual([0, 1, 60000, 300000, 900000].map(studyTimeHeatLevel), [0, 1, 2, 3, 4]);
assert.equal(repeated.length, 1);
assert.equal(repeated[0].word, 'avoid');
assert.equal(repeated[0].count, 3);
assert.equal(repeated[0].days.size, 2);
const spellingErrors = summarizeStudy([
  log('lack', 17, '09:00:00', {correct: false}),
  log('lack', 17, '09:01:00', {correct: false, assist: true})
]).repeated;
assert.equal(spellingErrors[0].count, 2);
assert.equal(spellingErrors[0].spelling, 1);
assert.equal(summarizeStudy([log('lack', 17, '09:00:00')]).daily.get('2026-11-17').milliseconds, 0);
assert.equal(shiftMonth('2026-01', -1), '2025-12');
assert.equal(calendarDays('2028-02').filter(Boolean).length, 29);
assert.equal(calendarDays('2026-11')[6], '2026-11-01');
assert.deepEqual([0, 1, 5, 10, 20].map(heatLevel), [0, 1, 2, 3, 4]);
assert.equal(formatStudyTime(225000), '3 分 45 秒');
console.log('PASS: historical counts, daily word deduplication, overlapping and cross-midnight timing, and repeated errors.');
