const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'menu.js'), 'utf8');
const accessSource = source.slice(source.indexOf('function availableMaps('), source.indexOf('function createAssignment('));
const controllerSource = source.slice(source.indexOf('function createAssignment('), source.indexOf('function gameAdapter('));
const createAssignment = vm.runInNewContext(controllerSource + '; createAssignment');
const spec = {character:'Miner', map:6, resource:'Copper', resourceName:'Copper', location:'Tunnels Entrance'};

function fixture() {
  let now=0;
  const state={character:'Main',map:1,loaded:true,afkReady:true,popup:false,drops:0,collecting:true,gathering:false,target:true,canAct:true,position:0};
  const calls=[],messages=[];
  const adapter={
    report:message=>messages.push(message),character:()=>state.character,map:()=>state.map,loaded:()=>state.loaded,
    afkReady:()=>state.afkReady,afkMenuSeen:()=>!!state.menuSeen,canAct:()=>state.loaded && state.canAct && !state.popup,
    canSwitch:()=>state.loaded && state.canAct && !state.popup,
    preflight:()=>{if(state.drops)throw Error('Collect ground drops first.');},
    switchCharacter:name=>{calls.push(['switch',name]);state.loaded=false;state.afkReady=false;},
    afkOpen:()=>state.popup,
    progress:phase=>phase==='activity' ? String(state.position) : JSON.stringify([state.character,state.map,state.loaded,state.afkReady,state.popup,state.drops,state.canAct]),
    claimAfk:()=>{calls.push(['claim']);state.popup=false;state.drops=3;},
    collectDrops:()=>{calls.push(['collect']);if(state.collecting)state.drops=0;},dropCount:()=>state.drops,
    travel:map=>{calls.push(['travel',map]);state.loaded=false;},
    beginActivity:resource=>{if(!state.target)return false;calls.push(['activity',resource]);return true;},
    activityStarted:()=>state.gathering
  };
  const controller=createAssignment(adapter,()=>now);
  const tick=ms=>{now+=ms || 0;controller.tick();};
  const enterTarget=()=>{controller.start(spec);tick();state.character='Miner';state.loaded=true;state.afkReady=true;state.popup=true;tick();};
  const reachActivity=()=>{
    enterTarget();tick();tick();tick(2000);tick();state.map=6;state.loaded=true;tick();tick();tick();
    assert.equal(controller.current.phase,'activity');
  };
  return {state,calls,messages,controller,tick,enterTarget,reachActivity};
}

test('readiness checks advance immediately except for the AFK drop settling pause',()=>{
  const f=fixture();f.reachActivity();
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='travel').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='switch').length,1);
  f.state.gathering=true;f.tick();f.tick();f.tick();
  assert.equal(f.calls.filter(c=>c[0]==='switch').length,2);
  f.state.character='Main';f.state.loaded=true;f.state.afkReady=true;
  f.tick();f.tick();f.tick();
  assert.equal(f.controller.current,null);assert.match(f.messages.at(-1),/Returned to Main/);
});

test('waits for native AFK processing even when the character has loaded',()=>{
  const f=fixture();f.enterTarget();f.state.afkReady=false;f.tick(9000);
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,0);
  f.state.afkReady=true;f.tick();assert.equal(f.calls.filter(c=>c[0]==='claim').length,1);
});

test('new gathering drops between the finish check and return are collected before switching',()=>{
  const f=fixture();f.reachActivity();f.state.gathering=true;f.tick();f.tick();
  assert.equal(f.controller.current.phase,'switch');
  f.state.drops=1;f.tick();
  assert.equal(f.state.drops,0);
  assert.deepEqual(f.calls.at(-1),['switch','Main']);
});

test('uncollectible drops at the return switch wait and time out without leaving',()=>{
  const f=fixture();f.reachActivity();f.state.gathering=true;f.tick();f.tick();
  f.state.collecting=false;f.state.drops=1;f.tick();
  assert.equal(f.controller.current.issued,false);
  assert.equal(f.calls.filter(call=>call[0]==='switch').length,1);
  f.tick(10000);assert.equal(f.controller.current,null);
  assert.match(f.messages.at(-1),/No progress for 10 seconds during switch/);
});

