const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'menu.js'), 'utf8');
const controllerSource = source.slice(source.indexOf('function createAssignment('), source.indexOf('function gameAdapter('));
const createAssignment = vm.runInNewContext(controllerSource + '; createAssignment');
const spec = {character:'Miner', map:6, resource:'Copper', resourceName:'Copper', location:'Tunnels Entrance'};

function fixture() {
  let now = 0;
  const state = {character:'Main', map:1, loaded:true, popup:false, drops:0, collecting:true, gathering:false, target:true, canAct:true};
  const calls = [], messages = [];
  const adapter = {
    report:message=>messages.push(message),
    character:()=>state.character, map:()=>state.map, loaded:()=>state.loaded,
    canAct:()=>state.loaded && state.canAct && !state.popup,
    canSwitch:()=>state.loaded && state.canAct && !state.popup,
    preflight:()=>{if(state.drops)throw Error('Collect ground drops first.');},
    switchCharacter:name=>{calls.push(['switch',name]);state.loaded=false;},
    afkOpen:()=>state.popup,
    claimAfk:()=>{calls.push(['claim']);state.popup=false;state.drops=3;},
    collectDrops:()=>{calls.push(['collect']);if(state.collecting)state.drops=0;},
    dropCount:()=>state.drops,
    travel:map=>{calls.push(['travel',map]);state.loaded=false;},
    beginActivity:resource=>{if(!state.target)return false;calls.push(['activity',resource]);return true;},
    activityStarted:()=>state.gathering
  };
  const controller=createAssignment(adapter,()=>now);
  const tick=ms=>{now+=ms || 0;controller.tick();};
  const enterTarget=()=>{controller.start(spec);tick();state.character='Miner';state.loaded=true;state.popup=true;tick();};
  const reachActivity=()=>{
    enterTarget();tick(5000);tick(2000);tick();state.map=6;state.loaded=true;tick();tick(1000);tick();
    assert.equal(controller.current.phase,'activity');
  };
  return {state,calls,messages,controller,tick,enterTarget,reachActivity};
}

test('waits for the character, AFK gains, loot and arrival, then confirms gathering before returning',()=>{
  const f=fixture();f.enterTarget();f.tick(4999);
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,0);
  f.tick(1);assert.equal(f.calls.filter(c=>c[0]==='claim').length,1);
  f.tick(1999);assert.equal(f.calls.filter(c=>c[0]==='travel').length,0);
  f.tick(1);f.tick();f.tick();assert.equal(f.calls.filter(c=>c[0]==='travel').length,1);
  f.state.map=6;f.state.loaded=true;f.tick();f.tick(999);
  assert.equal(f.calls.filter(c=>c[0]==='activity').length,0);
  f.tick(1);f.tick();f.tick(2000);
  assert.equal(f.calls.filter(c=>c[0]==='switch').length,1);
  f.state.gathering=true;f.tick();f.tick(1499);assert.equal(f.calls.filter(c=>c[0]==='switch').length,1);
  f.tick(1);f.tick();f.tick();assert.equal(f.calls.filter(c=>c[0]==='switch').length,2);
  f.state.character='Main';f.state.loaded=true;f.tick();f.tick(5000);f.tick(2000);
  assert.equal(f.controller.current,null);assert.match(f.messages.at(-1),/Returned to Main/);
});

test('uncollected AFK drops prevent travel and timeout leaves the character in place',()=>{
  const f=fixture();f.state.collecting=false;f.enterTarget();f.tick(5000);f.tick(2000);f.tick(44000);
  assert.equal(f.controller.current,null);assert.equal(f.state.character,'Miner');
  assert.equal(f.calls.filter(c=>c[0]==='travel').length,0);assert.match(f.messages.at(-1),/loot/);
});

test('a popup that has not closed is never claimed twice or traveled away from',()=>{
  const f=fixture();f.enterTarget();f.tick(5000);f.state.popup=true;f.tick(10000);f.tick(10000);
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,1);assert.equal(f.calls.filter(c=>c[0]==='travel').length,0);
});

test('activity timeout does not save or switch back prematurely',()=>{
  const f=fixture();f.reachActivity();f.tick(45001);
  assert.equal(f.controller.current,null);assert.equal(f.calls.filter(c=>c[0]==='switch').length,1);
  assert.match(f.messages.at(-1),/activity/);
});

test('manual character changes stop the assignment',()=>{
  const f=fixture();f.enterTarget();f.state.character='Another';f.tick();
  assert.equal(f.controller.current,null);assert.match(f.messages.at(-1),/changed unexpectedly/);
});

