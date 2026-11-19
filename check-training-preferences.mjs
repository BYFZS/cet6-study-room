import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {mergeWordDecks} from './dist/learning-core.mjs';
import {attachRelations,attachSynonymSenses,harderOptions} from './dist/word-contrasts.mjs';
import {pronunciationFilename} from './dist/word-pronunciation.mjs';
import {meaningsByPartOfSpeechHTML} from './dist/feedback-notes.mjs';
import {filterMistakes} from './dist/mistake-filters.mjs';

const read = name => JSON.parse(readFileSync(new URL('./dist/'+name+'.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const deck = mergeWordDecks(['base-words','paper-words','paper-extra-reading','paper-extra-mixed','paper-writing-translation'].map(read));
const filenames = deck.map(({word})=>pronunciationFilename(word)).sort();
assert.equal(new Set(filenames).size,deck.length,'Pronunciation filenames should be unique');
for (const accent of ['en-US','en-GB']) {
 for(const dir of ['pronunciation','example-audio']){
  const folder = new URL('./dist/'+dir+'/'+accent+'/',import.meta.url);
  assert.deepEqual(readdirSync(folder).filter(name=>name.endsWith('.mp3')).sort(),filenames);
  for(const path of filenames) assert.ok(statSync(new URL(path,folder)).size>1000,accent+'/'+path);
 }
}

const glosses = read('word-pos-glosses');
const positions = {...read('word-pos-a'),...read('word-pos-b')};
const optionPositions = {...read('distractor-pos'),...Object.fromEntries(read('word-families').flatMap(group=>group.words.map(([word,pos])=>[word,pos]))),...positions};
const related = attachSynonymSenses(
 attachRelations(deck,read('word-relations-a'),read('word-relations-b')),
 ...['priority','general','usage'].map(name=>read('synonym-senses-'+name))
);
const phrases = read('word-phrase-notes');
for(const {word,pos} of deck.map(w=>({...w,pos:positions[w.word]}))){
 if(pos?.includes('/')) assert.deepEqual(Object.keys(glosses[word]||{}).sort(),pos.split('/').sort(),word);
}
for(const word of related){
 for(const option of harderOptions(word,related,2)) assert.ok(optionPositions[option.word] || phrases[option.word],word.word+' → '+option.word);
}
assert.match(meaningsByPartOfSpeechHTML({pos:'adj/n',posGlosses:glosses.potential},s=>s),/形容词.*潜在的.*名词.*潜力/s);

const items = [{word:'benefit',pos:'n/v'},{word:'show up',phrase:{}},{word:'capacity',pos:'n'}];
const misses = new Map([['benefit',{count:2,latest:2}],['show up',{count:4,latest:8}],['capacity',{count:3,latest:4}]]);
assert.deepEqual(filterMistakes(items,misses,'v','most').map(w=>w.word),['benefit']);
assert.deepEqual(filterMistakes(items,misses,'phrase','newest').map(w=>w.word),['show up']);
assert.deepEqual(filterMistakes(items,misses,'n','oldest').map(w=>w.word),['benefit','capacity']);
console.log('PASS: both accents cover all training words and examples, parts of speech and mistakes filters.');
