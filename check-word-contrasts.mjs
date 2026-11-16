import fs from 'node:fs';
import assert from 'node:assert/strict';
import {mergeWordDecks,normalize} from './dist/learning-core.mjs';
import {attachRelations,harderOptions,contrastCandidates} from './dist/word-contrasts.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const raw=mergeWordDecks(['base-words','paper-words','paper-extra-reading','paper-extra-mixed','paper-writing-translation'].map(x=>read('dist/'+x+'.json')));
const a=read('dist/word-relations-a.json'),b=read('dist/word-relations-b.json'),deck=attachRelations(raw,a,b);
assert.equal(Object.keys(a).length,192);assert.equal(Object.keys(b).length,191);
for(const [i,w] of raw.entries()){assert.ok((i%2?b:a)[w.word],w.word);assert.equal(!!(i%2?a:b)[w.word],false,w.word);}
for(const w of deck){assert.ok(w.relations.synonyms.length,w.word);for(const r of [1,2]){const options=harderOptions(w,deck,r);assert.equal(options.length,4,w.word);assert.equal(new Set(options.map(o=>o.word)).size,4,w.word);assert.equal(options.filter(o=>o.kind==='answer').length,1);assert.equal(options.find(o=>o.kind==='answer').word,w.word);assert.ok(options.every(o=>o.word&&o.meaning&&o.label));const accepted=new Set([...w.aliases,...w.meaning.split(/[；;、，,]/)].map(normalize));for(const o of options.filter(o=>o.kind!=='answer'))assert.equal(o.meaning.split(/[；;、，,]/).map(normalize).some(m=>accepted.has(m)),false,w.word+' vs '+o.word);}}
const likely=deck.find(w=>w.word==='likely'),resource=deck.find(w=>w.word==='resource'),wealthy=deck.find(w=>w.word==='wealthy');
assert.ok(harderOptions(likely,deck,1).some(o=>o.word==='like'&&o.meaning.includes('喜欢')));
assert.ok(harderOptions(resource,deck,2).some(o=>o.word==='source'&&o.meaning.includes('来源')));
assert.ok(harderOptions(wealthy,deck,2).some(o=>o.word==='healthy'));
assert.ok(contrastCandidates(likely,deck).slice(0,3).every(o=>o.kind==='confusable'));
console.log('PASS: all383 relation entries, bilingual option metadata, confusable priority, distinct answer keys, no accepted-meaning distractor, likely/like, resource/source, wealthy/healthy.');
