import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeWordDecks} from './dist/learning-core.mjs';
import {makeQuizQuestions, restrictQuizQuestion, reviewQuizPlan, singleQuestion, splitEnglish, splitChinese} from './dist/context-quiz.mjs';
const load=file=>JSON.parse(readFileSync('dist/'+file+'.json','utf8'));
const deck=mergeWordDecks(['base-words','paper-words','paper-extra-reading','paper-extra-mixed','paper-writing-translation'].map(load));
const ids=new Set(deck.map(w=>w.word));
const hints={...load('context-hints-a'),...load('context-hints-b')};
const pairs=load('context-combinations');
assert.equal(Object.keys(hints).length,103);
function validate(card){
 const keys=Object.keys(card.answers).sort();
 assert.deepEqual(splitEnglish(card.english).map(x=>x[1].toLowerCase()).sort(),keys,card.english);
 assert.deepEqual(splitChinese(card.chinese).map(x=>x[1]).sort(),keys,card.chinese);
 for(const [word, answers] of Object.entries(card.answers)){
  assert(ids.has(word)&&Array.isArray(answers)&&answers.length>0&&answers.every(x=>x.trim()),word);
 }
}
for(const word of deck)validate(singleQuestion(word,hints));
for(const pair of pairs)validate(pair);
const batch=deck.slice(0,100).map(w=>w.word);
const questions=makeQuizQuestions(batch,deck,hints,pairs);
for(const question of questions)validate(question);
const targets=questions.flatMap(q=>Object.keys(q.answers)).sort();
assert.deepEqual(targets,[...batch].sort());
const first=Date.parse('2026-11-16T08:00:00+08:00'),last=Date.parse('2026-11-17T08:00:00+08:00');
const sourceLogs=batch.flatMap((word,i)=>[{word,at:first+i,correct:true},{word,at:last+i,correct:false},{word,at:last+1000+i,correct:true}]);
const plan=reviewQuizPlan(sourceLogs,[],100,last+2000);
assert.equal(plan.ready,true);assert.deepEqual(plan.words,batch);
assert.deepEqual(plan.targets,batch);
const mixed=sourceLogs.map(row=>row.word!=='avoid'?{...row,correct:true}:row);
assert.deepEqual(reviewQuizPlan(mixed,[],100,last+2000).targets,['avoid']);
assert.equal(reviewQuizPlan(sourceLogs.map(row=>({...row,correct:true})),[],100,last+2000).ready,false);
const firstPair=pairs[0],trimmed=restrictQuizQuestion(firstPair,new Set(['require']));
validate(trimmed);
assert.equal(Object.keys(trimmed.answers).length,1);
assert.match(trimmed.chinese,/提供/);
assert.equal(reviewQuizPlan(sourceLogs,[{mode:'context-quiz',reviews:plan.reviews}],100,last+2000).words.length,0);
assert.equal(reviewQuizPlan(sourceLogs.filter(x=>x.word!=='require'),[],100,last+2000).words.length,99);
console.log('PASS:',deck.length,'single contexts,',pairs.length,'authored multi-target contexts,',questions.length,'questions for 100 sampled words,',questions.filter(q=>Object.keys(q.answers).length>1).length,'multi-target questions.');
