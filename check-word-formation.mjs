import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeWordDecks} from './dist/learning-core.mjs';
import {morphologyHTML,wordFamilyHTML} from './dist/feedback-notes.mjs';

const read=name=>JSON.parse(readFileSync(new URL(`./dist/${name}.json`,import.meta.url),'utf8').replace(/^\uFEFF/,''));
const deck=mergeWordDecks(['base-words','paper-words','paper-extra-reading','paper-extra-mixed','paper-writing-translation'].map(read));
const words=new Set(deck.map(({word})=>word));
const parts=new Map();
for(const name of ['word-parts-roots','word-parts-prefixes','word-phrase-notes']){
 for(const [word,entry] of Object.entries(read(name))){
  if(!words.has(word)) continue;
  assert.ok(!parts.has(word),`duplicate entry: ${word}`);
  assert.ok(entry.parts.length&&entry.parts.every(part=>part.form.trim()&&part.meaning.trim()),word);
  if(name==='word-phrase-notes') assert.ok(entry.examples.length&&entry.examples.every(([phrase,meaning])=>phrase.trim()&&meaning.trim()),word);
  parts.set(word,{[name==='word-phrase-notes'?'phrase':'morphology']:entry});
 }
}
const families=new Map();
for(const family of read('word-families')){
 assert.ok(family.words.length>=2,JSON.stringify(family.words));
 for(const [term,pos,meaning] of family.words){
  assert.ok(term.trim()&&meaning.trim()&&pos.split('/').every(code=>/^(n|v|adj|adv|prep|conj|pron|num|int)$/.test(code)),term);
  assert.ok(!families.has(term),`ambiguous family: ${term}`);
  families.set(term,family);
 }
}
const esc=value=>String(value).replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[char]);
const trainingWord=word=>({word,...parts.get(word),family:families.get(word)});
const independent=['despite']; // No common derivatives to teach alongside this preposition.
for(const word of words){
 const item=trainingWord(word);
 assert.ok(morphologyHTML(item,esc).includes('class="morphNotes"'),`missing construction: ${word}`);
 if(item.phrase){
  assert.match(morphologyHTML(item,esc),/<h4>搭配与用法<\/h4>/,word);
  assert.equal(wordFamilyHTML(item,esc),'',word);
 }else if(!independent.includes(word)){
  assert.ok(wordFamilyHTML(item,esc).includes('class="posLabel"'),`missing family and its POS: ${word}`);
 }
}
assert.match(morphologyHTML(trainingWord('situated'),esc),/situate.*-ed.*situs/s);
assert.match(wordFamilyHTML(trainingWord('situated'),esc),/>situate<.*>situation<.*>situational</s);
assert.match(morphologyHTML(trainingWord('coordinate'),esc),/>co-</);
assert.match(morphologyHTML(trainingWord('unexcused'),esc),/>un-</);
assert.match(wordFamilyHTML(trainingWord('capacity'),esc),/>capability</);
assert.doesNotMatch(morphologyHTML(trainingWord('in part'),esc),/常见前缀/);
console.log(`PASS: word-formation coverage and feedback for ${words.size} vocabulary entries.`);