test('cancel prevents all subsequent actions',()=>{
  const f=fixture();f.enterTarget();f.controller.cancel();const count=f.calls.length;f.tick(100000);
  assert.equal(f.calls.length,count);assert.equal(f.controller.current,null);
});

test('current-character assignment completes without switching',()=>{
  const f=fixture();f.state.character='Miner';f.reachActivity();f.state.gathering=true;f.tick();f.tick(1500);f.tick();
  assert.equal(f.controller.current,null);assert.equal(f.calls.filter(c=>c[0]==='switch').length,0);
});

test('gathering must stay confirmed for the whole confirmation window',()=>{
  const f=fixture();f.reachActivity();f.state.gathering=true;f.tick();f.tick(1000);f.state.gathering=false;f.tick();
  f.state.gathering=true;f.tick();f.tick(1000);assert.equal(f.controller.current.phase,'activity');
  f.tick(500);assert.equal(f.controller.current.phase,'finish');
});

test('drops on the starting character reject the assignment',()=>{
  const f=fixture();f.state.drops=1;assert.throws(()=>f.controller.start(spec),/Collect ground drops/);
  assert.equal(f.controller.current,null);assert.equal(f.calls.length,0);
});

test('returning character AFK gains and drops are handled before completion',()=>{
  const f=fixture();f.reachActivity();f.state.gathering=true;f.tick();f.tick(1500);f.tick();f.tick();
  f.state.character='Main';f.state.loaded=true;f.state.popup=true;f.tick();f.tick(5000);
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,2);assert.notEqual(f.controller.current,null);
  f.tick(2000);assert.equal(f.controller.current,null);
});

test('gathering stopping before the return leaves the character in place',()=>{
  const f=fixture();f.reachActivity();f.state.gathering=true;f.tick();f.tick(1500);f.state.gathering=false;f.tick();
  assert.equal(f.controller.current,null);assert.equal(f.calls.filter(c=>c[0]==='switch').length,1);
});

const adapterSource=source.slice(source.indexOf('function gameAdapter('),source.indexOf('function mount()'));
function gameFixture() {
  const calls=[], popups=[], ground=[];
  const playerState={_PlayerNode:0,_TargetEnemy:null};
  const targetState={_MonsterType:'Copper',_MonsterID:1,_MonsterNODE:2,_Monster0ffsetX:10};
  const actor=(name,state)=>({dead:false,recycled:false,behaviors:{getBehavior:key=>key===name ? state : null},getX:()=>100,getAnimation:()=> '5'});
  const target=actor('ActorEvents_1',targetState), player=actor('ActorEvents_20',playerState);
  const attrs={UserInfo:['Main'],OtherPlayers:{h:{Main:player}},MapMonstersList:[target],
    OptionsList:Array(19).fill(0),BlockMovement:0,GetPlayersUsernames:['Main','Miner'],
    MonsterDefinitionsGET:{h:{Copper:{h:{AFKtype:'MINING'}}}},
    CustomLists:{h:{MapName:{6:'MininggA'},MapAFKtarget:{6:'Copper'},MapAFKtargetSide:{6:[]}}},
    PlayerMoveMaps:[{h:{Main:1}},{h:{}},{h:{}}],MonsterAlive:[0,1],AFKtarget:'Copper',CurrentMap:6,
    CloudsaveTimer:0,FamilyValuesMap:{h:{}}};
  const context={get:key=>attrs[key],
    a:{engine:{getGameAttribute:key=>attrs[key],setGameAttribute:(key,value)=>{attrs[key]=value;}}},
    c:{getActorType:id=>id,getActorsOfType:id=>id===203?popups:id===44?ground:[],
      isTransitioning:()=>false,getCurrentSceneName:()=> 'MininggA',getIDForScene:()=>1,
      createFadeOut:()=>null,createFadeIn:()=>null,switchScene:id=>calls.push(['scene',id])},
    k:{_customBlock_add_new_player_to_database:name=>{calls.push(['database',name]);return name;},_customBlock_SaveGamee:()=>calls.push(['local-save'])},
    v:{_customBlock_CloudSAVE:()=>calls.push(['cloud-save']),_customBlock_NetworkMove:(...args)=>calls.push(['movement',...args])},
    q:{_customBlock_Teleport:map=>calls.push(['travel',map])},u:{playButton:name=>calls.push(['play',name])},
    Xa:{get:()=>({scenes:{h:{19:{getID:()=>19}}}})}};
  const adapter=vm.runInNewContext(adapterSource+';gameAdapter(()=>{})',context);
  return {adapter,attrs,calls,popups,ground,actor,playerState,target,targetState,context};
}

