import {initAnswerSoundSettings} from './answer-sounds.mjs?v=45';

const choices = (label,name,items) => '<div class="settingRow settingChoiceRow">'+
  '<span id="'+name+'Label">'+label+'</span><div class="settingChoices" role="radiogroup" aria-labelledby="'+name+'Label">'+
  items.map(([value,caption])=>'<label><input type="radio" name="'+name+'" value="'+value+'"><span>'+caption+'</span></label>').join('')+
  '</div></div>';
const volumeRow = (label,id,key) => '<label class="settingRow settingsVolume" for="'+id+'"><span>'+label+
  '</span><output for="'+id+'"></output><input type="range" min="0" max="100" step="5" id="'+id+'" data-sound-volume="'+key+'"></label>';
function settingChoice(name,key,fallback,onChange) {
  const items=[...panel.querySelectorAll('[name="'+name+'"]')];
  let value=fallback;
  try { value=localStorage.getItem(key) || fallback; } catch {}
  if (!items.some(item=>item.value===value)) value=fallback;
  items.find(item=>item.value===value).checked=true;
  for(const item of items) item.onchange=()=>{
    value=item.value;
    try { localStorage.setItem(key,value); } catch {}
    onChange(value);
  };
  onChange(value);
  return ()=>value;
}
const panel = document.createElement('dialog');
panel.id = 'siteSettings';
panel.setAttribute('aria-labelledby','siteSettingsTitle');
panel.innerHTML = '<div class="settingsTop"><h2 id="siteSettingsTitle">设置</h2><form method="dialog"><button>关闭</button></form></div>'+
  '<section aria-labelledby="themeTitle"><h3 id="themeTitle">外观</h3>'+
  choices('主题','roomTheme',[['system','跟随系统'],['light','浅色'],['dark','深色']])+'</section>'+
  '<section aria-labelledby="soundTitle"><h3 id="soundTitle">声音设置</h3>'+
  '<label class="settingRow"><span>答后自动读词</span><input type="checkbox" role="switch" data-answer-sound="autoPronounce"></label>'+
  '<label class="settingRow"><span>答对提示音</span><input type="checkbox" role="switch" data-answer-sound="correct"></label>'+
  '<label class="settingRow"><span>答错提示音</span><input type="checkbox" role="switch" data-answer-sound="wrong"></label>'+
  choices('词汇发音','wordAccent',[['en-US','美音'],['en-GB','英音']])+
  volumeRow('词汇读音音量','pronunciationVolume','pronunciationVolume')+
  volumeRow('答题提示音音量','effectsVolume','effectsVolume')+'</section>'+
  '<section aria-labelledby="readingTitle"><h3 id="readingTitle">解析显示</h3>'+
  choices('解析字号','explanationSize',[['16','标准 · 16'],['18','大 · 18'],['20','特大 · 20']])+
  '<label class="settingRow"><span>显示同族词</span><input type="checkbox" role="switch" data-explanation="family" checked></label><label class="settingRow"><span>显示近义词</span><input type="checkbox" role="switch" data-explanation="synonyms" checked></label><label class="settingRow"><span>显示前缀</span><input type="checkbox" role="switch" data-explanation="prefixes" checked></label><label class="settingRow"><span>显示词根与其他构词</span><input type="checkbox" role="switch" data-explanation="roots" checked></label></section>';
document.body.append(panel);
initAnswerSoundSettings(panel);
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
const applyTheme=value=>{
  const dark=value==='dark'||value!=='light'&&systemTheme.matches;
  document.documentElement.dataset.theme=dark?'dark':'light';
  window.CET6Android?.setPageDark?.(dark);
};
const theme=settingChoice('roomTheme','cet6-room-theme','system',applyTheme);
systemTheme.addEventListener('change',()=>applyTheme(theme()));
settingChoice('explanationSize','cet6-explanation-size','16',value=>
  document.documentElement.style.setProperty('--explanation-size',value+'px'));
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

document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click',openSettings));