test('a deferred native switch is retried instead of being marked issued',()=>{
  let attempts=0;
  // Simulate a new drop detected by the final native guard.
  const adapter=createAssignment({report(){},preflight(){},character:()=> 'Main',canSwitch:()=>true,
    switchCharacter(){attempts++;return false;},loaded:()=>true},()=>0);
  adapter.start(spec);adapter.tick();adapter.tick();
  assert.equal(attempts,2);assert.equal(adapter.current.issued,false);
});

test('uncollected AFK drops block travel and stop after ten seconds without progress',()=>{
  const f=fixture();f.state.collecting=false;f.enterTarget();f.tick();f.tick();f.tick(9999);
  assert.notEqual(f.controller.current,null);f.tick(1);
  assert.equal(f.controller.current,null);assert.equal(f.calls.filter(c=>c[0]==='travel').length,0);
  assert.match(f.messages.at(-1),/No progress for 10 seconds during loot/);
});

test('a popup that has not closed is never claimed twice or traveled away from',()=>{
  const f=fixture();f.enterTarget();f.tick();f.state.popup=true;f.tick(4000);f.tick(4000);
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,1);assert.equal(f.calls.filter(c=>c[0]==='travel').length,0);
});

test('a popup arriving during loot checks is claimed before travel',()=>{
  const f=fixture();f.enterTarget();f.state.popup=false;f.tick();f.state.popup=true;f.tick();
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,1);assert.equal(f.calls.filter(c=>c[0]==='travel').length,0);
});

test('a stationary character times out rather than switching back without gathering',()=>{
  const f=fixture();f.reachActivity();f.tick();f.tick(10000);
  assert.equal(f.controller.current,null);assert.equal(f.calls.filter(c=>c[0]==='switch').length,1);
  assert.match(f.messages.at(-1),/No progress for 10 seconds during activity/);
});

test('movement keeps the job alive, then ten stalled seconds stop it',()=>{
  const f=fixture();f.reachActivity();f.tick();
  for(let i=0;i<4;i++){f.state.position+=10;f.tick(4000);}
  assert.equal(f.controller.current.phase,'activity');f.tick(9999);assert.notEqual(f.controller.current,null);
  f.tick(1);assert.equal(f.controller.current,null);
});

test('manual character changes stop the assignment',()=>{
  const f=fixture();f.enterTarget();f.state.character='Another';f.tick();
  assert.equal(f.controller.current,null);assert.match(f.messages.at(-1),/changed unexpectedly/);
});

test('cancel prevents subsequent actions',()=>{
  const f=fixture();f.enterTarget();f.controller.cancel();const count=f.calls.length;f.tick(100000);
  assert.equal(f.calls.length,count);assert.equal(f.controller.current,null);
});

test('current-character assignment completes without switching',()=>{
  const f=fixture();f.state.character='Miner';f.reachActivity();f.state.gathering=true;f.tick();f.tick();
  assert.equal(f.controller.current,null);assert.equal(f.calls.filter(c=>c[0]==='switch').length,0);
});

test('drops on the starting character reject the assignment',()=>{
  const f=fixture();f.state.drops=1;assert.throws(()=>f.controller.start(spec),/Collect ground drops/);
  assert.equal(f.controller.current,null);assert.equal(f.calls.length,0);
});

test('returning character AFK gains and drops are handled before completion',()=>{
  const f=fixture();f.reachActivity();f.state.gathering=true;f.tick();f.tick();f.tick();
  f.state.character='Main';f.state.loaded=true;f.state.popup=true;f.tick();f.tick();
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,1);
  f.state.afkReady=true;f.tick();assert.equal(f.calls.filter(c=>c[0]==='claim').length,2);
  f.tick();f.tick(2000);assert.equal(f.controller.current,null);
});

test('no loot check runs before two seconds after the AFK menu closes',()=>{
  const f=fixture();f.enterTarget();f.tick();f.tick();
  const collects=()=>f.calls.filter(c=>c[0]==='collect').length;
  assert.equal(collects(),0);f.tick(1999);assert.equal(collects(),0);
  assert.equal(f.calls.filter(c=>c[0]==='travel').length,0);
  f.tick(1);assert.equal(collects(),1);assert.equal(f.controller.current.phase,'travel');
});