test('game adapter preserves the native save and character-switch order',()=>{
  const f=gameFixture();f.adapter.preflight(spec);f.adapter.switchCharacter('Miner');
  assert.deepEqual(f.calls,[['database','Main'],['cloud-save'],['local-save'],['play','Miner'],['scene',19]]);
  assert.equal(f.attrs.OptionsList[15],1);assert.equal(f.attrs.FamilyValuesMap.h.SwapPlayerStatus,'Swap');
});

test('game adapter invokes the AFK cache action once while an unclaimed popup exists',()=>{
  const f=gameFixture();let count=0;
  const popup={_ClaimedStatus:0,_customEvent_AutoClaimio(){count++;this._ClaimedStatus=1;},_customEvent_AFKclaim(){}};
  f.popups.push(f.actor('ActorEvents_203',popup));f.adapter.claimAfk();f.adapter.claimAfk();
  assert.equal(count,1);assert.equal(f.adapter.canAct(),false);
});

test('pickup keeps failed or full-bag drops pending and leaves player-dropped items alone',()=>{
  const f=gameFixture();let pickups=0;
  const drop={_CollectedStatus:0,_DropAmount:10,_PlayerDroppedItem:0,_DungItemStatus:0,_customEvent_ItemPickupInTheFirstPlace(){pickups++;}};
  const manual={...drop,_PlayerDroppedItem:1};
  f.ground.push(f.actor('ActorEvents_44',drop),f.actor('ActorEvents_44',manual));
  f.adapter.collectDrops();assert.equal(pickups,1);assert.equal(f.adapter.dropCount(),2);
  drop._CollectedStatus=1;assert.equal(f.adapter.dropCount(),1);
});

test('movement targets the real resource and requires matching animation, state and AFK target',()=>{
  const f=gameFixture();assert.equal(f.adapter.beginActivity('Copper'),true);
  assert.equal(f.playerState._TargetEnemy,f.target);assert.equal(f.attrs.PlayerMoveMaps[2].h.Main,2);
  assert.equal(f.adapter.activityStarted('Copper'),false);
  f.attrs.PlayerMoveMaps[0].h.Main=2;assert.equal(f.adapter.activityStarted('Copper'),true);
  f.attrs.AFKtarget='Iron';assert.equal(f.adapter.activityStarted('Copper'),false);
});

test('a missing resource never starts gathering',()=>{
  const f=gameFixture();assert.equal(f.adapter.beginActivity('Iron'),false);assert.equal(f.calls.length,0);
});

test('menu assignment controls select a character, destination and resource',()=>{
  const f=gameFixture(), elements={}, timers=[];
  function element() {
    return {style:{},hidden:false,disabled:false,value:'',children:[],
      get options(){return this.children;},
      appendChild(child){this.children.push(child);if(!this.value && child.value)this.value=child.value;},
      replaceChildren(){this.children=[];this.value='';},addEventListener(){},focus(){},
      attachShadow(){return {set innerHTML(html){for(const match of html.matchAll(/id="([^"]+)"/g))elements[match[1]]=element();},getElementById:id=>elements[id]};}
    };
  }
  const lists={MapName:[],MapAFKtarget:[],MapAFKtargetSide:[],MapDispName:[]};
  lists.MapName[6]='MininggA';lists.MapAFKtarget[6]='Copper';lists.MapAFKtargetSide[6]=[];lists.MapDispName[6]='Tunnels_Entrance';
  f.attrs.CustomLists.h=lists;f.attrs.QuestComplete={};f.attrs.PixelHelperActor=[];
  f.context.window={addEventListener(){}};
  f.context.document={body:element(),createElement:element};
  f.context.setTimeout=fn=>timers.push(fn);f.context.setInterval=()=>{};
  vm.runInNewContext(source,f.context);timers.shift()();
  elements.mode.value='assign';elements.mode.onchange();
  assert.equal(elements.rows.children.length,1);
  elements.character.value='Miner';elements.rows.children[0].onclick();
  assert.equal(elements.resource.value,'Copper');assert.equal(elements['assignment-choice'].hidden,false);
  elements['start-assignment'].onclick();
  const job=f.context.window.__romNavigation.assignment.current;
  assert.equal(job.spec.character,'Miner');assert.equal(job.spec.resource,'Copper');assert.equal(job.spec.map,6);
  assert.equal(elements.mode.disabled,true);assert.equal(elements.cancel.hidden,false);
});
