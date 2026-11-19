import {initAnswerSoundSettings} from './answer-sounds.mjs?v=27';

const icons = {
  panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  vocab:'<path d="M4 19V5c4-1 6 0 8 2 2-2 4-3 8-2v14c-4-1-6 0-8 2-2-2-4-3-8-2ZM12 7v14"/>',
  listen:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="4" y="13" width="4" height="6" rx="1"/><rect x="16" y="13" width="4" height="6" rx="1"/>',
  read:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  write:'<path d="m4 20 4-1L20 7l-3-3L5 16l-1 4ZM14 7l3 3"/>',
  translate:'<path d="M3 6h12M9 3v3M6 9c1 4 4 6 7 7M12 6c-1 5-4 8-9 10M14 21l4-10 4 10m-6-3h4"/>',
  exam:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4v3h6V4m-6 8h6m-6 4h6"/>',
  stats:'<path d="M4 4v16h16M8 16v-4m5 4V8m5 8v-6"/>',
  account:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  settings:'<path d="M4 7h16M4 12h16M4 17h16"/><path d="M9 5v4m6 1v4m-6 1v4"/>'
};
const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
const routes = [
  ['vocab','词汇','study.html'],['listen','听力','practice.html?skill=listening'],
  ['read','阅读','practice.html?skill=reading'],['write','写作','practice.html?skill=writing'],
  ['translate','翻译','practice.html?skill=translation'],['exam','模拟考试','index.html?exam=1'],
  ['stats','学习统计','study.html?view=analytics']
];
const panel = document.createElement('dialog');
panel.id = 'siteSettings';
panel.setAttribute('aria-labelledby','siteSettingsTitle');
panel.innerHTML = '<div class="settingsTop"><h2 id="siteSettingsTitle">设置</h2><form method="dialog"><button>关闭</button></form></div>'+
  '<section aria-labelledby="themeTitle"><h3 id="themeTitle">外观</h3><label class="settingRow"><span>主题</span><select id="roomTheme"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label></section>'+
  '<section aria-labelledby="soundTitle"><h3 id="soundTitle">声音设置</h3>'+
  '<label class="settingRow"><span>答后自动读词</span><input type="checkbox" role="switch" data-answer-sound="autoPronounce"></label>'+
  '<label class="settingRow"><span>答对提示音</span><input type="checkbox" role="switch" data-answer-sound="correct"></label>'+
  '<label class="settingRow"><span>答错提示音</span><input type="checkbox" role="switch" data-answer-sound="wrong"></label>'+
  '<label class="settingRow"><span>词汇发音</span><select id="wordAccent"><option value="en-US">美音</option><option value="en-GB">英音</option></select></label>'+
  '<label class="settingRow settingsVolume" for="soundVolume"><span>读音与音效音量</span><output for="soundVolume"></output><input type="range" min="0" max="100" step="5" id="soundVolume" data-sound-volume></label></section>'+
  '<section aria-labelledby="readingTitle"><h3 id="readingTitle">解析显示</h3><label class="settingRow"><span>解析字号</span><select id="explanationSize"><option value="16">标准 · 16</option><option value="18">大 · 18</option><option value="20">特大 · 20</option></select></label><label class="settingRow"><span>显示同族词</span><input type="checkbox" role="switch" data-explanation="family" checked></label><label class="settingRow"><span>显示近义词</span><input type="checkbox" role="switch" data-explanation="synonyms" checked></label><label class="settingRow"><span>显示前缀</span><input type="checkbox" role="switch" data-explanation="prefixes" checked></label><label class="settingRow"><span>显示词根与其他构词</span><input type="checkbox" role="switch" data-explanation="roots" checked></label></section>';
