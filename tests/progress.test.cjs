const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','menu.js'),'utf8');
const controllerSource=source.slice(source.indexOf('function createAutoProgress('),source.indexOf('function createChoppingMinigame('));
const create=vm.runInNewContext(controllerSource+';createAutoProgress');
const adapterSource=source.slice(source.indexOf('function gameAdapter('),source.indexOf('function mount('));

function fixture() {
  let now=0,reads=0;
  const state={valid:true,map:6,location:'Tunnels Entrance',destination:7,destinationName:'Freefall Caverns',remaining:3,open:false,atPortal:false,autoCombat:false};
  const calls=[],messages=[];
  const adapter={progressionState:()=>{reads++;return {...state};},moveToNextPortal:s=>calls.push(['move',s.map,s.destination]),enterNextPortal:s=>calls.push(['enter',s.map,s.destination]),enableAutoCombat:s=>calls.push(['auto',s.map])};
  const controller=create(adapter,message=>messages.push(message),()=>now);
  return {state,calls,messages,controller,reads:()=>reads,tick:(ms=0)=>{now+=ms;controller.tick();}};
}

test('waits for the forward portal kill count without turning off',()=>{
  const f=fixture();f.controller.start();f.tick();f.state.remaining=2;f.tick();
  assert.equal(f.controller.active,true);assert.equal(f.calls.length,0);assert.match(f.messages.at(-1),/2 kills remaining/);
});

test('moves normally when unlocked, enters at the portal, then waits one second',()=>{
  const f=fixture();f.controller.start();f.state.remaining=0;f.state.open=true;f.tick();
  assert.deepEqual(f.calls,[['move',6,7]]);f.state.atPortal=true;f.tick();assert.deepEqual(f.calls.at(-1),['enter',6,7]);
  const reads=f.reads();f.state.map=7;f.state.location='Freefall Caverns';f.state.destination=8;f.state.destinationName='The Base of the Bark';f.state.remaining=9;f.state.atPortal=false;f.state.open=false;
  f.tick(999);assert.equal(f.reads(),reads);f.tick(1);assert.equal(f.reads(),reads+1);
  assert.equal(f.controller.active,true);assert.deepEqual(f.calls.at(-1),['auto',7]);assert.match(f.messages.at(-1),/Auto combat on.*9 kills remaining/);
});

test('does not toggle Auto combat when it is already on after arrival',()=>{
  const f=fixture();f.controller.start();f.state.remaining=0;f.state.open=true;f.tick();f.state.atPortal=true;f.tick();
  f.state.map=7;f.state.destination=8;f.state.destinationName='The Base of the Bark';f.state.remaining=4;f.state.open=false;f.state.autoCombat=true;
  f.tick(1000);assert.equal(f.calls.filter(call=>call[0]==='auto').length,0);assert.match(f.messages.at(-1),/4 kills remaining/);
});

test('an unexpected map change is an error',()=>{
  const f=fixture();f.controller.start();f.state.map=99;f.tick();assert.equal(f.controller.active,false);assert.match(f.messages.at(-1),/changed unexpectedly/);
});

test('a completed count with a locked portal stops as an error',()=>{
  const f=fixture();f.controller.start();f.state.remaining=0;f.tick();assert.equal(f.controller.active,false);assert.match(f.messages.at(-1),/still locked/);
});

test('manual stop is the only non-error shutdown',()=>{
  const f=fixture();f.controller.start();f.controller.stop();f.state.remaining=0;f.state.open=true;f.tick();
  assert.equal(f.controller.active,false);assert.equal(f.calls.length,0);assert.match(f.messages.at(-1),/off/);
});

test('game adapter reads portal slot zero and uses ordinary movement state',()=>{
  const names=[];names[6]='MininggA';names[7]='MininggB';const display=[];display[6]='Tunnels_Entrance';display[7]='Freefall_Caverns';
  const transitions=[];transitions[6]=[[5,'Town'],[3,'MininggB']];
  const playerState={_PlayerNode:2,_TargetEnemy:{},_TargetEnemyTEMP:{},_MouseClickX:0};
  const actor=(name,script)=>({dead:false,recycled:false,getX:()=>40,getXCenter:()=>40,getAnimation:()=>0,behaviors:{getBehavior:key=>key===name?script:null}});
  const player=actor('ActorEvents_20',playerState),portal=actor('ActorEvents_47',{_PortalID:0,_isEtcPortal:0});
  const oldAutoImage={},hudState={_UIinventory:[]};hudState._UIinventory[332]=oldAutoImage;const hud=actor('ActorEvents_29',hudState);
  const attrs={CurrentMap:6,UserInfo:['Main'],OtherPlayers:{h:{Main:player}},MapMonstersList:[],OptionsList:Array(19).fill(0),BlockMovement:0,
    CustomLists:{h:{MapName:names,MapDispName:display,SceneTransitions:transitions}},KillsLeft2Advance:[],NodeX:[],NodeY:[],PlayerMoveMaps:[{h:{Main:2}},{h:{Main:0}},{h:{Main:2}}],
    PixelHelperActor:[],QuestComplete:{h:{}},PlayerAutoMoveTOGGLE:0,PortalSelectedArrow:-1};
  attrs.KillsLeft2Advance[6]=[2];attrs.NodeX[2]=40;attrs.NodeX[3]=100;attrs.NodeY[2]=10;attrs.NodeY[3]=10;
  let open=false;const calls=[];
  const get=key=>attrs[key],a={engine:{gameAttributes:{h:attrs},getGameAttribute:get,setGameAttribute:(key,value)=>attrs[key]=value}};
  const context={get,a,clean:value=>String(value).replace(/_/g,' '),m:{_customBlock_Language:()=>-1,_customBlock_Windwalker:(kind,map,slot)=>kind==='CanWeEnterPortal'&&map===6&&slot===0&&open?1:0},
    k:{_customBlock_addImgInst:name=>({name})},q:{_customBlock_AFKgains(){}},v:{_customBlock_NetworkMove:(...args)=>calls.push(args)},
    c:{getActorType:value=>value,getActorsOfType:type=>type===47?[portal]:type===29?[hud]:[],isTransitioning:()=>false,getCurrentSceneName:()=> 'MininggA',
      removeImage:image=>calls.push(['remove',image]),attachImageToActor:(image,target,x,y,scale)=>calls.push(['attach',image,target,x,y,scale])}};
  const gameAdapter=vm.runInNewContext(adapterSource+';gameAdapter',context),adapter=gameAdapter(()=>{});
  let state=adapter.progressionState();assert.equal(state.valid,true);assert.equal(state.remaining,2);assert.equal(state.destination,7);assert.equal(state.open,false);assert.equal(state.autoCombat,false);
  adapter.enableAutoCombat(state);assert.equal(attrs.PlayerAutoMoveTOGGLE,1);assert.deepEqual(hudState._UIinventory[332],{name:'UIbuttons6.png'});
  assert.deepEqual(calls.slice(0,2).map(call=>call[0]),['remove','attach']);
  attrs.KillsLeft2Advance[6][0]=0;open=true;state=adapter.progressionState();adapter.moveToNextPortal(state);
  assert.equal(attrs.PlayerMoveMaps[2].h.Main,3);assert.equal(playerState._MouseClickX,100);assert.equal(calls.filter(call=>typeof call[0]==='number').length,1);
  player.getXCenter=()=>100;playerState._PlayerNode=3;state=adapter.progressionState();assert.equal(state.atPortal,true);
  adapter.enterNextPortal(state);assert.equal(attrs.PlayerMoveMaps[0].h.Main,5);assert.equal(attrs.BlockMovement,.5);
});
