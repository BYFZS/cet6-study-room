import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimateVocabulary, gradeMeaning, verifyVocabBank} from './dist/vocab-size-core.mjs';

const bank = verifyVocabBank(['low','mid-a','mid-b','high'].flatMap(name =>
  JSON.parse(readFileSync('dist/vocab-size-'+name+'.json','utf8'))));
const known = count => Object.fromEntries(bank.slice(0,count).map(item =>
  [item.word, {text:item.answers[0]}]));

assert.equal(bank.length,160);
const beginner = estimateVocabulary(bank,known(18));
assert.equal(beginner.estimate,900);
assert(beginner.lower < 900 && beginner.upper > 900);
assert.equal(estimateVocabulary(bank,known(40)).estimate,2000);
assert.equal(estimateVocabulary(bank,known(160)).atCeiling,true);
assert.equal(estimateVocabulary(bank,known(160)).upper,8000);
assert.equal(estimateVocabulary(bank).lower,0);
const pending = {...known(18), [bank[18].word]:{text:'换一种方式解释'}};
const review = estimateVocabulary(bank,pending);
assert.equal(review.pending,1);
assert.equal(estimateVocabulary(bank,pending,{[bank[18].word]:'correct'}).pending,0);
assert.equal(gradeMeaning({text:'中国的'},['中国']), 'correct');
assert.equal(gradeMeaning({text:'不知道'},['纪念']), 'wrong');
assert.equal(gradeMeaning({text:'纪念，怀念'},['纪念','怀念']), 'correct');
assert.equal(gradeMeaning({text:'把某事记在心里'},['纪念']), 'pending');
assert.equal(gradeMeaning({text:'纪念',unknown:true},['纪念']), 'wrong');
assert.throws(()=>verifyVocabBank([...bank.slice(0,159),bank[0]]));
console.log('PASS: 160 source-ranked items, eight complete strata, estimation and review.');
