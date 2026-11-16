import {DAY,dayKey,passedToday,previouslyPassed,REVIEW_INTERVALS,reviewDueTime} from './learning-core.mjs?v=6';
export function planTraining(deck,db,limit=10,now=Date.now(),random=Math.random){
 const priority=(a,b)=>{const am=db.memories[a.word],bm=db.memories[b.word];return Number(!(am?.needsRelearn||am?.seedWeak))-Number(!(bm?.needsRelearn||bm?.seedWeak))||Number(!am?.slowRecall)-Number(!bm?.slowRecall)||(am?.due||0)-(bm?.due||0)||(a.priority==='core'?0:1)-(b.priority==='core'?0:1);};
 const due=deck.filter(w=>{const m=db.memories[w.word];return m&&!passedToday(m,now)&&(m.needsRelearn||m.due<=now||m.cycleDay===dayKey(now)&&m.stage>0);}).sort(priority);
 const fresh=deck.filter(w=>!db.memories[w.word]?.initialized&&!db.memories[w.word]?.attempts).sort((a,b)=>(a.priority==='core'?0:1)-(b.priority==='core'?0:1));
 const dueIds=new Set(due.map(w=>w.word));
 const randomPool=deck.filter(w=>{const m=db.memories[w.word];return previouslyPassed(m)&&!dueIds.has(w.word)&&now-(m.lastCheckedAt||m.lastReviewed||0)>=30*60000&&!(m.cycleDay===dayKey(now)&&m.stage>0&&m.stage<3);});
 const sample=randomPool.length?randomPool[Math.floor(random()*randomPool.length)]:null;
 const newQuota=due.length?Math.min(3,fresh.length):Math.min(limit-(sample?1:0),fresh.length),oldQuota=Math.max(0,limit-newQuota-(sample?1:0));
 const old=due.slice(0,oldQuota),newWords=fresh.slice(0,newQuota),items=[],checkWords=[];
 while(old.length||newWords.length){if(old.length)items.push(old.shift());if(old.length)items.push(old.shift());if(newWords.length)items.push(newWords.shift());}
 if(sample&&items.length<limit){items.push(sample);checkWords.push(sample.word);}
 const used=new Set(items.map(w=>w.word));
 for(const w of [...due,...fresh]){if(items.length>=limit)break;if(!used.has(w.word)){items.push(w);used.add(w.word);}}
 for(const w of items)if(previouslyPassed(db.memories[w.word])&&db.memories[w.word].due<=now&&!checkWords.includes(w.word))checkWords.push(w.word);
 return {words:items.slice(0,limit).map(w=>w.word),checkWords,newCount:items.filter(w=>fresh.some(n=>n.word===w.word)).length};
}
export function attachAnswerTiming(db,word,timing,round,now=Date.now()){
 const log=db.logs.at(-1),m=db.memories[word];if(!log||log.word!==word||!m)return;
 log.timing={...timing};const usable=timing.reliable&&!timing.interrupted&&!timing.hintUsed&&!timing.audioUsed&&!log.manual&&!log.assist&&timing.activeMs>=500&&timing.activeMs<180000;
 if(!usable)return;
 m.responseTimes??={};const key=log.check?'check':String(round),previous=m.responseTimes[key];m.responseTimes[key]=previous?Math.round(previous*.7+timing.activeMs*.3):timing.activeMs;
 if(round===3||log.check){const threshold=45000+Math.min(word.length,30)*300;m.slowRecall=timing.activeMs>threshold;m.lastRecallMs=timing.activeMs;if(log.correct&&log.check&&log.scheduled&&m.slowRecall){const days=Math.max(1,Math.round(REVIEW_INTERVALS[m.reviewLevel||0]*.7));m.due=Math.min(m.due,reviewDueTime(now,days));log.shortenedReview=true;}}
}
