import {dayKey,gradeWordRecall,passedToday,prepareThree,recordStage,selectThreeWords,normalize,selectPassedWords,canSpotCheck,recordSpotCheck,needsSpellingAid,spellingMatches,recordSpellingAid,markWordEasy,isEasyCoolingDown,reviewDueTime,EASY_REVIEW_DAYS} from './learning-core.mjs?v=31';
import {planTraining,attachAnswerTiming} from './adaptive-training.mjs?v=29';
import {harderOptions,contrastCandidates} from './word-contrasts.mjs?v=10';
import {partOfSpeechHTML,meaningsByPartOfSpeechHTML,morphologyHTML,wordFamilyHTML,spellingAlternative,confusionHTML,confusionComparisonHTML,findMistakenWord} from './feedback-notes.mjs?v=34';
import {initWordQuestions} from './word-questions.mjs?v=28';
import {playAnswerSound,readSoundSettings} from './answer-sounds.mjs?v=34';
import {createWordPronunciation} from './word-pronunciation.mjs?v=38';
import {antonymsFor} from './word-antonyms.mjs?v=39';
const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const aliases=w=>[...w.aliases,...w.meaning.split(/[；;、，,]/)].map(normalize).filter(Boolean);
export const choiceOptions=harderOptions;
const CHOICE_VERSION=3;
export function initThreeUI({$,getDeck,getDB,getOptionPosition=()=>undefined,view,save,message,esc,beforeNext=()=>{},onGroupFinished=()=>{}}){
 const previousDialog=$('previousWordDialog');
 const confusionDialog=$('confusionDialog');
 const questionDialog=$('wordQuestionDialog');
 const openWordQuestion=initWordQuestions($);
 const guessButton=$('markGuess');
 const askCurrent=$('askCurrentWord'), easyButton=$('markEasy');
 const pronunciation=createWordPronunciation();
 let displayedCard;
 const status=$('pronunciationStatus');
 const syllableHint=$('wordSyllables');
 let spokenCard;
 function displaySyllables(card){
  const form=wordData(card?.word)?.syllables;
  const current=getDB().session?.current;
  syllableHint.hidden=!form||current!==card||((card.assist||card.round===2)&&!card.answered);
  const text=syllableHint.hidden?'':form.replaceAll('/',' / ');
  if(syllableHint.lastElementChild?.textContent===text)return;
  syllableHint.replaceChildren();
  if(text){
   const label=document.createElement('span');
   label.textContent='音节记忆';
   const parts=document.createElement('strong');
   parts.lang='en';parts.textContent=text;
   syllableHint.append(label,parts);
  }
 }
 const previousStatus=$('previousPronunciationStatus');
 const optionSpeakerIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3Zm11 .1v5.8a3 3 0 0 0 0-5.8Zm1.2-4v2a5.25 5.25 0 0 1 0 9.8v2a7.2 7.2 0 0 0 0-13.8Z"/></svg>';
 function appendOptionSpeaker(button){
  const word=button.dataset.word;
  const shell=document.createElement('div');
  shell.className='optionWithPronunciation';
  const speaker=document.createElement('button');
  speaker.type='button';
  speaker.className='optionSpeaker';
  speaker.setAttribute('aria-label','播放 '+word+' 的读音');
  speaker.title='播放 '+word+' 的读音';
  speaker.innerHTML=optionSpeakerIcon;
  speaker.onclick=()=>{
   const current=getDB().session?.current;
   if(current?.word===word){speakCard(current,{status,manual:true});return;}
   status.textContent='';
   pronunciation.play(word,{
    onMuted:()=>{status.textContent='词汇读音音量为 0，可在设置里调高。';},
    onFailure:()=>{status.textContent='读音未能播放，请重试。';}
   });
  };
  button.replaceWith(shell);
  shell.append(button,speaker);
 }
 function speakCard(card,{example,status,accent,manual=false}){
  if(!card)return;
  status.textContent='';
  pronunciation.play(card.word,{
   example,accent,
   onPlaying:()=>{
    if(!card.answered&&getDB().session?.current===card){card.audioUsed=true;save();}
   },
   onEnded:()=>{
    if(example||getDB().session?.current!==card)return;
    spokenCard=card;
    displaySyllables(card);
   },
   onMuted:()=>{if(manual)status.textContent='词汇读音音量为 0，可在设置里调高。';},
   onFailure:()=>{status.textContent=example?'例句读音未能播放，请重试。':'单词读音未能播放，请重试或查看拼写。';}
  });
 }
 function playAfterAnswer(card){
  if(readSoundSettings().autoPronounce)speakCard(card,{status});
 }
 for(const [container,statusEl,card] of [
  [$('feedback'),$('exampleStatus'),()=>getDB().session?.current],[$('previousWordBody'),previousStatus,()=>previousCard()]
 ]){
  container.addEventListener('click',event=>{
   const playButton=event.target.closest('[data-play-example]');
   if(!playButton)return;
   const current=card();
   if(current)speakCard(current,{example:wordData(current.word).example,status:statusEl,accent:playButton.dataset.playExample,manual:true});
  });
 }
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
 document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseTiming();pronunciation.stop();}else{const c=getDB().session?.current;if(c)activateTiming(c);}});window.addEventListener('pagehide',()=>{pauseTiming();pronunciation.stop();});window.addEventListener('training-view-change',e=>{if(e.detail!=='training'){pauseTiming();pronunciation.stop();}});
 function newQuestion(){rebase();const db=getDB(),s=db.session;if(!s)return;while(s.queue.length&&(isEasyCoolingDown(db.memories[s.queue[0]])||s.scope!=='check'&&!(s.checkWords||[]).includes(s.queue[0])&&passedToday(db.memories[s.queue[0]])))s.queue.shift();if(!s.queue.length){finish();return;}const word=s.queue.shift(),assist=needsSpellingAid(db.memories[word]),check=!assist&&canSpotCheck(db.memories[word],(s.checkWords||[]).includes(word)?'check':s.scope),m=check?db.memories[word]:prepareThree(db,word),round=assist?0:check?3:m.stage+1,w=wordData(word);if(assist){m.stage=0;m.needsRelearn=true;}s.current={word,round,check,assist,day:dayKey(),shownAt:Date.now(),activeMs:0,activeSince:Date.now(),timingReliable:true,options:round>0&&round<3?choiceOptions(w,getDeck(),round):[],optionsVersion:CHOICE_VERSION,answered:false,status:'open',userAnswer:''};save();render();}
 function start(){const db=getDB();if(db.session){if(db.session.scope!=='auto'){const current=db.session.current,plan=planTraining(getDeck(),db,current?9:10);db.session.scope='auto';db.session.words=[...new Set([...(current?[current.word]:[]),...plan.words])];db.session.queue=[...plan.words.filter(w=>w!==current?.word),...(current?.answered&&current.status==='done'&&!current.threePassed?[current.word]:[])];db.session.checkWords=plan.checkWords;db.session.passed=current?.threePassed?{[current.word]:true}:{};}rebase();if(db.session.current&&!db.session.current.answered&&isEasyCoolingDown(db.memories[db.session.current.word])){db.session.current=null;newQuestion();}else if(db.session.current)render();else newQuestion();return;}const plan=planTraining(getDeck(),db);if(!plan.words.length){message('当前没有到期词或未训练词，稍后会安排抽查；可以先休息，明天再复习。');return;}db.session={protocol:3,day:dayKey(),scope:'auto',size:10,queue:[...plan.words],words:plan.words,checkWords:plan.checkWords,passed:{},attempts:0,startedAt:Date.now(),current:null,deferred:[]};save();message();newQuestion();}

 function render(){view('training');$('previousWord').disabled=!previousCard();const s=getDB().session,c=s.current,w=wordData(c.word);if(displayedCard!==c){pronunciation.stop();status.textContent='';displayedCard=c;spokenCard=undefined;}displaySyllables(spokenCard===c?c:undefined);activateTiming(c);if(!c.answered&&!c.assist&&c.round<3&&c.optionsVersion!==CHOICE_VERSION){c.options=choiceOptions(w,getDeck(),c.round);c.optionsVersion=CHOICE_VERSION;save();}$('roundProgress').textContent=`本组通过 ${Object.keys(s.passed).length}/${s.words.length} 词 · 作答 ${s.attempts} 次`;$('cycleSteps').innerHTML=c.assist?'<span class="current">辅助记忆 · 听音看义拼写</span>':c.check?'<span class="current">通过词抽查 · 中文回忆</span>':[1,2,3].map(n=>`<span class="${n<c.round?'complete':n===c.round?'current':''}">${n<c.round?'✓ ':''}${n}. ${['英选中','中选英','写中文'][n-1]}</span>`).join('');$('questionKind').textContent=c.assist?'SPELLING AID / 辅助记忆，不计通过':c.check?'SPOT CHECK / 已通过词抽查':`ROUND ${c.round} / 3 · ${['英文选中文','中文选英文','独立填写中文意思'][c.round-1]}`;$('question').textContent=c.assist?w.meaning:c.round===2?(w.relations?.promptMeaning||w.meaning):(w.relations?.promptWord||w.word);$('questionHint').textContent=c.assist?'请播放读音，再拼写听到的目标词。词性和例句可以辅助判断。':c.round===3?'写一个常见中文意思；同义表达也可。不查词，先独立回忆。':c.round===2?'根据中文含义，选择对应英文。':'选择这个词的中文意思。';renderSpellingCue(c,w);guessButton.hidden=true;$('options').replaceChildren();$('spellArea').hidden=c.round!==3&&!c.assist;$('spelling').placeholder=c.assist?'输入英文拼写':'输入一个常见中文意思';$('spelling').setAttribute('aria-label',c.assist?'英文辅助拼写':'中文意思');$('checkSpell').textContent=c.assist?'检查拼写':'检查答案';$('showSpelling').hidden=!c.assist||c.answered;$('spellingHint').hidden=!c.assist||!c.hintSeen;$('spellingHint').textContent=c.assist&&c.hintSeen?'正确拼写：'+w.word:'';$('spelling').value=(c.round===3||c.assist)?c.userAnswer:'';$('spelling').disabled=$('checkSpell').disabled=c.answered;$('feedback').hidden=true;$('nextCard').hidden=true;$('trainingActions').hidden=c.answered;$('wordPronunciation').hidden=c.round===2&&!c.answered;askCurrent.hidden=!c.answered;easyButton.hidden=!c.beforeEasy&&(c.easy||c.status==='pending'||c.answered&&(!c.correct||c.checkPassed||c.assist));easyButton.textContent=c.beforeEasy?'撤销简单':'简单';easyButton.setAttribute('aria-pressed',String(Boolean(c.beforeEasy)));easyButton.title=c.beforeEasy?'恢复标记前的状态':'略过剩余轮次，10 天后复测';$('training').classList.toggle('withFeedback',Boolean(c.answered));
  for (const [index, option] of c.options.entries()) {
   const button = document.createElement('button');
   const letter = document.createElement('span');
   letter.className = 'choiceIndex';
   letter.setAttribute('aria-hidden', 'true');
   letter.textContent = String.fromCharCode(65 + index);
   const label = document.createElement('span');
   label.className = 'choiceText';
   label.textContent = option.label;
   button.append(letter, label);
   button.dataset.word = option.word;
   button.disabled = c.answered;
   button.onclick = () => answer(option.word);
   $('options').append(button);
  }
  if (c.answered) feedback();
 }
 function answer(value,decision=null){const db=getDB(),s=db.session,c=s?.current;if(!c||c.answered&&!(c.status==='pending'&&decision!==null))return;if(c.day!==dayKey()){rebase();newQuestion();return;}const w=wordData(c.word);if(decision===null){if((c.round===3||c.assist)&&!value.trim()){message(c.assist?'请拼写英文，或先查看正确拼写。':'请填写词义，或点击“不会，重新训练”。');return;}c.timing=stopTiming(c);c.userAnswer=value;if(value==='∅')decision=false;else if(c.assist)decision=spellingMatches(value,c.word);else if(c.round<3)decision=value===c.word;else{const extra=Array.isArray(db.customAliases[c.word])?db.customAliases[c.word]:[];const result=gradeWordRecall(value,w,extra);if(result==='pending'){c.answered=true;c.status='pending';save();render();playAfterAnswer(c);if(!openConfusion(c,w))$('acceptMeaning').focus({preventScroll:true});return;}decision=result==='correct';}}
  message();const manual=c.status==='pending';if(manual&&decision){db.customAliases[c.word]??=[];const text=c.userAnswer.trim();if(text.length<=100&&!db.customAliases[c.word].includes(text))db.customAliases[c.word].push(text);}
  const m=c.assist?recordSpellingAid(db,c.word,decision,!!c.hintSeen):c.check?recordSpotCheck(db,c.word,decision,manual):recordStage(db,c.word,c.round,decision,manual);
  c.answered=true;c.correct=decision;c.manual=manual;c.status='done';
  if(c.assist&&!decision&&spellingAlternative(c.userAnswer,w)){
   c.relatedAnswer=true;
   db.logs.at(-1).relatedAnswer=true;
  }
  if(!manual){pronunciation.stop();status.textContent='';}
  if(!c.relatedAnswer)playAnswerSound(decision);
  attachAnswerTiming(db,c.word,c.timing||{},c.round);c.threePassed=!c.assist&&decision&&m.stage===3;c.checkPassed=!!c.check&&decision;s.attempts++;if(c.threePassed)s.passed[c.word]=true;else{s.queue.push(c.word);delete s.passed[c.word];}save();render();
  if(!manual)playAfterAnswer(c);
  if(!confusionDialog.open && (manual || c.relatedAnswer || !openConfusion(c,w)))nextCard.focus({preventScroll:true});
 }
 function renderSpellingCue(card,word){
  const context=$('spellingContext');
  context.hidden=true;
  if(!card.assist)return;
  $('question').insertAdjacentHTML('beforeend',partOfSpeechHTML(word,esc));
  const escaped=word.word.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
  const example=word.example?.replace(new RegExp('\\b'+escaped+'\\b','gi'),'_____');
  context.textContent=example||'';
  context.hidden=!example||example===word.example;
 }
 function openConfusion(card,word){
  const other=findMistakenWord(card,word,getDeck());
  if(!other)return false;
  const title=$('confusionTitle'),comparison=$('confusionComparison');
  const confirm=$('confirmConfusion'),dismiss=$('dismissConfusion');
  title.textContent='你想的是不是 '+other.word+'？';
  comparison.hidden=true;
  comparison.innerHTML=confusionComparisonHTML(word,other,getDeck(),esc);
  confirm.hidden=false;
  dismiss.textContent='不是，返回解析';
  confirm.onclick=()=>{
   if(getDB().session?.current===card&&card.status==='pending')answer(card.userAnswer,false);
   title.textContent=word.word+' 和 '+other.word+' 的区别';
   comparison.hidden=false;
   confirm.hidden=true;
   dismiss.textContent='返回解析';
   dismiss.focus();
  };
  confusionDialog.showModal();
  dismiss.focus();
  return true;
 }
 confusionDialog.addEventListener('close',()=>{
  const current=getDB().session?.current;
  if($('training').hidden||!current?.answered)return;
  (current.status==='pending'?$('acceptMeaning'):nextCard).focus({preventScroll:true});
 });
 function relationHTML(w){
  const {synonyms=[],senses=[],confusables:listed=[],note}=w.relations||{};
  const antonyms=antonymsFor(w.word);
  const seen=new Set([w.word,...[...synonyms,...antonyms].map(item=>item.word.toLowerCase())]);
  const raw=[...listed,...contrastCandidates(w,getDeck()).slice(0,3)];
  const confusables=[];
  for(const item of raw){
   const word=item.word.toLowerCase();
   if(seen.has(word))continue;
   seen.add(word);
   confusables.push(item);
   if(confusables.length===4)break;
  }
  const meaningLine=item=>'<b lang="en">'+esc(item.word)+'</b> · '+esc(item.meaning)+(item.note?'<small>'+esc(item.note)+'</small>':'');
  const sensesHTML=senses.map(sense=>'<div class="synonymSense"><h5>'+esc(sense.label)+'</h5><ul>'
   +sense.items.map(item=>'<li>'+meaningLine(item)+'</li>').join('')+'</ul></div>').join('');
  const synonymHTML=sensesHTML||synonyms.map(item=>'<p>'+meaningLine(item)+'</p>').join('');
  return '<div class="wordRelations">'+(synonymHTML?'<section class="synonymNotes"><h4>近义词 / 近义表达</h4>'+synonymHTML+'</section>':'')
   +(antonyms.length?'<section class="antonymNotes"><h4>反义词</h4><div class="synonymSense"><ul>'+antonyms.map(item=>'<li>'+meaningLine(item)+'</li>').join('')+'</ul></div></section>':'')
   +(confusables.length?'<h4>易混淆词辨析</h4>'+confusables.map(item=>'<p>'+meaningLine(item)+'</p>').join(''):'')
   +(note?'<p class="fine">'+esc(note)+'</p>':'')+'</div>';
 }
 function spellingComparisonHTML(alternative,relatedAnswer){
  return '<p><b>你写的是 '+esc(alternative.word)+'</b>'+partOfSpeechHTML(alternative,esc)+' · '+esc(alternative.meaning)+'</p>'+
   (alternative.note?'<p>'+esc(alternative.note)+'</p>':'')+
   (relatedAnswer?'<p class="fine">这次保留练习记录，错词次数不增加。稍后再练目标词。</p>':'');
 }
 function collocationHTML(text){
  const [english,...meaning]=String(text||'').split(' = ');
  if(!meaning.length)return esc(english);
  return '<span lang="en">'+esc(english)+'</span> <span>· '+esc(meaning.join(' = '))+'</span>';
 }
 function feedbackHTML(c){const w=wordData(c.word);const alternative=c.assist&&!c.correct?spellingAlternative(c.userAnswer,w):null;const pending=c.status==='pending',due=c.reviewDue??getDB().memories[c.word]?.due,title=c.easy?'已标记简单 · 10 天后复测':c.assist?(c.correct?'拼写完成 · 接下来重新三轮':alternative?'意思相关 · 再练目标词拼写':'先看目标词拼写，再试一次'):pending?'这个表达待核对':c.checkPassed?'抽查通过 · 保留掌握记录':c.threePassed?'三轮通过 · 明天复测':c.retryGuessedRound?'猜对 · 稍后重测本轮':c.correct?'本轮通过':'本轮未通过 · 回到第一轮';return `<h3>${title}</h3><div class="answerMeaning"><strong lang="en">${esc(w.word)}</strong><div>${meaningsByPartOfSpeechHTML(w,esc)}</div></div>${alternative?spellingComparisonHTML(alternative,c.relatedAnswer):confusionHTML(c,w,getDeck(),esc)}${pending?`<p>你的原答：${esc(c.userAnswer)}</p><p class="fine">规则未识别这一表述，暂不计对错。对照释义核对；若含义一致，可纠正判分并记住这个同义表达。</p><div class="actions"><button id="acceptMeaning">含义一致，纠正为通过</button><button id="rejectMeaning">含义不对，重新三轮</button></div>`:''}<div class="feedbackExample"><p><span lang="en">${esc(w.example)}</span><br>${esc(w.translation)}</p>${w.example?'<div class="accentButtons" role="group" aria-label="例句读音"><button type="button" data-play-example="en-GB" aria-label="播放例句英音">英音</button><button type="button" data-play-example="en-US" aria-label="播放例句美音">美音</button></div>':''}</div><p class="feedbackCollocation">${collocationHTML(w.collocation)}</p>${morphologyHTML(w,esc)}${wordFamilyHTML(w,esc)}${relationHTML(w)}${c.timing?'<p class="fine">本题有效用时 '+(c.timing.activeMs/1000).toFixed(1)+' 秒（不影响对错判定）</p>':''}<p class="fine">${esc(w.source)}${c.easy?' · 下次复测：'+new Date(due).toLocaleDateString('zh-CN',{timeZone:'Asia/Singapore'})+'。到期前不参加随机抽查。':c.assist?' · 这轮用于辅助记忆，不直接计为三轮通过。':pending?'':c.checkPassed?' · 下次到期复习：'+new Date(due).toLocaleDateString('zh-CN',{timeZone:'Asia/Singapore'})+'。提前抽查答对不会推迟原计划。':c.threePassed?' · 首次或重学通过，下一自然日安排复测。':c.retryGuessedRound?' · 本轮稍后再测。':c.correct?' · 稍后继续下一轮。':' · 稍后从第一轮重新出现；没有每日次数上限。'}</p>`;
 }
 function feedback(){
  const c=getDB().session.current,pending=c.status==='pending';
  $('feedback').hidden=false;
  $('feedbackBody').innerHTML=feedbackHTML(c);
  $('exampleStatus').textContent='';
  guessButton.hidden=c.easy||c.assist||![1,2].includes(c.round);
  guessButton.disabled=Boolean(c.guessed&&!c.guessPending);
  guessButton.textContent=c.guessPending?'撤销猜测':c.guessed?'已标记为猜测':'我猜的';
  guessButton.setAttribute('aria-pressed',String(Boolean(c.guessed)));
  if(pending){$('acceptMeaning').onclick=()=>answer(c.userAnswer,true);$('rejectMeaning').onclick=()=>answer(c.userAnswer,false);}else $('nextCard').hidden=false;$('options').querySelectorAll('button[data-word]').forEach(b=>{const opt=c.options.find(o=>o.word===b.dataset.word);const entry=wordData(b.dataset.word);const meaning=opt?.meaning||entry?.meaning||opt?.label||'';b.querySelector('.choiceText').innerHTML='<strong lang="en">'+esc(b.dataset.word)+'</strong><span class="choiceMeanings">'+meaningsByPartOfSpeechHTML(entry?.phrase?{meaning,pos:"phrase"}:entry||{meaning,pos:getOptionPosition(b.dataset.word)},esc)+'</span>';b.classList.add('bilingual');b.classList.toggle('right',b.dataset.word===c.word);b.classList.toggle('wrong',!c.correct&&b.dataset.word===c.userAnswer);if(!b.parentElement.classList.contains('optionWithPronunciation'))appendOptionSpeaker(b);});}
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
 const canRepeatGuessedRound=(card,memory)=>card.correct&&memory?.cycleDay===card.day&&memory.stage===card.round;
 guessButton.onclick=()=>{
  const db=getDB(),c=db.session?.current;
  if(c?.status!=='done'||guessButton.hidden||guessButton.disabled)return;
  if(c.day!==dayKey()){rebase();newQuestion();return;}
  c.guessPending=!c.guessPending;
  c.guessed=c.guessPending;
  c.retryGuessedRound=c.guessPending&&canRepeatGuessedRound(c,db.memories[c.word]);
  save(false);
  feedback();
 };
 easyButton.onclick=()=>{
  const s=getDB().session,c=s?.current;
  if(!c||easyButton.hidden)return;
  if(c.day!==dayKey()){rebase();newQuestion();return;}
  if(c.beforeEasy){
   s.current=c.beforeEasy;
  }else{
   if(!c.answered)stopTiming(c);
   c.beforeEasy={...c};
   if(!c.answered)c.userAnswer='';
   c.easy=true;c.correct=true;c.answered=true;c.status='done';
   c.reviewDue=reviewDueTime(Date.now(),EASY_REVIEW_DAYS);
   c.retryGuessedRound=false;
  }
  save(false);
  render();
 };
 askCurrent.onclick=()=>{
  const card=getDB().session?.current;
  if(card?.answered)openWordQuestion(card,wordData(card.word));
 };
 $('askPreviousWord').onclick=()=>{
  const card=previousCard();
  if(card)openWordQuestion(card,wordData(card.word));
 };
 function openPrevious(){
  const c=previousCard();
  if(!c||previousDialog.open)return;
  const choice=c.options?.find(option=>option.word===c.userAnswer);
  const answerText=c.easy&&!c.userAnswer?'标记简单':c.userAnswer==='∅'?'不会':choice?.meaning?
   choice.word+' · '+choice.meaning:c.userAnswer;
  pauseTiming();
  $('previousWordBody').innerHTML='<p><strong>你的答案</strong> · '+esc(answerText)+'</p>'+feedbackHTML(c);
  previousStatus.textContent='';
  previousDialog.showModal();
  $('previousWordBody').scrollTop=0;
 }
 $('previousWord').onclick=openPrevious;
 previousDialog.addEventListener('close',()=>{
  pronunciation.stop();
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
  if(event.key!=='Enter'||event.defaultPrevented||event.isComposing||event.keyCode===229||previousDialog.open||questionDialog.open)return;
  if(confusionDialog.open){
   if(event.repeat)event.preventDefault();
   return;
  }
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
  if((current.beforeEasy||current.guessPending)&&current.day!==dayKey()){rebase();newQuestion();return;}
  if(current.beforeEasy){
   markWordEasy(db,current.word);
   const s=db.session;
   s.passed[current.word]=true;
   s.queue=s.queue.filter(word=>word!==current.word);
   s.deferred=s.deferred.filter(word=>word!==current.word);
   delete current.beforeEasy;
  }else if(current.guessPending){
   const now=Date.now(),memory=db.memories[current.word];
   db.rounds??=[];
   db.rounds.push({mode:'choice-guess',word:current.word,round:current.round,
    correct:current.correct,answerAt:current.timing?.answeredAt,at:now});
   current.retryGuessedRound=canRepeatGuessedRound(current,memory);
   if(current.retryGuessedRound){
    memory.stage=current.round-1;
    memory.lastReviewed=now;
    memory.due=now;
   }
  }
  delete current.guessPending;
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
   if(matchMedia('(max-width:600px)').matches){window.scrollTo(0,0);question.focus({preventScroll:true});}
   else question.focus();
  }
 }

 $('forget').onclick=()=>answer('∅');$('deferWord').onclick=()=>{const s=getDB().session;if(!s?.current||s.current.answered)return;s.deferred.push(s.current.word);s.current=null;save();newQuestion();};$('exitRound').onclick=()=>{save();view('home');};$('wordPronunciation').addEventListener('click',event=>{
  const button=event.target.closest('[data-word-accent]');
  const c=getDB().session?.current;
  if(!button||!c||(c.round===2&&!c.answered))return;
  speakCard(c,{status,accent:button.dataset.wordAccent,manual:true});
 });
}
