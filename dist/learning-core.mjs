export const BASE_KEY='cet6-vocabulary-01-v1';
export const LEARN_KEY='cet6-learning-v2';
export const DAY=86400000;
export const dayKey=(now=Date.now())=>new Date(now).toLocaleDateString('sv-SE',{timeZone:'Asia/Singapore'});
export const normalize=s=>String(s??'').toLowerCase().trim().replace(/^(?:意思是|意思为|表示|意为|中文是)\s*/,'').replace(/\b(?:n|v|adj|adv|vt|vi)\./g,'').replace(/[\s。.!！?？的]+$/g,'').trim();
export function grade(response,word,override){
 if(override==='correct'||override==='wrong')return override;
 if(!response||response.confidence==='unknown'||!response.meaning?.trim())return 'wrong';
 const tokens=String(response.meaning).split(/[，,；;、\/\n]|\s+or\s+/).map(normalize).filter(Boolean);
 const aliases=[...word.aliases,...word.meaning.split(/[；;、，,]/)].map(normalize),wrong=(word.wrongAliases||[]).map(normalize);
 if(tokens.some(t=>wrong.includes(t)))return 'wrong';
 if(tokens.length&&tokens.every(t=>aliases.includes(t)))return 'correct';
 return 'pending';
}
export function gradeBaseline(baseline,deck,overrides={}){
 if(!baseline?.responses)return [];
 return baseline.responses.map(r=>{const word=deck.find(w=>w.word===r.word);return {...r,result:word?grade(r,word,overrides[r.word]):'pending'};});
}
export const emptyDB=()=>({version:3,type:'cet6-learning',memories:{},logs:[],overrides:{},customAliases:{},baselineSignature:'',session:null});
export const newMemory=()=>({attempts:0,correct:0,failures:0,box:0,correctDays:[],due:0,seedWeak:false,manualWeak:false});
export function syncBaseline(db,baseline,deck,now=Date.now()){
 if(baseline?.status!=='submitted')return;
 const signature=JSON.stringify(baseline.responses);
 if(db.baselineSignature===signature)return;
 for(const row of gradeBaseline(baseline,deck,db.overrides)){
  const existing=db.memories[row.word],m=existing||newMemory();
  m.seedWeak=row.result!=='correct'||row.confidence!=='known';m.initialized=true;
  if(!existing||!m.attempts)m.due=m.seedWeak?now:now+3*DAY;
  db.memories[row.word]=m;
 }
 db.baselineSignature=signature;
}
export const isWeak=m=>!!m&&(m.seedWeak||m.manualWeak||(m.failures>0&&m.box<2));
export const isStable=m=>!!m&&m.correctDays.length>=3&&!isWeak(m);
export function recordReview(db,word,correct,uncertain=false,mode='meaning',now=Date.now()){
 const m=db.memories[word]||newMemory(),today=dayKey(now);m.initialized=true;m.attempts++;m.lastReviewed=now;
 if(!correct){m.failures++;m.box=0;m.correctDays=[];m.seedWeak=true;m.due=now;}
 else {m.correct++;if(uncertain){m.seedWeak=true;m.due=now+10*60000;}else{if(!m.correctDays.includes(today)){m.correctDays.push(today);m.box=Math.min(m.box+1,4);}m.box=Math.max(1,m.box);m.due=now+[1,3,7,14][m.box-1]*DAY;if(m.correctDays.length>=2)m.seedWeak=false;}}
 db.memories[word]=m;db.logs.push({word,correct,uncertain,mode,at:now});return m;
}
export function selectWords(deck,db,filter='due',size=10,now=Date.now()){
 let candidates=deck.filter(w=>filter==='paper'?w.source!=='基础摸底':filter==='base'?w.source==='基础摸底':filter==='weak'?isWeak(db.memories[w.word]):true);
 if(filter==='due')candidates=candidates.filter(w=>db.memories[w.word]&&db.memories[w.word].due<=now);
 return candidates.sort((a,b)=>{const am=db.memories[a.word],bm=db.memories[b.word];const priority=m=>!m?2:m.due<=now?(isWeak(m)?0:1):3;return priority(am)-priority(bm)||(am?.due||0)-(bm?.due||0);}).slice(0,size).map(w=>w.word);
}
export function validateBackup(raw,validWords){
 if(raw?.type!=='cet6-learning-backup'||![2,3].includes(raw.version)||raw.learning?.type!=='cet6-learning'||![2,3].includes(raw.learning?.version)||!Array.isArray(raw.learning.logs)||!raw.learning.memories||typeof raw.learning.memories!=='object')throw Error('不是有效的训练备份文件');
 if(raw.learning.logs.length>100000)throw Error('备份记录过多');
 for(const [word,m] of Object.entries(raw.learning.memories)){if(!m||!validWords.includes(word)||!Array.isArray(m.correctDays)||m.correctDays.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))||!Number.isFinite(m.due)||m.due<0||m.due>8640000000000000||!Number.isFinite(m.attempts)||!Number.isFinite(m.box)||m.box<0||m.box>4||m.protocol===3&&(!Number.isInteger(m.stage)||m.stage<0||m.stage>3||!Array.isArray(m.passDays)))throw Error('备份中的词汇或记录格式不正确');}
 if(raw.learning.logs.some(l=>!l||!validWords.includes(l.word)||!Number.isFinite(l.at)||typeof l.correct!=='boolean'))throw Error('备份中的练习记录不正确');
 if(Object.values(raw.learning.memories).some(m=>m.reviewLevel!==undefined&&(!Number.isInteger(m.reviewLevel)||m.reviewLevel<0||m.reviewLevel>5)))throw Error('备份中的复习阶段不正确');
 if(raw.baseline&&(raw.baseline.test!=='cet6-vocabulary-01'||raw.baseline.status!=='submitted'||raw.baseline.responses?.length!==20||raw.baseline.responses.some(r=>!r||!validWords.slice(0,20).includes(r.word)||typeof r.meaning!=='string'||!['known','familiar','unknown'].includes(r.confidence))))throw Error('备份中的摸底答卷不正确');
 return raw;
}
export const nextDayTime=(now=Date.now())=>new Date(dayKey(now)+'T00:00:00+08:00').getTime()+DAY;
export function mergeWordDecks(lists){const map=new Map();for(const item of lists.flat()){const id=item.word.toLowerCase().trim();if(!map.has(id)){map.set(id,{...item,word:id,sources:[item.source]});continue;}const previous=map.get(id);previous.aliases=[...new Set([...previous.aliases,...item.aliases,...item.meaning.split(/[；;、，,]/)])];previous.sources=[...new Set([...previous.sources,item.source])];}return [...map.values()];}
export const REVIEW_INTERVALS=[1,2,4,7,15,30];
export const passedToday=(m,now=Date.now())=>!!m&&m.protocol===3&&(m.lastPassDay===dayKey(now)||m.lastVerifiedDay===dayKey(now))&&m.stage===3&&!m.needsRelearn;
export const previouslyPassed=m=>!!m&&m.passDays?.length>0&&!m.needsRelearn;
export const reviewDueTime=(now,days)=>new Date(dayKey(now)+'T00:00:00+08:00').getTime()+days*DAY;
export function selectPassedWords(deck,db,size=10,random=Math.random,now=Date.now()){
 const pool=deck.filter(w=>previouslyPassed(db.memories[w.word])&&!(db.memories[w.word].cycleDay===dayKey(now)&&db.memories[w.word].stage>0&&db.memories[w.word].stage<3)).map(w=>w.word);
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,size);
}
export function canSpotCheck(m,scope='due',now=Date.now()){return previouslyPassed(m)&&(scope==='check'||m.due<=now)&&!(m.cycleDay===dayKey(now)&&m.stage>0&&m.stage<3);}
export const weakThree=(m,now=Date.now())=>!!m&&(m.manualWeak||!passedToday(m,now)&&(m.seedWeak||m.failures>0));
export function migrateThree(db,now=Date.now()){
 db.version=3;db.customAliases??={};db.overrides??={};db.logs??=[];db.memories??={};
 if(db.session?.protocol!==3)db.session=null;
 for(const m of Object.values(db.memories)){if(m.protocol!==3){Object.assign(m,{protocol:3,stage:0,cycleDay:dayKey(now),passDays:[],lastPassDay:null,due:now});}m.reviewLevel??=0;m.needsRelearn??=Boolean(m.passDays?.length&&m.seedWeak);m.learningMisses??=m.seedWeak?Math.min(2,m.failures||0):0;}
 return db;
}
export function prepareThree(db,word,now=Date.now()){
 const m=db.memories[word]||newMemory();
 if(m.protocol!==3)Object.assign(m,{protocol:3,stage:0,cycleDay:dayKey(now),passDays:[],lastPassDay:null});
 if(m.cycleDay!==dayKey(now)){m.cycleDay=dayKey(now);m.stage=0;}
 m.initialized=true;db.memories[word]=m;return m;
}
export function recordStage(db,word,round,correct,manual=false,now=Date.now()){
 const m=prepareThree(db,word,now);
 if(round!==m.stage+1||round>3)throw Error('轮次已变化，请重新开始当前词');
 m.attempts++;m.lastReviewed=now;
 if(correct){m.correct++;m.stage++;if(m.stage===3){m.lastPassDay=dayKey(now);m.passDays??=[];if(!m.passDays.includes(m.lastPassDay))m.passDays.push(m.lastPassDay);m.correctDays=[...m.passDays];m.seedWeak=false;m.needsRelearn=false;m.learningMisses=0;m.reviewLevel=0;m.lastVerifiedDay=null;m.due=nextDayTime(now);}}
 else{m.failures++;m.learningMisses=(m.learningMisses||0)+1;m.stage=0;m.seedWeak=true;m.needsRelearn=true;m.reviewLevel=0;m.lastVerifiedDay=null;m.due=now;if(m.lastPassDay===dayKey(now))m.lastPassDay=null;}
 db.logs.push({word,round,correct,manual,protocol:3,threePassed:correct&&m.stage===3,at:now});return m;
}
export function recordSpotCheck(db,word,correct,manual=false,now=Date.now()){
 const m=db.memories[word];if(!previouslyPassed(m))throw Error('这个词需要先完成三轮训练');
 const scheduled=m.due<=now;
 m.attempts++;m.lastReviewed=now;m.lastCheckedAt=now;
 if(correct){m.correct++;if(m.due<=now&&m.lastScheduledReviewDay!==dayKey(now)){m.reviewLevel=Math.min((m.reviewLevel||0)+1,REVIEW_INTERVALS.length-1);m.due=reviewDueTime(now,REVIEW_INTERVALS[m.reviewLevel]);m.lastScheduledReviewDay=dayKey(now);}m.stage=3;m.cycleDay=dayKey(now);m.lastVerifiedDay=dayKey(now);m.seedWeak=false;}
 else{m.failures++;m.learningMisses=(m.learningMisses||0)+1;m.stage=0;m.cycleDay=dayKey(now);m.needsRelearn=true;m.seedWeak=true;m.reviewLevel=0;m.lastVerifiedDay=null;m.lastScheduledReviewDay=null;m.lastPassDay=null;m.due=now;}
 db.logs.push({word,correct,manual,protocol:3,check:true,scheduled,reviewLevel:m.reviewLevel,at:now});return m;
}
export function selectThreeWords(deck,db,filter='due',size=10,now=Date.now()){
 let candidates=deck.filter(w=>!passedToday(db.memories[w.word],now));
 candidates=candidates.filter(w=>!previouslyPassed(db.memories[w.word])||db.memories[w.word].due<=now||db.memories[w.word].cycleDay===dayKey(now)&&db.memories[w.word].stage>0&&db.memories[w.word].stage<3);
 if(filter==='base')candidates=candidates.filter(w=>w.source==='基础摸底');
 if(filter==='core')candidates=candidates.filter(w=>w.priority==='core');
 if(filter==='paper')candidates=candidates.filter(w=>w.source!=='基础摸底');
 if(filter==='new')candidates=candidates.filter(w=>!db.memories[w.word]?.attempts);
 if(filter==='weak')candidates=candidates.filter(w=>weakThree(db.memories[w.word],now));
 if(filter==='due')candidates=candidates.filter(w=>db.memories[w.word]&&(db.memories[w.word].due<=now||db.memories[w.word].cycleDay===dayKey(now)&&db.memories[w.word].stage>0));
 const priority=m=>!m?3:m.cycleDay===dayKey(now)&&m.stage>0?0:weakThree(m,now)?1:m.due<=now?2:4;
 return candidates.sort((a,b)=>priority(db.memories[a.word])-priority(db.memories[b.word])||(a.priority==='core'?0:1)-(b.priority==='core'?0:1)||(db.memories[a.word]?.due||0)-(db.memories[b.word]?.due||0)).slice(0,size).map(w=>w.word);
}
export const needsSpellingAid=m=>!!m&&(m.learningMisses||0)>=2&&!passedToday(m);
export const spellingMatches=(answer,word)=>String(answer).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')===word.toLowerCase().trim();
export function recordSpellingAid(db,word,correct,hintSeen=false,now=Date.now()){
 const m=prepareThree(db,word,now);m.attempts++;m.aidAttempts=(m.aidAttempts||0)+1;m.stage=0;m.needsRelearn=true;m.seedWeak=true;m.due=now;
 if(correct){m.aidCorrect=(m.aidCorrect||0)+1;m.learningMisses=0;}else m.learningMisses=Math.max(2,m.learningMisses||0);
 db.logs.push({word,correct,assist:true,mode:'spelling-aid',hintSeen,protocol:3,at:now});return m;
}
