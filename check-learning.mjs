import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DAY,grade,gradeBaseline,emptyDB,syncBaseline,recordReview,isStable,selectWords,validateBackup} from './dist/learning-core.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const deck=[...read('dist/base-words.json'),...read('dist/paper-words.json')];
assert.equal(deck.length,50);assert.equal(new Set(deck.map(w=>w.word)).size,50);
for(const w of deck){assert.ok(w.aliases.length);assert.ok(w.meaning&&w.translation&&w.collocation&&w.source);assert.equal((w.example.match(new RegExp('\\b'+w.word+'\\b','g'))||[]).length,1,w.word);}
assert.equal(grade({meaning:'要求，需要',confidence:'known'},deck[0]),'correct');
assert.equal(grade({meaning:'我不是很确定它的含义',confidence:'familiar'},deck[0]),'pending');
assert.equal(grade({meaning:'像',confidence:'familiar'},deck.find(w=>w.word==='likely')),'wrong');
const db=emptyDB(),now=new Date('2026-11-12T04:00:00Z').getTime();
recordReview(db,'require',true,false,'meaning',now);assert.equal(db.memories.require.due,now+DAY);assert.equal(db.memories.require.box,1);
recordReview(db,'require',true,false,'meaning',now+60000);assert.equal(db.memories.require.box,1);assert.equal(isStable(db.memories.require),false);
recordReview(db,'require',true,false,'context',now+DAY);assert.equal(db.memories.require.box,2);
recordReview(db,'require',true,false,'spelling',now+2*DAY);assert.equal(isStable(db.memories.require),true);
recordReview(db,'require',false,false,'spelling',now+3*DAY);assert.equal(isStable(db.memories.require),false);assert.equal(db.memories.require.due,now+3*DAY);
recordReview(db,'avoid',true,true,'meaning',now);assert.equal(db.memories.avoid.due,now+600000);assert.equal(db.memories.avoid.correctDays.length,0);
assert.ok(selectWords(deck,db,'paper',10,now).every(w=>deck.find(x=>x.word===w).source!=='基础摸底'));
validateBackup({type:'cet6-learning-backup',version:2,learning:db},deck.map(w=>w.word));
if(process.argv[2]){const baseline=read(process.argv[2]),rows=gradeBaseline(baseline,deck);assert.equal(rows.filter(x=>x.result==='correct').length,13);assert.equal(rows.filter(x=>x.result==='wrong').length,7);assert.equal(rows.filter(x=>x.result==='pending').length,0);const b=emptyDB();syncBaseline(b,baseline,deck,now);assert.equal(selectWords(deck,b,'weak',50,now).length,14);assert.equal(selectWords(deck,b,'due',50,now).length,14);console.log('PASS: actual answer 13/20; 7 incorrect/unknown and 7 uncertain-correct words enter review.');}
console.log('PASS: 50-word deck, grading aliases, pending answers, due selection, same-day limits, spaced review, lapse reset and backup validation.');
