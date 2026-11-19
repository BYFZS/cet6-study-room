import {dayKey} from './learning-core.mjs?v=6';
import {calendarDays, formatStudyTime, heatLevel, shiftMonth, studyTimeHeatLevel, summarizeStudy} from './study-analytics.mjs?v=39';

const dateTitle = key => {
  const [year, month, day] = key.split('-').map(Number);
  return `${year} 年 ${month} 月${day ? ' ' + day + ' 日' : ''}`;
};

function hourlyHeatHTML(hourlyMs) {
  return Array.from({length: 24}, (_, hour) => {
    const start = String(hour).padStart(2, '0') + ':00';
    const end = String(hour + 1).padStart(2, '0') + ':00';
    const amount = hourlyMs?.[hour] ?? 0;
    const duration = amount ? formatStudyTime(amount) : '0 分';
    return `<li class="hourHeatCell heat${studyTimeHeatLevel(amount)}" title="${start}–${end} · ${duration}">
      <span>${start}</span><span class="heatCount">${amount ? duration.replaceAll(' ', '') : '—'}</span>
    </li>`;
  }).join('');
}

export function setupStudyStats({$, getLogs, openRepeated}) {
  let today = dayKey();
  let selected = today;
  let month = selected.slice(0, 7);

  function render() {
    const current = dayKey();
    if (selected === today && today !== current) {
      selected = current;
      month = current.slice(0, 7);
    }
    today = current;
    const {daily, repeated} = summarizeStudy(getLogs());
    const date = daily.get(selected);
    const earliest = [...daily.keys()].sort()[0]?.slice(0, 7) ?? today.slice(0, 7);
    $('studyMonth').textContent = dateTitle(month);
    $('studyPrevious').disabled = month <= earliest;
    $('studyNext').disabled = month >= today.slice(0, 7);
    $('studyToday').disabled = selected === today;
    $('studySelected').textContent = selected === today ? '今天 · ' + dateTitle(selected) : dateTitle(selected);
    $('studyMinutes').textContent = date?.milliseconds ? formatStudyTime(date.milliseconds) : date?.attempts ? '未记录' : '0 分';
    $('studyNew').textContent = String(date?.newWords ?? 0);
    $('studyReviewed').textContent = String(date?.reviewed ?? 0);
    $('studyHours').innerHTML = hourlyHeatHTML(date?.hourlyMs);
    $('studyHoursEmpty').hidden = Boolean(date?.milliseconds);
    $('studyRepeated').textContent = `查看反复错词本（${repeated.length}） →`;
    $('studyCalendar').innerHTML = calendarDays(month).map(key => {
      if (!key) return '<span aria-hidden="true"></span>';
      const count = daily.get(key)?.practiced ?? 0;
      const day = Number(key.slice(8));
      if (key > today) return `<span class="heatFuture" aria-hidden="true">${day}</span>`;
      const label = `${dateTitle(key)}，练习 ${count} 个词`;
      return `<button type="button" class="heatCell heat${heatLevel(count)}" data-day="${key}"
        aria-label="${label}" aria-pressed="${key === selected}" title="${label}">
        <span>${day}</span>${count ? `<span class="heatCount">${count} 词</span>` : ''}</button>`;
    }).join('');
  }

  function moveMonth(offset) {
    month = shiftMonth(month, offset);
    selected = month + '-01';
    render();
  }

  $('studyPrevious').onclick = () => moveMonth(-1);
  $('studyNext').onclick = () => moveMonth(1);
  $('studyRepeated').onclick = openRepeated;
  $('studyToday').onclick = () => {
    selected = dayKey();
    month = selected.slice(0, 7);
    render();
  };
  $('studyCalendar').onclick = event => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    selected = button.dataset.day;
    render();
    $('studyCalendar').querySelector(`[data-day="${selected}"]`)?.focus({preventScroll: true});
    $('studyDayDetails').scrollIntoView({block: 'nearest'});
  };
  return {render};
}