test('the pause begins after closure rather than when claim is clicked',()=>{
  const f=fixture();f.enterTarget();f.tick();f.state.popup=true;f.tick(5000);
  f.state.popup=false;f.tick();f.tick(1999);
  assert.equal(f.calls.filter(c=>c[0]==='collect').length,0);
  f.tick(1);assert.equal(f.calls.filter(c=>c[0]==='collect').length,1);
});

test('drops appearing during the pause are collected before travel',()=>{
  const f=fixture();f.enterTarget();f.tick();f.state.drops=0;f.tick();
  f.tick(1000);f.state.drops=4;f.tick(999);
  assert.equal(f.state.drops,4);f.tick(1);assert.equal(f.state.drops,0);
  assert.equal(f.controller.current.phase,'travel');
});

test('a reopened menu restarts the settling pause without claiming twice',()=>{
  const f=fixture();f.enterTarget();f.tick();f.tick();f.tick(1500);
  f.state.popup=true;f.tick();f.state.popup=false;f.tick();f.tick(1999);
  assert.equal(f.calls.filter(c=>c[0]==='collect').length,0);
  f.tick(1);assert.equal(f.calls.filter(c=>c[0]==='collect').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='claim').length,1);
});

test('no popup means no additional settling pause',()=>{
  const f=fixture();f.enterTarget();f.state.popup=false;f.tick();f.tick();
  assert.equal(f.controller.current.phase,'travel');
});

test('an automatically closed AFK menu still gets the settling pause',()=>{
  const f=fixture();f.enterTarget();f.state.popup=false;f.state.menuSeen=true;f.tick();f.tick();
  f.tick(1999);assert.equal(f.calls.filter(c=>c[0]==='collect').length,0);
  f.tick(1);assert.equal(f.controller.current.phase,'travel');
});

test('gathering stopping before the return leaves the character in place',()=>{
  const f=fixture();f.reachActivity();f.state.gathering=true;f.tick();f.state.gathering=false;f.tick();
  assert.equal(f.controller.current,null);assert.equal(f.calls.filter(c=>c[0]==='switch').length,1);
});

const adapterSource=source.slice(source.indexOf('function gameAdapter('),source.indexOf('function mount()'));
function gameFixture() {
  const calls=[], popups=[], ground=[];
  const playerState={_PlayerNode:0,_TargetEnemy:null};
  const targetState={_MonsterType:'Copper',_MonsterID:1,_MonsterNODE:2,_Monster0ffsetX:10};
  const actor=(name,state)=>({dead:false,recycled:false,behaviors:{getBehavior:key=>key===name ? state : null},getX:()=>100,getY:()=>0,getXCenter:()=>100,getYCenter:()=>0,getAnimation:()=> '5'});
  const target=actor('ActorEvents_1',targetState), player=actor('ActorEvents_20',playerState);
  const attrs={UserInfo:['Main'],OtherPlayers:{h:{Main:player}},MapMonstersList:[target],
    OptionsList:Array(19).fill(0),BlockMovement:0,GetPlayersUsernames:['Main','Miner'],
    MonsterDefinitionsGET:{h:{Copper:{h:{AFKtype:'MINING'}}}},
    CustomLists:{h:{MapName:{6:'MininggA'},SceneTransitions:[],MapAFKtarget:{6:'Copper'},MapAFKtargetSide:{6:[]}}},
    KillsLeft2Advance:[[1,0]],QuestComplete:{h:{}},
    PlayerDATABASE:{h:{Miner:{h:{KillsLeft2Advance:[[1,0]],QuestComplete:{h:{}}}}}},
    PlayerMoveMaps:[{h:{Main:1}},{h:{}},{h:{}}],MonsterAlive:[0,1],AFKtarget:'Copper',CurrentMap:6,
    CloudsaveTimer:0,FamilyValuesMap:{h:{}}};
  const context={get:key=>attrs[key],
    a:{engine:{getGameAttribute:key=>attrs[key],setGameAttribute:(key,value)=>{attrs[key]=value;}}},
    c:{getActorType:id=>id,getActorsOfType:id=>id===203?popups:id===44?ground:[],
      isTransitioning:()=>false,getCurrentSceneName:()=> 'MininggA',getIDForScene:()=>1,
      createFadeOut:()=>null,createFadeIn:()=>null,switchScene:id=>calls.push(['scene',id])},
    k:{_customBlock_add_new_player_to_database:name=>{calls.push(['database',name]);return name;},_customBlock_SaveGamee:()=>calls.push(['local-save'])},
    v:{_customBlock_CloudSAVE:()=>calls.push(['cloud-save']),_customBlock_NetworkMove:(...args)=>calls.push(['movement',...args])},
    q:{_customBlock_AFKgains:()=> 'native gains result',_customBlock_Teleport:map=>calls.push(['travel',map])},u:{playButton:name=>calls.push(['play',name])},
    Xa:{get:()=>({scenes:{h:{19:{getID:()=>19}}}})}};
  const adapter=vm.runInNewContext(adapterSource+';gameAdapter(()=>{})',context);
  context.availableMaps=vm.runInNewContext(accessSource+';availableMaps',context);
  return {adapter,attrs,calls,popups,ground,actor,playerState,target,targetState,context};
}

