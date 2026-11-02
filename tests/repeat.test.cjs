const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','menu.js'),'utf8');
const create=vm.runInNewContext(source.slice(source.indexOf('function createRepeatGathering('),source.indexOf('function gameAdapter('))+';createRepeatGathering',{clean:String});
function fixture() {
  let now=0;
  const state={character:'Miner',map:6,target:{},resource:'Copper',name:'Copper',level:10,xp:20,gathering:true,movement:2};
  const calls=[],messages=[];
  let available=true,accepted=true;
  const controller=create({gatheringState:()=>available ? {...state} : null,
    beginActivity:(...args)=>{calls.push(args);return accepted;}},message=>messages.push(message),()=>now);
  return {state,calls,messages,controller,tick:ms=>{now+=ms || 0;controller.tick();},unavailable:()=>available=false,reject:()=>accepted=false};
}
test('only XP gains trigger one interaction with the same node',()=>{
  const f=fixture();f.controller.start();f.tick();assert.equal(f.calls.length,0);
  f.state.xp++;f.tick();f.tick();assert.equal(f.calls.length,1);
  assert.equal(f.calls[0][0],'Copper');assert.equal(f.calls[0][1],f.state.target);
  f.state.xp++;f.tick();assert.equal(f.calls.length,2);
});
test('a level up triggers an interaction even when XP resets',()=>{
  const f=fixture();f.controller.start();f.state.level++;f.state.xp=0;f.tick();
  assert.equal(f.calls.length,1);f.tick();assert.equal(f.calls.length,1);
});
test('an XP decrease rebases without triggering an interaction',()=>{
  const f=fixture();f.controller.start();f.state.xp=1;f.tick();assert.equal(f.calls.length,0);
  f.state.xp=2;f.tick();assert.equal(f.calls.length,1);
});
for(const key of ['character','map','target','resource']) test(key+' changes stop without clicking',()=>{
  const f=fixture();f.controller.start();f.state[key]=key==='target' ? {} : 'changed';f.state.xp++;f.tick();
  assert.equal(f.controller.active,false);assert.equal(f.calls.length,0);
});
test('dialogs or unavailable game data stop the loop',()=>{
  const f=fixture();f.controller.start();f.unavailable();f.tick();assert.equal(f.controller.active,false);
});
test('manual movement and stop disable further interactions',()=>{
  const f=fixture();f.controller.start();f.state.gathering=false;f.tick();assert.equal(f.controller.active,false);
  f.state.gathering=true;f.controller.start();f.controller.stop();f.state.xp++;f.tick();assert.equal(f.calls.length,0);
});
test('our interaction can restart gathering but cannot stay stuck for more than a second',()=>{
  const f=fixture();f.controller.start();f.state.xp++;f.tick();f.state.gathering=false;f.state.movement=1;
  f.tick(50);assert.equal(f.controller.active,true);f.state.gathering=true;f.tick(50);assert.equal(f.controller.active,true);
  f.state.xp++;f.tick();f.state.gathering=false;f.tick(1000);assert.equal(f.controller.active,false);
});
test('movement away during a restart stops the loop',()=>{
  const f=fixture();f.controller.start();f.state.xp++;f.tick();f.state.gathering=false;f.state.movement=0;f.tick();
  assert.equal(f.controller.active,false);
});
test('start requires gathering and failed interactions stop the loop',()=>{
  const f=fixture();f.state.gathering=false;assert.throws(()=>f.controller.start(),/Start mining/);
  f.state.gathering=true;f.controller.start();f.reject();f.state.xp++;f.tick();assert.equal(f.controller.active,false);
});
