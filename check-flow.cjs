const fs=require('fs'),vm=require('vm'),assert=require('assert');
const store=new Map(),nodes=new Map();
function el(){return {hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){}},append(){},replaceChildren(){},setAttribute(){},addEventListener(){},querySelector(){return el()},querySelectorAll(){return []},getBoundingClientRect(){return {left:0,top:0,width:1000}},showModal(){this.open=true},close(){this.open=false}}}
const document={getElementById:k=>{if(!nodes.has(k))nodes.set(k,el());return nodes.get(k)},createElement:el,createElementNS:el,querySelectorAll:()=>[],addEventListener(){}};
class Audio{constructor(){this.duration=1557.92;this.paused=true}pause(){this.paused=true}play(){this.paused=false;return Promise.resolve()}}
const context=vm.createContext({console,document,Audio,Blob,URL,Date,Math,JSON,Promise,setTimeout:()=>0,clearTimeout(){},setInterval(){},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},window:{addEventListener(){},open(){}},pdfjs:{GlobalWorkerOptions:{}}});
let code=fs.readFileSync('dist/app.js','utf8').replace(/^\uFEFF?import[^\n]*\n/,'').replace(/loadResources\(\);\s*$/,'');
vm.runInContext(code,context);
vm.runInContext(`
 if(answers.length!==55)throw Error('Key length');
 state.status='active';state.startedAt=Date.now();state.stageStartedAt=Date.now();state.stage=0;state.writing='Original essay';state.deadline=Date.now()+60000;
 save();if(JSON.parse(localStorage.getItem(KEY)).writing!=='Original essay')throw Error('Autosave');
 const oldDeadline=state.deadline;tick();if(state.deadline!==oldDeadline)throw Error('Timer reset');
 advance(false);if(state.stage!==1||state.stageLog.length!==1)throw Error('Writing lock');
 state.answers[1]='C';state.guesses[1]=true;state.audioEnded=true;advance(false);if(state.stage!==2||state.answers[1]!=='C')throw Error('Listening lock');
 advance(true);if(state.stage!==3||!state.stageLog[2].expired)throw Error('Timeout transition');
 state.translation='Original translation';advance(false);if(state.status!=='submitted'||state.stageLog.length!==4)throw Error('Submit');
 if(!document.getElementById('results').innerHTML.includes('1 / 55'))throw Error('Score');
 if(!document.getElementById('results').innerHTML.includes('完整答案详解'))throw Error('Review gate');
`,context);
const saved=JSON.parse(store.values().next().value);assert.equal(saved.status,'submitted');assert.equal(saved.writing,'Original essay');assert.equal(saved.translation,'Original translation');
console.log('PASS: key count, autosave, persistent deadline, section locking, timeout, final submission, objective score and review.');