document.body.append(panel);
initAnswerSoundSettings(panel);
const theme=panel.querySelector('#roomTheme');
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
try { theme.value=localStorage.getItem('cet6-room-theme') || 'system'; } catch {}
if(!theme.value) theme.value='system';
const applyTheme=()=>{document.documentElement.dataset.theme=theme.value==='system'?(systemTheme.matches?'dark':'light'):theme.value;};
theme.onchange=()=>{applyTheme();try { localStorage.setItem('cet6-room-theme',theme.value); } catch {}};
systemTheme.addEventListener('change',applyTheme);
applyTheme();
const size = panel.querySelector('#explanationSize');
try { size.value = localStorage.getItem('cet6-explanation-size') || '16'; } catch {}
if (!size.value) size.value = '16';
function updateSize() { document.documentElement.style.setProperty('--explanation-size',size.value+'px'); }
updateSize();
size.onchange = () => { updateSize(); try { localStorage.setItem('cet6-explanation-size',size.value); } catch {} };
for (const checkbox of panel.querySelectorAll('[data-explanation]')) {
  const key = checkbox.dataset.explanation;
  try { checkbox.checked = localStorage.getItem('cet6-explanation-'+key) !== 'hide'; } catch {}
  function show() { document.body.classList.toggle('hide-explanation-'+key,!checkbox.checked); }
  checkbox.onchange = () => {
    show();
    try { localStorage.setItem('cet6-explanation-'+key,checkbox.checked?'show':'hide'); } catch {}
  };
  show();
}
function openSettings() {
  if (panel.open) return;
  panel.dispatchEvent(new CustomEvent('cet6-settings-open'));
  panel.showModal();
}

const aside = document.createElement('aside');
aside.className = 'roomSidebar';
aside.innerHTML = '<div class="roomSidebarTop"><a class="brand" href="study.html" aria-label="CET6 复习室">CET<span>6</span></a>'+
  '<button id="roomSidebarToggle" type="button" aria-controls="roomSidebarLinks" title="收起边栏">'+icon('panel')+'</button></div>'+
  '<nav id="roomSidebarLinks" aria-label="复习室模块">'+routes.map(([id,label,url]) =>
    '<a data-module="'+id+'" href="'+url+'" title="'+label+'" aria-label="'+label+'">'+icon(id)+'<span>'+label+'</span></a>').join('')+'</nav>'+
  '<div class="roomSidebarBottom"><button type="button" data-room-account title="同步账号" aria-label="同步账号">'+icon('account')+
  '<span data-account-label>账号</span></button><button type="button" data-open-settings title="设置" aria-label="设置">'+icon('settings')+'<span>设置</span></button></div>';
document.body.prepend(aside);
const toggle = aside.querySelector('#roomSidebarToggle');
let collapsed = false;
try { collapsed = localStorage.getItem('cet6-room-sidebar') === 'collapsed'; } catch {}
function showSidebar() {
  document.body.classList.toggle('roomSidebarCollapsed',collapsed);
  toggle.setAttribute('aria-expanded',String(!collapsed));
  toggle.title = collapsed ? '展开边栏' : '收起边栏';
  toggle.setAttribute('aria-label',toggle.title);
}
showSidebar();
toggle.onclick = () => {
  collapsed = !collapsed;
  showSidebar();
  try { localStorage.setItem('cet6-room-sidebar', collapsed ? 'collapsed' : 'expanded'); } catch {}
};

document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click',openSettings));
const accountButton = aside.querySelector('[data-room-account]');
accountButton.onclick = () => {
  const dialog = document.getElementById('syncDialog');
  if (dialog) { if (!dialog.open) dialog.showModal(); }
  else location.assign('study.html?sync=1');
};
window.addEventListener('cet6-sync-account', ({detail}) => {
  const caption = detail || '账号';
  aside.querySelector('[data-account-label]').textContent = caption;
  accountButton.title = detail ? '同步账号：'+detail : '同步账号';
});
function mark(module) {
  aside.querySelectorAll('[data-module]').forEach(a => {
    if (a.dataset.module === module) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
}
const url = new URL(location.href);
const page = url.pathname.split('/').pop();
if (page === 'practice.html') mark(({listening:'listen',reading:'read',writing:'write',translation:'translate'})[url.searchParams.get('skill')] || 'listen');
else if (page === 'word-handbook.html' && url.searchParams.get('from') === 'writing') mark('write');
else if (page === 'index.html' || !page) mark('exam');
else mark(url.searchParams.get('view') === 'analytics' ? 'stats' : 'vocab');
window.addEventListener('training-view-change', event => mark(event.detail === 'analytics' ? 'stats' : 'vocab'));
if ('CET6Android' in window || location.hostname === 'appassets.androidplatform.net') document.body.classList.add('cet6Native');
document.body.classList.add('withRoomShell');
