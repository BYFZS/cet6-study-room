import {filterMistakes} from './mistake-filters.mjs?v=27';
import {attachRelations,attachSynonymSenses} from './word-contrasts.mjs?v=10';
import {BASE_KEY,LEARN_KEY,DAY,dayKey,gradeBaseline,emptyDB,newMemory,syncBaseline,isWeak,isStable,recordReview,selectWords,validateBackup} from './learning-core.mjs?v=32';
import {migrateThree,passedToday,weakThree,selectThreeWords,mergeWordDecks,selectPassedWords,previouslyPassed,markWordEasy,reviewDueTime,REVIEW_INTERVALS,EASY_REVIEW_DAYS} from './learning-core.mjs?v=32';
import {initThreeUI,reconcilePausedCard} from './three-round-ui.mjs?v=48';
import {setupSyncUI} from './sync-ui.mjs?v=29';
import {summarizeStudy} from './study-analytics.mjs?v=42';
import {setupStudyStats} from './study-stats-ui.mjs?v=42';
import {setupContextQuiz} from './context-quiz-ui.mjs?v=45';
import {STUDY_ACTIVITY, trackStudyActivity} from './study-activity.mjs?v=42';
import {studyLogWithQuizzes} from './context-quiz.mjs?v=41';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let deck=[],optionPositions={},baseline=null,db=emptyDB(),sync=null,quiz=null;
const initialParams = new URLSearchParams(location.search);
let pendingInitialView = initialParams.get('view');
try{baseline=JSON.parse(localStorage.getItem(BASE_KEY));const saved=JSON.parse(localStorage.getItem(LEARN_KEY));if([2,3].includes(saved?.version)&&saved.type==='cet6-learning')db=saved;}catch{}
function message(s=''){$('message').textContent=s;}
function save(notifySync=true){try{localStorage.setItem(LEARN_KEY,JSON.stringify(db));$('saved').textContent='已保存 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});if(notifySync)sync?.changed();}catch{message('浏览器无法保存，请立即导出学习记录备份。');}}
function view(name) {
 pendingInitialView = null;
 if (!['training','contextQuiz','words'].includes(name)) studyActivity.pause();
 const openingTraining = name === 'training' && $('training').hidden;
 const insideTraining = name === 'training' || name === 'roundEnd';
 const showingStats = name === 'analytics';
 const insideVocabulary = ['words', 'contextQuiz', 'scores'].includes(name);
 const enteringSubpage = insideVocabulary && $(name).hidden;
 window.dispatchEvent(new CustomEvent('training-view-change', {detail: name}));
 for (const section of ['home', 'scores', 'words', 'analytics', 'contextQuiz', 'training', 'roundEnd']) {
  $(section).hidden = section !== name;
 }
 if (name !== 'training') sync?.applyPending();
 delete document.documentElement.dataset.loadingAnalytics;
 $('moduleNav').hidden = insideTraining || insideVocabulary;
 $('vocabNav').hidden = insideTraining || insideVocabulary || showingStats;
 $('backToVocabulary').hidden = !insideVocabulary;
 $(showingStats ? 'statsModule' : 'vocabModule').setAttribute('aria-current', 'page');
 $(showingStats ? 'vocabModule' : 'statsModule').removeAttribute('aria-current');
 const url = new URL(location.href);
 if (url.searchParams.has('view') && url.searchParams.get('view') !== name) {
  url.searchParams.delete('view');
  history.replaceState(history.state, '', url);
 }
 document.body.classList.toggle('trainingMode', insideTraining);
 document.body.classList.toggle('vocabularySubpage', insideVocabulary);
 if (openingTraining || enteringSubpage) window.scrollTo(0, 0);
 document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
 if (name === 'home') renderHome();
 if (name === 'scores') renderScores();
 if (name === 'words') renderWords();
 if (showingStats) studyStats.render();
 if (name === 'contextQuiz') quiz?.render();
 if (enteringSubpage) $('backToVocabulary').focus({preventScroll: true});
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
document.addEventListener('click', event => {
 const link = event.target.closest('#vocabModule, #statsModule, #roomSidebarLinks [data-module="vocab"], #roomSidebarLinks [data-module="stats"]');
 if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
 event.preventDefault();
 const url = new URL(location.href);
 const name = link.id === 'statsModule' || link.dataset.module === 'stats' ? 'analytics' : 'home';
 if (name === 'analytics') url.searchParams.set('view', name);
 else url.searchParams.delete('view');
 if (url.href !== location.href) history.pushState(null, '', url);
 view(name);
 window.scrollTo(0, 0);
});
window.addEventListener('popstate', () => {
 view(new URLSearchParams(location.search).get('view') === 'analytics' ? 'analytics' : 'home');
});
$('backToVocabulary').onclick = event => {
 if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
 event.preventDefault();
 view('home');
 window.scrollTo(0, 0);
 $('vocabNav').querySelector('[data-view="home"]').focus({preventScroll: true});
};
const studyStats=setupStudyStats({$,getLogs:()=>studyLogWithQuizzes(db),getRounds:()=>db.rounds??[],openRepeated:()=>{$('listFilter').value='repeated';$('search').value='';view('words');}});
const studyActivity=trackStudyActivity({
 isStudying:()=>!$('siteSettings')?.open&&!$('syncDialog').open&&
  (!$('training').hidden||!$('words').hidden||!$('contextQuiz').hidden&&Boolean($('quizSubmit')||$('quizBack'))),
 record:(start,end)=>{
  db.rounds??=[];
  db.rounds.push({mode:STUDY_ACTIVITY,start,at:end});
  save();
 }
});
const studyActivityObserver=new MutationObserver(studyActivity.refresh);
for(const id of ['training','words','contextQuiz','siteSettings','syncDialog']){
 const node=$(id);
 if(node)studyActivityObserver.observe(node,{attributes:true,attributeFilter:['hidden','open']});
}
studyActivityObserver.observe($('quizPanel'),{childList:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('analytics').hidden)studyStats.render();});
function renderHome(){
 const now=Date.now(),memories=deck.map(({word})=>db.memories[word]).filter(Boolean);
 const due=selectThreeWords(deck,db,'due',deck.length,now).length;
 const passed=memories.filter(memory=>passedToday(memory,now)).length;
 const learned=memories.filter(previouslyPassed).length;
 $('stats').innerHTML=[['待复习',due],['今天已通过',passed],['累计掌握',learned],['词库总量',deck.length]]
  .map(([label,count])=>'<div><span>'+label+'</span><b>'+count+'</b></div>').join('');
 $('recommendation').textContent=due?'有 '+due+' 个词待复习。练习中会穿插新词。':'系统会安排新词和通过词抽查。';
 $('startRound').textContent=db.session?'继续词汇训练 →':'开始词汇训练 →';
 quiz?.refreshHome();
}
function renderScores(){const box=$('scoreBox'),rows=gradeBaseline(baseline,deck,db.overrides);if(!rows.length){box.innerHTML='<h2>导入答卷，生成你的起点</h2><p>尚未找到本浏览器的已提交答卷。点击右上角“导入答卷 / 备份”，选择你导出的20词JSON文件。</p><p><a href="vocabulary.html">打开20词摸底 →</a></p>';return;}
 const correct=rows.filter(r=>r.result==='correct').length,wrong=rows.filter(r=>r.result==='wrong').length,pending=rows.length-correct-wrong,uncertain=rows.filter(r=>r.result==='correct'&&r.confidence!=='known').length;
 box.innerHTML=`<p class="eyebrow">BASELINE SCORE / 规则初评分</p><div class="scoreBig"><b>${correct} / 20</b><span>${pending?'另有 '+pending+' 词待核对':'正确率 '+Math.round(correct/20*100)+'%'}</span></div><p>答错或不会 ${wrong} 词；答对但眼熟 ${uncertain} 词。错误与眼熟会进入复习队列。</p><p class="fine">按常见同义释义匹配。未识别的表达列为待核对，不直接判错；可纠正判分。此分数只对应本次20词，不推算总词汇量。</p><table class="scoreTable"><thead><tr><th>单词</th><th>你的答案</th><th>结果</th><th class="detailCol">参考词义</th><th>纠正判分</th></tr></thead><tbody>${rows.map(r=>{const w=deck.find(w=>w.word===r.word);return `<tr><td>${esc(r.word)}</td><td>${esc(r.meaning||'不会')}</td><td class="${r.result==='correct'?'good':'bad'}">${({correct:'正确',wrong:'待练',pending:'待核对'})[r.result]}${r.confidence==='familiar'?' · 眼熟':''}</td><td class="detailCol">${esc(w.meaning)}</td><td><button data-override="correct" data-word="${r.word}">判对</button><button data-override="wrong" data-word="${r.word}">判错</button><button data-override="auto" data-word="${r.word}">按规则</button></td></tr>`;}).join('')}</tbody></table><p><a href="vocabulary.html">回看20词摸底 →</a></p>`;
 box.querySelectorAll('[data-override]').forEach(b=>b.onclick=()=>{const word=b.dataset.word;if(b.dataset.override==='auto')delete db.overrides[word];else db.overrides[word]=b.dataset.override;const row=gradeBaseline(baseline,deck,db.overrides).find(r=>r.word===word),m=db.memories[word]||newMemory();m.seedWeak=row.result!=='correct'||row.confidence!=='known';if(m.seedWeak)m.due=Date.now();db.memories[word]=m;save();renderScores();});}
function renderWords(){
 document.querySelectorAll('[data-word-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.wordFilter===$('listFilter').value)));
 const filter=$('listFilter').value,search=$('search').value.trim().toLowerCase();
 const repeated=filter==='repeated', easy=filter==='easy', showEasyButton=easy||filter==='all';
 $('easyWordInfo').hidden=!easy;
 $('repeatInfo').hidden=$('mistakeFilters').hidden=!repeated;
 const misses=new Map(repeated?summarizeStudy(studyLogWithQuizzes(db)).repeated.map(item=>[item.word,item]):[]);
 const due=filter==='due'?new Set(selectThreeWords(deck,db,'due',deck.length)):new Set();
 const deckByWord=new Map(deck.map(word=>[word.word,word]));
 const pool=repeated?[...misses.keys()].map(word=>deckByWord.get(word)).filter(Boolean):deck;
 let rows=pool.filter(w=>(repeated||filter==='all'||filter==='weak'&&weakThree(db.memories[w.word])||
   filter==='due'&&due.has(w.word)||filter==='core'&&w.priority==='core'||
   filter==='paper'&&w.source!=='基础摸底'||filter==='passed'&&previouslyPassed(db.memories[w.word])||
   easy&&db.memories[w.word]?.easy===true&&previouslyPassed(db.memories[w.word]))&&
   (!search||(w.word+' '+w.meaning).toLowerCase().includes(search)));
 if(repeated){
  rows=filterMistakes(rows,misses,$('mistakeKind').value,$('mistakeOrder').value);
  $('mistakeResults').textContent='显示 '+rows.length+' / '+pool.length+' 个';
 }
 if(easy){
  rows.sort((a,b)=>db.memories[a.word].due-db.memories[b.word].due||a.word.localeCompare(b.word,'en'));
  $('easyWordCount').textContent=rows.length+' 个';
 }
 $('wordList').innerHTML=rows.length?rows.map(w=>{
  const m=db.memories[w.word],miss=misses.get(w.word);
  const status=m?.easy&&previouslyPassed(m)?'熟练词':passedToday(m)?(m.lastVerifiedDay===dayKey()?'今日抽查通过':'今日三轮通过'):
   weakThree(m)?'需要重练':m?.cycleDay===dayKey()&&m.stage>0?'已过'+m.stage+'/3轮':m?.attempts?'待复测':'未训练';
  const missText=miss?'<p class="repeatCount">累计答错 '+miss.count+' 次'+(miss.spelling?'（拼写 '+miss.spelling+' 次）':'')+
   ' · '+miss.days.size+' 天 · 最近 '+dayKey(miss.latest)+'</p>':'';
  const timing=previouslyPassed(m)?' · 复习间隔 '+(m.easy?EASY_REVIEW_DAYS:REVIEW_INTERVALS[m.reviewLevel||0])+' 天':'';
  const dueText=m?.due?' · 下次 '+new Date(m.due).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  const easyButton=showEasyButton?'<button type="button" data-library-easy aria-pressed="'+Boolean(m?.easy)+'">'+(m?.easy?'取消简单':'标记简单')+'</button>':'';
  return '<article class="wordCard" data-library-word="'+esc(w.word)+'"><div class="wordTop"><strong>'+esc(w.word)+'</strong><span>'+status+' · '+esc(w.source)+'</span>'+
   '<div class="wordActions">'+easyButton+'<button type="button" data-toggle>'+(m?.manualWeak?'取消手动收藏':'手动收藏')+'</button></div></div>'+
   missText+'<p class="meaning">'+esc(w.meaning)+'</p><p class="example">'+esc(w.example)+'</p><p>'+
   esc(w.translation)+'</p><p>'+esc(w.collocation)+'</p><small>练习 '+(m?.attempts||0)+' 次 · 三轮通过 '+
   (m?.passDays?.length||0)+' 个日期'+timing+dueText+'</small></article>';
 }).join(''):'<div class="panel"><p>'+(repeated&&!pool.length?'累计答错两次的词会出现在这里。':easy&&!search?'还没有熟练词。在词汇训练中点「简单」即可加入。':'暂无符合筛选的词。')+'</p></div>';
}
$('wordList').addEventListener('click', event => {
 const button=event.target.closest('button[data-toggle],button[data-library-easy]');
 if(!button)return;
 const word=button.closest('[data-library-word]').dataset.libraryWord;
 const m=db.memories[word]||newMemory();
 const marking=button.hasAttribute('data-library-easy');
 if(!marking){
  m.manualWeak=!m.manualWeak;
  if(m.manualWeak&&!m.easy)m.due=Date.now();
  db.memories[word]=m;
 }else if(!m.easy){
  const {beforeLibraryEasy, ...previous}=m;
  const now=Date.now();
  const snapshot=structuredClone(previous);
  markWordEasy(db,word,now).beforeLibraryEasy={at:now,previous:snapshot};
 }else if(m.beforeLibraryEasy?.at===m.lastReviewed){
  db.memories[word]={...m.beforeLibraryEasy.previous,manualWeak:m.manualWeak};
 }else{
  delete m.easy;
  delete m.beforeLibraryEasy;
  m.due=Math.min(m.due,reviewDueTime(Date.now(),REVIEW_INTERVALS[m.reviewLevel||0]));
 }
 save();
 renderWords();
 const card=[...$('wordList').children].find(item=>item.dataset.libraryWord===word);
 (card?.querySelector(marking?'[data-library-easy]':'[data-toggle]')??$('words').querySelector('[data-word-filter][aria-pressed="true"]'))?.focus({preventScroll:true});
});
$('search').oninput=$('mistakeKind').onchange=$('mistakeOrder').onchange=renderWords;
document.querySelectorAll('[data-word-filter]').forEach(button=>button.onclick=()=>{
 $('listFilter').value=button.dataset.wordFilter;
 renderWords();
});
initThreeUI({$,getDeck:()=>deck,getDB:()=>db,getOptionPosition:term=>optionPositions[term],view,save,message,esc,beforeNext:()=>sync?.applyPending(),onGroupFinished:container=>quiz?.announceAtGroupEnd(container)});
$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('文件超过10MB');const raw=JSON.parse(await file.text());if(raw.test==='cet6-vocabulary-01'){if(raw.status!=='submitted'||raw.responses?.length!==20||new Set(raw.responses.map(r=>r.word)).size!==20||raw.responses.some(r=>!deck.slice(0,20).some(w=>w.word===r.word)||typeof r.meaning!=='string'||!['known','familiar','unknown'].includes(r.confidence)))throw Error('20词答卷格式不正确，需导入已提交的答卷');baseline=raw;localStorage.setItem(BASE_KEY,JSON.stringify(raw));syncBaseline(db,baseline,deck);migrateThree(db);save();message('答卷已导入并评分，错词与眼熟词已加入复习队列。');view('scores');}else{validateBackup(raw,deck.map(w=>w.word));if(!confirm('导入备份会替换当前浏览器的词汇学习记录。是否继续？'))return;db=migrateThree(raw.learning);db.session=null;db.overrides??={};baseline=raw.baseline||null;if(baseline)localStorage.setItem(BASE_KEY,JSON.stringify(baseline));else localStorage.removeItem(BASE_KEY);save();message('备份已恢复。');view('home');}}catch(err){message('导入失败：'+err.message);}finally{e.target.value='';}};
$('backup').onclick=()=>{const out={type:'cet6-learning-backup',version:3,exportedAt:new Date().toISOString(),baseline,learning:db};const url=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='CET6-词汇学习记录-'+dayKey()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
if (pendingInitialView === 'analytics') view('analytics');
const loadStudyFiles = paths => Promise.all(paths.map(async path => {
  const response = await fetch(path);
  if (!response.ok) throw Error(path + ' 加载失败');
  return response.json();
}));
try {
 const [responses, relations, details] = await Promise.all([
  loadStudyFiles(['base-words.json?v=2','paper-words.json?v=2','paper-extra-reading.json?v=2','paper-extra-mixed.json?v=2','paper-writing-translation.json?v=2']),
  loadStudyFiles(['word-relations-a.json?v=20','word-relations-b.json?v=2','synonym-senses-priority.json?v=11','synonym-senses-general.json?v=11','synonym-senses-usage.json?v=12']),
  loadStudyFiles(['context-hints-a.json?v=12','context-hints-b.json?v=12','context-combinations.json?v=12',
   'word-parts-prefixes.json?v=27','word-parts-roots.json?v=27','word-pos-a.json?v=13','word-pos-b.json?v=13',
   'word-families.json?v=27','word-phrase-notes.json?v=27','word-pos-glosses.json?v=13','distractor-pos.json?v=13','word-syllables.json?v=13'])
 ]);
 const [hintA,hintB,combinations,prefixes,roots,posA,posB,families,phrases,glosses,distractorPos,syllables] = details;
 deck=attachSynonymSenses(attachRelations(mergeWordDecks(responses),...relations.slice(0,2)),...relations.slice(2));
 syncBaseline(db,baseline,deck);
 migrateThree(db);
 save();
 const morphology={...roots,...prefixes},positions={...posA,...posB};
 const familyByWord=new Map(families.flatMap(family=>family.words.map(([term])=>[term,family])));
 optionPositions={...distractorPos,...Object.fromEntries(families.flatMap(group=>group.words.map(([term,pos])=>[term,pos]))),...positions};
 deck=deck.map(word=>({...word,morphology:morphology[word.word],pos:positions[word.word],posGlosses:glosses[word.word],syllables:syllables[word.word],family:familyByWord.get(word.word),phrase:phrases[word.word]}));
 $('startRound').disabled=false;
 quiz=setupContextQuiz({$,esc,getDB:()=>db,getDeck:()=>deck,hints:{...hintA,...hintB},combinations,openView:view,save,message});
 renderHome();
 sync=setupSyncUI({
  getDB:()=>db,
  canApply:()=>$('training').hidden||!db.session?.current||db.session.current.status==='done',
  apply:progress=>{
   const word = db.session?.current?.word;
   if (word && $('training').hidden) reconcilePausedCard(db.session, db.memories[word], progress.memories[word]);
   Object.assign(db,progress);save(false);
   if(!$('home').hidden)renderHome();
   if(!$('words').hidden)renderWords();
   if(!$('scores').hidden)renderScores();
   if(!$('analytics').hidden)studyStats.render();
   if(!$('contextQuiz').hidden&&!quiz.hasDraft())quiz.render();
  }
 });
 $('showSync').disabled=false;
 if(initialParams.get('sync')==='1'){const url=new URL(location.href);url.searchParams.delete('sync');history.replaceState(null,'',url);$('showSync').click();}
 const initialView=pendingInitialView;
 if(initialView==='training')$('startRound').click();
 else if(initialView==='scores'||initialView==='contextQuiz')view(initialView);
 else if(!$('analytics').hidden)studyStats.render();
 else if(!$('scores').hidden)renderScores();
 else if(!$('words').hidden)renderWords();
 else if(!$('contextQuiz').hidden)quiz.render();
}catch(e){message('词库加载失败，请刷新重试：'+e.message);$('startRound').disabled=true;}

