
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
import worker from './sync-service/worker/index.js';
import {initProgressSync} from './dist/sync-client.mjs';
import {emptyDB,recordStage,recordSpotCheck,selectThreeWords} from './dist/learning-core.mjs';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync('./sync-service/drizzle/0000_sync.sql','utf8'));
db.exec(readFileSync('./sync-service/drizzle/0002_sync_accounts.sql','utf8'));
const env = {DB: {prepare(query) {
  return {bind(...params) {
    return {first: async () => db.prepare(query).get(...params), run: async () => db.prepare(query).run(...params)};
  }};
}}};
const storageContext=new AsyncLocalStorage();
const current=()=>storageContext.getStore();
Object.defineProperty(globalThis,'localStorage',{value:{
  getItem:(key)=>current().data.get(key)??null,
  setItem:(key,value)=>current().data.set(key,value),
  removeItem:(key)=>current().data.delete(key),
}});
Object.defineProperty(globalThis,'navigator',{value:{get onLine(){return current().online}}});
globalThis.document={hidden:false,addEventListener:(type,fn)=>current().events[type]=fn};
globalThis.window={addEventListener:(type,fn)=>current().events[type]=fn};
globalThis.setInterval=fn=>{current().poll=fn;};
const deviceWords=['require','avoid','listen','translate'];
let conflicts=0;
let writeBarrier=null;
globalThis.fetch=async (url, options) => {
  const device=current();
  assert.equal(device.online,true);
  const request = new Request(url, {...options,headers:{...options.headers,Origin:device.origin}});
  if(writeBarrier && options.method==='PUT' && url.includes('/state/')){
    const release = writeBarrier;
    await new Promise(resolve=>{
      release.push(resolve);
      if(release.length===2){writeBarrier=null;for(const unblock of release)unblock();}
    });
  }
  const response = await worker.fetch(request,env);
  if(response.status===409)conflicts++;
  return response;
};
function client(origin) {
  const d={origin,data:new Map(),db:emptyDB(),online:true,events:{},status:null,canApply:true};
  d.call=fn=>storageContext.run(d,fn);
  d.setup=()=>d.call(()=>initProgressSync({
    getDB:()=>d.db, canApply:()=>d.canApply,
    apply:progress=>Object.assign(d.db,progress), onStatus:status=>{d.status=status;}
  }));
  d.sync=d.setup();
  return d;
}
const desktop=client('https://cet6-study-nov26-parrot.linedsunflower3.chatgpt.site');
const phone=client('https://appassets.androidplatform.net');
const extra=client('https://appassets.androidplatform.net');
const pass=(target,word,at=Date.now())=>{for(const round of [1,2,3])recordStage(target.db,word,round,true,false,at+round);};
pass(desktop,'require',Date.now()-300000);
pass(phone,'avoid',Date.now()-200000);
const code=await desktop.call(()=>desktop.sync.createCode());
assert.equal(code.length,22);
await phone.call(()=>phone.sync.join(code));
await assert.rejects(extra.call(()=>extra.sync.join(code)),/已使用或过期/);
await desktop.call(desktop.events.online);
assert.equal(desktop.db.memories.avoid.stage,3);
assert.equal(phone.db.memories.require.stage,3);
assert.equal(desktop.db.logs.length,6);
assert.equal(phone.db.logs.length,6);
const proof = db.prepare('SELECT sealed FROM sync_rooms').get().sealed;
assert(!proof.includes('require')&&!proof.includes('avoid'));
phone.online=false;
pass(phone,'listen');
await phone.call(phone.events.online);
assert.equal(phone.status.phase,'offline');
pass(desktop,'translate');
phone.online=true;
writeBarrier=[];
await Promise.all([desktop.call(desktop.events.online),phone.call(phone.events.online)]);
await desktop.call(desktop.events.online);
await phone.call(phone.events.online);
assert(conflicts>=1);
for (const d of [desktop,phone]) {
  assert.deepEqual(Object.keys(d.db.memories),['avoid','listen','require','translate']);
  assert.equal(d.db.logs.length,12);
  assert.equal(d.status.phase,'synced');
}
phone.canApply=false;
recordSpotCheck(desktop.db,'require',false,false);
await desktop.call(desktop.events.online);
await phone.call(phone.events.online);
assert.equal(phone.db.memories.require.stage,3);
assert.equal(phone.status.pending,true);
phone.canApply=true;
phone.call(()=>phone.sync.applyPending());
assert.equal(phone.status.phase,'synced');
assert.equal(Boolean(phone.status.pending),false);
assert.equal(phone.db.memories.require.stage,0);
assert(selectThreeWords(deviceWords.map(word=>({word})),phone.db,'due',4).includes('require'));
// The newer deck has a word the older phone cannot train yet.
assert(!deviceWords.includes('obstacle'));
pass(desktop,'obstacle');
await desktop.call(desktop.events.online);
await phone.call(phone.events.online);
assert.equal(phone.status.phase,'synced');
assert.equal(phone.db.memories.obstacle.stage,3);
assert.equal(phone.db.logs.filter(log=>log.word==='obstacle').length,3);
// Reopen the client from saved progress and confirm it can upload new local work.
phone.sync=phone.setup();
await phone.call(phone.events.online);
recordSpotCheck(phone.db,'avoid',true,false);
await phone.call(phone.events.online);
await desktop.call(desktop.events.online);
assert.equal(desktop.db.logs.filter(log=>log.word==='obstacle').length,3);
assert.equal(desktop.db.logs.filter(log=>log.word==='avoid').length,4);
await phone.call(phone.sync.disconnect);
assert.equal(phone.status.phase,'off');
assert.equal(phone.db.logs.length,17);
const cors=await worker.fetch(new Request('https://test/v1/state/'+ 'a'.repeat(32),{method:'OPTIONS',headers:{Origin:phone.origin}}),env);
assert.equal(cors.headers.get('Access-Control-Allow-Origin'),phone.origin);
console.log('PASS: encrypted pairing, single use, offline queue, compare-and-swap retry, both learning histories, safe update after active card and local-data retention');
