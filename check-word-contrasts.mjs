import fs from 'node:fs';
import assert from 'node:assert/strict';
import {mergeWordDecks,normalize} from './dist/learning-core.mjs';
import {attachRelations,attachSynonymSenses,harderOptions,contrastCandidates} from './dist/word-contrasts.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const raw=mergeWordDecks(['base-words','paper-words','paper-extra-reading','paper-extra-mixed','paper-writing-translation'].map(x=>read('dist/'+x+'.json')));
const a=read('dist/word-relations-a.json'),b=read('dist/word-relations-b.json');
const banks=['priority','general','usage'].map(name=>read('dist/synonym-senses-'+name+'.json'));
const deck=attachSynonymSenses(attachRelations(raw,a,b),...banks);
const grouped=banks.flatMap(Object.entries);
assert.equal(new Set(grouped.map(([word])=>word)).size,grouped.length);
const wordIds=new Set(deck.map(word=>word.word));
for(const [word,senses] of grouped){
 assert.ok(wordIds.has(word)&&senses.length>0,word);
 for(const {label,items} of senses){
  assert.ok(label.trim()&&items.length>=2&&items.length<=3,word);
  assert.equal(new Set(items.map(item=>item.word.toLowerCase())).size,items.length,word);
  assert.ok(items.every(item=>item.word.trim()&&item.meaning.trim()&&item.word.toLowerCase()!==word),word);
 }
}
assert.equal(grouped.length,141);
assert.equal(deck.find(word=>word.word==='account').relations.senses.length,4);
for(const word of deck){
 const synonyms=new Set(word.relations.synonyms.map(item=>item.word.toLowerCase()));
 assert.ok(harderOptions(word,deck,2).every(item=>item.kind==='answer'||!synonyms.has(item.word.toLowerCase())),word.word);
}
assert.equal(Object.keys(a).length,Math.ceil(raw.length/2));assert.equal(Object.keys(b).length,Math.floor(raw.length/2));
for(const [i,w] of raw.entries()){assert.ok((i%2?b:a)[w.word],w.word);assert.equal(!!(i%2?a:b)[w.word],false,w.word);}
for(const w of deck){assert.ok(w.relations.synonyms.length,w.word);for(const r of [1,2]){const options=harderOptions(w,deck,r);assert.equal(options.length,4,w.word);assert.equal(new Set(options.map(o=>o.word)).size,4,w.word);assert.equal(options.filter(o=>o.kind==='answer').length,1);assert.equal(options.find(o=>o.kind==='answer').word,w.word);assert.ok(options.every(o=>o.word&&o.meaning&&o.label));const accepted=new Set([...w.aliases,...w.meaning.split(/[；;、，,]/)].map(normalize));for(const o of options.filter(o=>o.kind!=='answer'))assert.equal(o.meaning.split(/[；;、，,]/).map(normalize).some(m=>accepted.has(m)),false,w.word+' vs '+o.word);}}
const likely=deck.find(w=>w.word==='likely'),resource=deck.find(w=>w.word==='resource'),wealthy=deck.find(w=>w.word==='wealthy');
assert.ok(harderOptions(likely,deck,1).some(o=>o.word==='like'&&o.meaning.includes('喜欢')));
assert.ok(harderOptions(resource,deck,2).some(o=>o.word==='source'&&o.meaning.includes('来源')));
assert.ok(harderOptions(wealthy,deck,2).some(o=>o.word==='healthy'));
assert.ok(contrastCandidates(likely,deck).slice(0,3).every(o=>o.kind==='confusable'));
console.log(`PASS: ${raw.length} relation entries, 141 grouped synonym entries, no synonyms as distractors, bilingual options and confusable priority.`);
