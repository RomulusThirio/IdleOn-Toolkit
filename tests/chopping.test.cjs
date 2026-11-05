const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','menu.js'),'utf8');
const controllerSource=source.slice(source.indexOf('function createChoppingMinigame('),source.indexOf('function gameAdapter('));
const create=vm.runInNewContext(controllerSource+';createChoppingMinigame');
const adapterSource=source.slice(source.indexOf('function gameAdapter('),source.indexOf('function mount('));

function fixture() {
  let now=0;
  const state={active:true,valid:true,position:10,direction:1,speed:2,score:0,result:0,tapCount:0,moving:true,
    targets:[{start:50,end:170,perfect:false}]};
  const calls=[],messages=[];
  const controller=create({choppingState:()=>({...state,targets:state.targets.map(target=>({...target}))}),
    choppingTap:()=>calls.push(state.position)},message=>messages.push(message),()=>now);
  return {state,calls,messages,controller,tick:(ms=0)=>{now+=ms;controller.tick();}};
}

test('start requires an active, unambiguous chopping screen',()=>{
  const f=fixture();f.state.active=false;assert.throws(()=>f.controller.start(),/Open and start/);
  f.state.active=true;f.state.valid=false;assert.throws(()=>f.controller.start(),/ambiguous/);
});

test('waits for the arrow to enter the visible scoring target',()=>{
  const f=fixture();f.controller.start();f.tick();assert.equal(f.calls.length,0);
  f.state.position=50;f.tick();assert.deepEqual(f.calls,[50]);
});

test('prefers the perfect target when one is visible',()=>{
  const f=fixture();f.state.targets=[{start:90,end:100,perfect:true},{start:40,end:170,perfect:false}];
  f.controller.start();f.state.position=50;f.tick();assert.equal(f.calls.length,0);
  f.state.position=95;f.tick();assert.deepEqual(f.calls,[95]);
});

test('does not repeat a tap on the same unchanged frame',()=>{
  const f=fixture();f.state.position=60;f.controller.start();f.tick();f.tick();assert.equal(f.calls.length,1);
  f.state.tapCount++;f.state.position=61;f.tick(50);assert.equal(f.calls.length,2);
});

test('allows the native bar a 50 ms post-hit transition before ambiguity checks',()=>{
  const f=fixture();f.state.position=60;f.controller.start();f.tick();
  f.state.valid=false;f.state.moving=false;f.state.direction=0;f.tick(49);
  assert.equal(f.controller.active,true);assert.equal(f.calls.length,1);
  f.state.valid=true;f.state.moving=true;f.state.direction=1;f.state.tapCount++;f.state.position=20;f.tick(1);
  assert.equal(f.controller.active,true);assert.equal(f.calls.length,1);
});

test('stops without tapping when the screen closes or becomes ambiguous',()=>{
  const f=fixture();f.controller.start();f.state.active=false;f.tick();assert.equal(f.controller.active,false);assert.equal(f.calls.length,0);
  f.state.active=true;f.state.valid=true;f.controller.start();f.state.valid=false;f.tick();assert.equal(f.controller.active,false);assert.equal(f.calls.length,0);
});

test('a native miss stops the helper',()=>{
  const f=fixture();f.controller.start();f.state.result=1;f.tick();assert.equal(f.controller.active,false);assert.match(f.messages.at(-1),/missed tap/);
});

test('game adapter derives exact hit bounds from the rendered chopping model',()=>{
  const bar=[0,1,0,2,50,120,-1,0,-1,0,-1,0,-1,0,0,0,0], info=Array(8).fill(0);
  info[2]=0;info[4]=1;info[7]=bar;
  let taps=0;
  const actor=script=>({dead:false,recycled:false,behaviors:{getBehavior:()=>script}});
  const helper={_GeneralINFO:info,_UIinventoryOn2:[],_customEvent_MinigameTap:()=>taps++};helper._UIinventoryOn2[94]=1;
  const player=actor({});player.getAnimation=()=>6;
  const attrs={MenuType:7,UserInfo:['Main'],OtherPlayers:{h:{Main:player}},PixelHelperActor:[]};
  attrs.PixelHelperActor[1]=actor(helper);
  const context={get:key=>attrs[key],clean:String,q:{_customBlock_AFKgains(){}},c:{getActorsOfType:()=>[],getActorType:value=>value}};
  const gameAdapter=vm.runInNewContext(adapterSource+';gameAdapter',context);
  const adapter=gameAdapter(()=>{}), state=adapter.choppingState();
  assert.equal(state.active,true);assert.equal(state.valid,true);assert.equal(state.position,7);
  assert.deepEqual({...state.targets[0]},{start:53,end:173,perfect:false});
  adapter.choppingTap();assert.equal(taps,1);
});

test('game adapter rejects the same model outside the chopping screen',()=>{
  const actor=script=>({dead:false,recycled:false,behaviors:{getBehavior:()=>script}});
  const helper={_GeneralINFO:Array(8).fill(0),_UIinventoryOn2:[]};helper._UIinventoryOn2[94]=1;
  const player=actor({});player.getAnimation=()=>5;
  const attrs={MenuType:7,UserInfo:['Main'],OtherPlayers:{h:{Main:player}},PixelHelperActor:[]};attrs.PixelHelperActor[1]=actor(helper);
  const context={get:key=>attrs[key],clean:String,q:{_customBlock_AFKgains(){}},c:{getActorsOfType:()=>[],getActorType:value=>value}};
  const gameAdapter=vm.runInNewContext(adapterSource+';gameAdapter',context), adapter=gameAdapter(()=>{});
  assert.equal(adapter.choppingState().active,false);assert.throws(()=>adapter.choppingTap(),/not ready/);
});
