import {dayKey,grade,passedToday,prepareThree,recordStage,selectThreeWords,normalize,selectPassedWords,canSpotCheck,recordSpotCheck,needsSpellingAid,spellingMatches,recordSpellingAid} from './learning-core.mjs?v=6';
import {planTraining,attachAnswerTiming} from './adaptive-training.mjs?v=6';
import {harderOptions,contrastCandidates} from './word-contrasts.mjs?v=10';
import {partOfSpeechHTML,morphologyHTML,confusionHTML} from './feedback-notes.mjs?v=12';
const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const aliases=w=>[...w.aliases,...w.meaning.split(/[；;、，,]/)].map(normalize).filter(Boolean);
export const choiceOptions=harderOptions;
const CHOICE_VERSION=3;
export function initThreeUI({$,getDeck,getDB,view,save,message,esc,beforeNext=()=>{},onGroupFinished=()=>{}}){
 const previousDialog=$('previousWordDialog');
 const wordData=word=>getDeck().find(w=>w.word===word);
 const previousCard=()=>{
  const card=getDB().previousCard;
  return card?.status==='done'&&wordData(card.word)?card:null;
 };
 function rebase(){const db=getDB(),s=db.session;if(s&&s.day!==dayKey()){const plan=planTraining(getDeck(),db);s.day=dayKey();s.scope='auto';s.words=plan.words;s.queue=[...plan.words];s.checkWords=plan.checkWords;s.current=null;s.passed={};s.attempts=0;s.deferred=[];message('新的一天，已重新混排到期复习和新词。');save();}}

 let activeCard=null;
 function activateTiming(c){if(c.answered||previousDialog.open||document.hidden||$('training').hidden)return;if(activeCard!==c){if(!c.shownAt){c.shownAt=Date.now();c.timingReliable=false;}c.activeMs??=0;c.activeSince=Date.now();activeCard=c;}if(!c.activeSince&&!document.hidden)c.activeSince=Date.now();}
 function pauseTiming(){const c=getDB().session?.current;if(c&&!c.answered){if(c.activeSince){c.activeMs=(c.activeMs||0)+Date.now()-c.activeSince;c.activeSince=null;}c.interrupted=true;save();}}
 function stopTiming(c){if(c.activeSince){c.activeMs=(c.activeMs||0)+Date.now()-c.activeSince;c.activeSince=null;}return {shownAt:c.shownAt,answeredAt:Date.now(),activeMs:c.activeMs||0,wallMs:Date.now()-(c.shownAt||Date.now()),reliable:!!c.timingReliable,interrupted:!!c.interrupted,hintUsed:!!c.hintSeen,audioUsed:!!c.audioUsed};}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseTiming();else{const c=getDB().session?.current;if(c)activateTiming(c);}});window.addEventListener('pagehide',pauseTiming);window.addEventListener('training-view-change',e=>{if(e.detail!=='training')pauseTiming();});
 function newQuestion(){rebase();const db=getDB(),s=db.session;if(!s)return;while(s.scope!=='check'&&s.queue.length&&!(s.checkWords||[]).includes(s.queue[0])&&passedToday(db.memories[s.queue[0]]))s.queue.shift();if(!s.queue.length){finish();return;}const word=s.queue.shift(),assist=needsSpellingAid(db.memories[word]),check=!assist&&canSpotCheck(db.memories[word],(s.checkWords||[]).includes(word)?'check':s.scope),m=check?db.memories[word]:prepareThree(db,word),round=assist?0:check?3:m.stage+1,w=wordData(word);if(assist){m.stage=0;m.needsRelearn=true;}s.current={word,round,check,assist,day:dayKey(),shownAt:Date.now(),activeMs:0,activeSince:Date.now(),timingReliable:true,options:round>0&&round<3?choiceOptions(w,getDeck(),round):[],optionsVersion:CHOICE_VERSION,answered:false,status:'open',userAnswer:''};save();render();}
 function start(){const db=getDB();if(db.session){if(db.session.scope!=='auto'){const current=db.session.current,plan=planTraining(getDeck(),db,current?9:10);db.session.scope='auto';db.session.words=[...new Set([...(current?[current.word]:[]),...plan.words])];db.session.queue=[...plan.words.filter(w=>w!==current?.word),...(current?.answered&&current.status==='done'&&!current.threePassed?[current.word]:[])];db.session.checkWords=plan.checkWords;db.session.passed=current?.threePassed?{[current.word]:true}:{};}rebase();if(db.session.current)render();else newQuestion();return;}const plan=planTraining(getDeck(),db);if(!plan.words.length){message('当前没有到期词或未训练词，稍后会安排抽查；可以先休息，明天再复习。');return;}db.session={protocol:3,day:dayKey(),scope:'auto',size:10,queue:[...plan.words],words:plan.words,checkWords:plan.checkWords,passed:{},attempts:0,startedAt:Date.now(),current:null,deferred:[]};save();message();newQuestion();}

 function render(){view('training');$('previousWord').disabled=!previousCard();const s=getDB().session,c=s.current,w=wordData(c.word);activateTiming(c);if(!c.answered&&!c.assist&&c.round<3&&c.optionsVersion!==CHOICE_VERSION){c.options=choiceOptions(w,getDeck(),c.round);c.optionsVersion=CHOICE_VERSION;save();}$('roundProgress').textContent=`本组通过 ${Object.keys(s.passed).length}/${s.words.length} 词 · 作答 ${s.attempts} 次`;$('cycleSteps').innerHTML=c.assist?'<span class="current">辅助记忆 · 听音看义拼写</span>':c.check?'<span class="current">通过词抽查 · 中文回忆</span>':[1,2,3].map(n=>`<span class="${n<c.round?'complete':n===c.round?'current':''}">${n<c.round?'✓ ':''}${n}. ${['英选中','中选英','写中文'][n-1]}</span>`).join('');$('questionKind').textContent=c.assist?'SPELLING AID / 辅助记忆，不计通过':c.check?'SPOT CHECK / 已通过词抽查':`ROUND ${c.round} / 3 · ${['英文选中文','中文选英文','独立填写中文意思'][c.round-1]}`;$('question').textContent=c.assist?w.meaning:c.round===2?(w.relations?.promptMeaning||w.meaning):(w.relations?.promptWord||w.word);$('questionHint').textContent=c.assist?'这个词反复出错了。先听读音、看中文，再拼英文；可以查看正确拼写帮助记忆。':c.round===3?'写一个常见中文意思；同义表达也可。不查词，先独立回忆。':c.round===2?'根据中文含义，选择对应英文。':'选择这个词的中文意思。';if(c.assist&&!('speechSynthesis' in window))$('questionHint').textContent='当前浏览器暂不支持读音，可先查看正确拼写，再尝试拼写。';$('options').replaceChildren();$('spellArea').hidden=c.round!==3&&!c.assist;$('spelling').placeholder=c.assist?'输入英文拼写':'输入一个常见中文意思';$('spelling').setAttribute('aria-label',c.assist?'英文辅助拼写':'中文意思');$('checkSpell').textContent=c.assist?'检查拼写':'检查答案';$('showSpelling').hidden=!c.assist||c.answered;$('spellingHint').hidden=!c.assist||!c.hintSeen;$('spellingHint').textContent=c.assist&&c.hintSeen?'正确拼写：'+w.word:'';$('spelling').value=(c.round===3||c.assist)?c.userAnswer:'';$('spelling').disabled=$('checkSpell').disabled=c.answered;$('feedback').hidden=true;$('nextCard').hidden=true;$('forget').hidden=c.answered;$('deferWord').hidden=c.answered;$('speak').hidden=!('speechSynthesis' in window)||c.round===2&&!c.answered;for(const opt of c.options){const b=document.createElement('button');b.textContent=opt.label;b.dataset.word=opt.word;b.disabled=c.answered;b.onclick=()=>answer(opt.word);$('options').append(b);}if(c.answered)feedback();}
 function answer(value,decision=null){const db=getDB(),s=db.session,c=s?.current;if(!c||c.answered&&!(c.status==='pending'&&decision!==null))return;if(c.day!==dayKey()){rebase();newQuestion();return;}const w=wordData(c.word);if(decision===null){if((c.round===3||c.assist)&&!value.trim()){message(c.assist?'请拼写英文，或先查看正确拼写。':'请填写词义，或点击“不会，重新训练”。');return;}c.timing=stopTiming(c);c.userAnswer=value;if(value==='∅')decision=false;else if(c.assist)decision=spellingMatches(value,c.word);else if(c.round<3)decision=value===c.word;else{const extra=Array.isArray(db.customAliases[c.word])?db.customAliases[c.word]:[];const result=grade({meaning:value,confidence:'known'},{...w,aliases:[...w.aliases,...extra]});if(result==='pending'){c.answered=true;c.status='pending';save();render();return;}decision=result==='correct';}}
  message();const manual=c.status==='pending';if(manual&&decision){db.customAliases[c.word]??=[];const text=c.userAnswer.trim();if(text.length<=100&&!db.customAliases[c.word].includes(text))db.customAliases[c.word].push(text);}
  const m=c.assist?recordSpellingAid(db,c.word,decision,!!c.hintSeen):c.check?recordSpotCheck(db,c.word,decision,manual):recordStage(db,c.word,c.round,decision,manual);c.answered=true;c.correct=decision;c.manual=manual;c.status='done';attachAnswerTiming(db,c.word,c.timing||{},c.round);c.threePassed=!c.assist&&decision&&m.stage===3;c.checkPassed=!!c.check&&decision;s.attempts++;if(c.threePassed)s.passed[c.word]=true;else{s.queue.push(c.word);delete s.passed[c.word];}save();render();
  nextCard.focus({preventScroll:true});
 }
 function relationHTML(w){
  const {synonyms=[],senses=[],confusables:listed=[],note}=w.relations||{};
  const seen=new Set([w.word,...synonyms.map(item=>item.word.toLowerCase())]);
  const raw=[...listed,...contrastCandidates(w,getDeck()).slice(0,3)];
  const confusables=[];
  for(const item of raw){
   const word=item.word.toLowerCase();
   if(seen.has(word))continue;
   seen.add(word);
   confusables.push(item);
   if(confusables.length===4)break;
  }
  const meaningLine=item=>'<b>'+esc(item.word)+'</b> · '+esc(item.meaning)+(item.note?'<small>'+esc(item.note)+'</small>':'');
  const sensesHTML=senses.map(sense=>'<div class="synonymSense"><h5>'+esc(sense.label)+'</h5><ul>'
   +sense.items.map(item=>'<li>'+meaningLine(item)+'</li>').join('')+'</ul></div>').join('');
  const synonymHTML=sensesHTML||synonyms.map(item=>'<p>'+meaningLine(item)+'</p>').join('');
  return '<div class="wordRelations">'+(synonymHTML?'<h4>近义词 / 近义表达</h4>'+synonymHTML:'')
   +(confusables.length?'<h4>易混淆词辨析</h4>'+confusables.map(item=>'<p>'+meaningLine(item)+'</p>').join(''):'')
   +(note?'<p class="fine">'+esc(note)+'</p>':'')+'</div>';
 }
 function feedbackHTML(c){const w=wordData(c.word);const pending=c.status==='pending',due=c.reviewDue??getDB().memories[c.word]?.due,title=c.assist?(c.correct?'拼写完成 · 接下来重新三轮':'先看正确拼写，再试一次'):pending?'这个表达待核对':c.checkPassed?'抽查通过 · 保留掌握记录':c.threePassed?'三轮通过 · 明天复测':c.correct?'本轮通过':'本轮未通过 · 回到第一轮';return `<h3>${title}</h3><p><b>${esc(w.word)} · ${esc(w.meaning)}</b>${partOfSpeechHTML(w,esc)}</p>${confusionHTML(c,w,getDeck(),esc)}${pending?`<p>你的原答：${esc(c.userAnswer)}</p><p class="fine">规则未识别这一表述，暂不计对错。对照释义核对；若含义一致，可纠正判分并记住这个同义表达。</p><div class="actions"><button id="acceptMeaning">含义一致，纠正为通过</button><button id="rejectMeaning">含义不对，重新三轮</button></div>`:''}<p>${esc(w.example)}<br>${esc(w.translation)}</p><p>${esc(w.collocation)}</p>${morphologyHTML(w,esc)}${relationHTML(w)}${c.timing?'<p class="fine">本题有效用时 '+(c.timing.activeMs/1000).toFixed(1)+' 秒（不影响对错判定）</p>':''}<p class="fine">${esc(w.source)}${c.assist?' · 这轮用于辅助记忆，不直接计为三轮通过。':pending?'':c.checkPassed?' · 下次到期复习：'+new Date(due).toLocaleDateString('zh-CN',{timeZone:'Asia/Singapore'})+'。提前抽查答对不会推迟原计划。':c.threePassed?' · 首次或重学通过，下一自然日安排复测。':c.correct?' · 稍后继续下一轮。':' · 稍后从第一轮重新出现；没有每日次数上限。'}</p>`;
 }
 function feedback(){
  const c=getDB().session.current,pending=c.status==='pending';
  $('feedback').hidden=false;
  $('feedback').innerHTML=feedbackHTML(c);
  if(pending){$('acceptMeaning').onclick=()=>answer(c.userAnswer,true);$('rejectMeaning').onclick=()=>answer(c.userAnswer,false);}else $('nextCard').hidden=false;$('options').querySelectorAll('button').forEach(b=>{const opt=c.options.find(o=>o.word===b.dataset.word);const meaning=opt?.meaning||wordData(b.dataset.word)?.meaning||opt?.label||'';b.innerHTML='<strong>'+esc(b.dataset.word)+'</strong><small>'+esc(meaning)+'</small>';b.classList.add('bilingual');b.classList.toggle('right',b.dataset.word===c.word);b.classList.toggle('wrong',!c.correct&&b.dataset.word===c.userAnswer);});}
 function finish(){
  const db=getDB(),s=db.session,count=Object.keys(s.passed).length;
  db.rounds??=[];
  db.rounds.push({protocol:3,at:Date.now(),words:s.words,passed:count,attempts:s.attempts,deferred:s.deferred});
  db.session=null;
  save();
  view('roundEnd');
  const more=planTraining(getDeck(),db).words.length>0;
  $('roundEnd').innerHTML=`<h2>本组通过 ${count} / ${s.words.length} 词</h2><p>共作答 ${s.attempts} 次。${s.deferred.length?'暂存 '+s.deferred.length+' 词。':''}</p>${more?'':'<p>目前没有到期词或新词，稍后可回来继续。</p>'}<div class="actions">${more?'<button id="continueGroup" class="primary" aria-keyshortcuts="Enter">继续下一组 ↵</button>':''}${previousCard()?'<button id="previousAtEnd">查看上一词</button>':''}<button id="returnHome">返回今日任务</button></div>`;
  $('returnHome').onclick=()=>view('home');
  if(previousCard())$('previousAtEnd').onclick=openPrevious;
  if(more){
   const nextGroup=$('continueGroup');
   nextGroup.onclick=()=>{start();focusQuestion();};
   nextGroup.focus();
  }else $('returnHome').focus();
  onGroupFinished($('roundEnd'));
 }
 function openPrevious(){
  const c=previousCard();
  if(!c||previousDialog.open)return;
  const choice=c.options?.find(option=>option.word===c.userAnswer);
  const answerText=c.userAnswer==='∅'?'不会':choice?.meaning?
   choice.word+' · '+choice.meaning:c.userAnswer;
  pauseTiming();
  $('previousWordBody').innerHTML='<p><strong>你的答案</strong> · '+esc(answerText)+'</p>'+feedbackHTML(c);
  previousDialog.showModal();
  $('previousWordBody').scrollTop=0;
 }
 $('previousWord').onclick=openPrevious;
 previousDialog.addEventListener('close',()=>{
  const current=getDB().session?.current;
  if(!$('training').hidden&&current){
   activateTiming(current);
   if(current.status==='pending')$('acceptMeaning').focus();
   else if(current.answered)nextCard.focus();
   else focusQuestion();
  }else if(!$('roundEnd').hidden){
   ($('continueGroup')||$('returnHome')).focus();
  }
 });
 $('startRound').onclick=start;$('showSpelling').onclick=()=>{const c=getDB().session?.current;if(c?.assist&&!c.answered){c.hintSeen=true;save();render();}};$('checkSpell').onclick=()=>answer($('spelling').value);$('spelling').oninput=()=>{const c=getDB().session?.current;if(c&&!c.answered){c.userAnswer=$('spelling').value;save();}};

 const nextCard=$('nextCard');
 nextCard.setAttribute('aria-keyshortcuts','Enter');
 nextCard.title='按回车继续';
 document.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.defaultPrevented||event.isComposing||event.keyCode===229||previousDialog.open)return;
  if(!$('roundEnd').hidden&&event.target===$('continueGroup')){
   event.preventDefault();
   if(!event.repeat)$('continueGroup').click();
   return;
  }
  if($('training').hidden)return;
  if(event.target===$('spelling')){
   event.preventDefault();
   if(!event.repeat)answer($('spelling').value);
  }else if(!nextCard.hidden&&(event.target===nextCard||!event.target?.closest?.('button, a, summary, input, select, textarea, [contenteditable]'))){
   event.preventDefault();
   if(!event.repeat)nextCard.click();
  }
 });
 nextCard.onclick=()=>{
  const db=getDB(),current=db.session?.current;
  if(current?.status!=='done')return;
  db.previousCard={...current,reviewDue:db.memories[current.word]?.due};
  db.session.current=null;
  beforeNext();
  save();
  newQuestion();
  focusQuestion();
 };

 function focusQuestion(){
  if($('training').hidden)return;
  if(!$('spellArea').hidden){
   $('spelling').focus();
  }else{
   const question=$('question');
   question.tabIndex=-1;
   question.focus();
  }
 }

 $('forget').onclick=()=>answer('∅');$('deferWord').onclick=()=>{const s=getDB().session;if(!s?.current||s.current.answered)return;s.deferred.push(s.current.word);s.current=null;save();newQuestion();};$('exitRound').onclick=()=>{save();view('home');};$('speak').onclick=()=>{const c=getDB().session?.current;if(!c||!('speechSynthesis' in window)||c.round===2&&!c.answered)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(c.word);u.lang='en-US';u.rate=.8;if(!c.answered){c.audioUsed=true;save();}u.onerror=()=>message('读音暂时不可用，可以先查看拼写再练。');speechSynthesis.speak(u);};
}