test('game adapter preserves the native save and character-switch order',()=>{
  const f=gameFixture();f.adapter.preflight(spec);f.adapter.switchCharacter('Miner');
  assert.deepEqual(f.calls,[['database','Main'],['cloud-save'],['local-save'],['play','Miner'],['scene',19]]);
  assert.equal(f.attrs.OptionsList[15],1);assert.equal(f.attrs.FamilyValuesMap.h.SwapPlayerStatus,'Swap');
});

test('the native switch defers for fresh loot without saving or leaving',()=>{
  const f=gameFixture();
  const drop={_CollectedStatus:0,_DropAmount:1};
  f.ground.push(f.actor('ActorEvents_44',drop));
  assert.equal(f.adapter.switchCharacter('Miner'),false);assert.equal(f.calls.length,0);
  drop._CollectedStatus=1;f.adapter.switchCharacter('Miner');
  assert.equal(f.calls.at(-1)[0],'scene');
});

test('returning refuses to save if gathering was interrupted during the last loot check',()=>{
  const f=fixture();f.reachActivity();f.state.gathering=true;f.tick();f.tick();
  f.state.gathering=false;f.tick();assert.equal(f.controller.current,null);
  assert.equal(f.calls.filter(call=>call[0]==='switch').length,1);
  assert.match(f.messages.at(-1),/Gathering stopped/);
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

test('locked assignments and stale travel requests are rejected before teleporting',()=>{
  const f=gameFixture(),lists=f.attrs.CustomLists.h;
  lists.MapName=[];lists.MapName[6]='MininggA';lists.MapName[7]='MininggB';
  lists.SceneTransitions[6]=[[5,'Town'],[3,'MininggB']];
  lists.MapAFKtarget[7]='Copper';lists.MapAFKtargetSide[7]=[];
  f.attrs.KillsLeft2Advance[6]=[10];f.attrs.PlayerDATABASE.h.Miner.h.KillsLeft2Advance[6]=[10];
  assert.throws(()=>f.adapter.preflight({...spec,map:7}),/locked/);
  f.attrs.PlayerDATABASE.h.Miner.h.KillsLeft2Advance[6]=[0];
  f.adapter.preflight({...spec,map:7});
  f.attrs.UserInfo[0]='Miner';f.attrs.OtherPlayers.h.Miner=f.attrs.OtherPlayers.h.Main;
  assert.throws(()=>f.adapter.travel(7),/locked/);assert.equal(f.calls.length,0);
});

test('nearest matching resource wins even when the first resource is upper left',()=>{
  const f=gameFixture();
  const farState={...f.targetState,_MonsterID:1,_Monster0ffsetX:0};
  const nearState={...f.targetState,_MonsterID:2,_Monster0ffsetX:0};
  const far=f.actor('ActorEvents_1',farState),near=f.actor('ActorEvents_1',nearState);
  far.getX=()=>0;far.getY=()=>-500;near.getX=()=>130;near.getY=()=>0;
  f.attrs.MapMonstersList=[far,near];f.attrs.MonsterAlive=[0,1,1];
  f.adapter.beginActivity('Copper');assert.equal(f.playerState._TargetEnemy,near);
});

test('nearest search ignores inactive resources and different resource types',()=>{
  const f=gameFixture();
  const inactive=f.actor('ActorEvents_1',{...f.targetState,_MonsterID:2});
  const iron=f.actor('ActorEvents_1',{...f.targetState,_MonsterType:'Iron',_MonsterID:3});
  f.attrs.MapMonstersList=[inactive,iron,f.target];f.attrs.MonsterAlive=[0,1,0,1];
  f.adapter.beginActivity('Copper');assert.equal(f.playerState._TargetEnemy,f.target);
});

test('AFK readiness requires the selected character native gains callback',()=>{
  const f=gameFixture();f.adapter.switchCharacter('Miner');assert.equal(f.adapter.afkReady(),false);
  assert.equal(f.context.q._customBlock_AFKgains('MINING',[]),'native gains result');
  assert.equal(f.adapter.afkReady(),false);
  f.attrs.UserInfo[0]='Miner';f.context.q._customBlock_AFKgains('MINING',[]);
  assert.equal(f.adapter.afkReady(),true);
});

test('native AFK processing remembers a popup that closes automatically',()=>{
  const f=gameFixture();f.adapter.switchCharacter('Miner');f.attrs.UserInfo[0]='Miner';
  f.popups.push(f.actor('ActorEvents_203',{}));f.context.q._customBlock_AFKgains('MINING',[]);
  f.popups.length=0;assert.equal(f.adapter.afkMenuSeen(),true);
  f.attrs.UserInfo[0]='Main';f.adapter.preflight(spec);assert.equal(f.adapter.afkMenuSeen(),false);
});

test('progress reflects movement and partial loot pickup',()=>{
  const f=gameFixture();const before=f.adapter.progress('activity');
  f.attrs.OtherPlayers.h.Main.getX=()=>110;assert.notEqual(f.adapter.progress('activity'),before);
  const drop={_CollectedStatus:0,_DropAmount:20,_PlayerDroppedItem:0,_DungItemStatus:0};
  f.ground.push(f.actor('ActorEvents_44',drop));const loot=f.adapter.progress('loot');drop._DropAmount=10;
  assert.notEqual(f.adapter.progress('loot'),loot);
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
  const lists={MapName:[],SceneTransitions:[],MapAFKtarget:[],MapAFKtargetSide:[],MapDispName:[]};
  lists.MapName[6]='MininggA';lists.MapAFKtarget[6]='Copper';lists.MapAFKtargetSide[6]=[];lists.MapDispName[6]='Tunnels_Entrance';
  lists.MapName[7]='MininggB';lists.MapAFKtarget[7]='Iron';lists.MapAFKtargetSide[7]=[];lists.MapDispName[7]='Freefall_Caverns';
  lists.SceneTransitions[6]=[[5,'Town'],[3,'MininggB']];
  f.attrs.MonsterDefinitionsGET.h.Iron={h:{AFKtype:'MINING',Name:'Iron'}};
  f.attrs.KillsLeft2Advance[6]=[10];f.attrs.PlayerDATABASE.h.Miner.h.KillsLeft2Advance[6]=[0];
  f.attrs.CustomLists.h=lists;f.attrs.QuestComplete={};f.attrs.PixelHelperActor=[];
  f.context.window={addEventListener(){}};
  f.context.document={body:element(),createElement:element};
  f.context.setTimeout=fn=>timers.push(fn);f.context.setInterval=()=>{};
  vm.runInNewContext(source,f.context);timers.shift()();
  elements.mode.value='assign';elements.mode.onchange();
  assert.equal(elements.rows.children.length,1);
  elements.character.value='Miner';elements.character.onchange();
  assert.equal(elements.rows.children.length,2);
  elements.rows.children[0].onclick();
  assert.equal(elements.resource.value,'Copper');assert.equal(elements['assignment-choice'].hidden,false);
  elements['start-assignment'].onclick();
  const job=f.context.window.__romNavigation.assignment.current;
  assert.equal(job.spec.character,'Miner');assert.equal(job.spec.resource,'Copper');assert.equal(job.spec.map,6);
  assert.equal(elements.mode.disabled,true);assert.equal(elements.cancel.hidden,false);
});
