const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','menu.js'),'utf8');
const plannerSource=source.slice(source.indexOf('function createBuildPlanner('),source.indexOf('function createChoppingMinigame('));
const create=vm.runInNewContext(plannerSource+';createBuildPlanner',{clean:value=>String(value).replace(/_/g,' ')});

function fixture() {
  const state={valid:true,character:'Main',className:'Squire',level:120,preset:1,tabs:[
    {name:'Warrior',available:12,talents:[
      {id:1,name:'Idle Brawling',description:'Boost AFK fight damage and kills',current:5,max:20},
      {id:2,name:'Copper Collector',description:'Mining efficiency and ore power',current:0,max:20},
      {id:3,name:'Boss Guard',description:'More health defence and boss survivability',current:2,max:20}
    ]}
  ]};
  return {state,planner:create({buildState:()=>structuredClone(state)})};
}

test('offers every manual build goal without changing game data',()=>{
  const f=fixture(),before=structuredClone(f.state),ids=f.planner.goals.map(goal=>goal.id);
  assert.equal(ids.join(','),'afk,active,boss,sampling,mining,chopping,fishing,catching');
  const plan=f.planner.plan('afk');assert.deepEqual(f.state,before);assert.match(plan.warning,/No talents or presets were changed/);
});

test('ranks matching talents and turns available points into next-point targets',()=>{
  const plan=fixture().planner.plan('afk'),pick=plan.tabs[0].recommendations[0];
  assert.equal(pick.name,'Idle Brawling');assert.equal(pick.current,5);assert.equal(pick.suggested,17);assert.equal(pick.add,12);
  assert.equal(pick.confidence,'High');
});

test('pasted community guidance boosts an explicitly named talent',()=>{
  const plan=fixture().planner.plan('afk','For this setup prioritize Boss Guard first.');
  assert.equal(plan.tabs[0].recommendations[0].name,'Boss Guard');assert.match(plan.tabs[0].recommendations[0].reasons[0],/imported/);
});

test('invalid game state produces a read-only explanation',()=>{
  const planner=create({buildState:()=>({valid:false,reason:'Talent data is unavailable.'})});
  const plan=planner.plan('active');assert.equal(plan.valid,false);assert.equal(plan.tabs.length,0);assert.match(plan.reason,/unavailable/);
});

test('game adapter reads class tabs, point budgets and talent metadata without writing',()=>{
  const adapterSource=source.slice(source.indexOf('function gameAdapter('),source.indexOf('function mount()'));
  const playerState={_PlayerNode:0};
  const actor={dead:false,recycled:false,getXCenter:()=>0,behaviors:{getBehavior:name=>name==='ActorEvents_20'?playerState:null}};
  const order=[];order[0]=1;order[1]=2;order[60]=3;
  const descriptions=[];descriptions[1]=[['AFK fight damage']];descriptions[2]=[['Mining efficiency']];descriptions[3]=[['Boss defence']];
  const attrs={UserInfo:['Main'],OtherPlayers:{h:{Main:actor}},MapMonstersList:[],CurrentMap:0,OptionsList:Array(19).fill(0),BlockMovement:0,
    CharacterClass:5,Lv0:[120],PlayerStuff:[0,1],SkillLevels:Array(10).fill(0),SkillLevelsMAX:Array(10).fill(0),
    CustomLists:{h:{TalentOrder:order,TalentIconNames:[],TalentDescriptions:descriptions,ClassNames:[]}},PixelHelperActor:[],QuestComplete:{h:{}}};
  attrs.SkillLevels[1]=5;attrs.SkillLevelsMAX[1]=20;attrs.SkillLevelsMAX[2]=30;attrs.SkillLevelsMAX[3]=40;
  attrs.CustomLists.h.TalentIconNames[1]='Idle_Brawling';attrs.CustomLists.h.TalentIconNames[2]='Copper_Collector';attrs.CustomLists.h.TalentIconNames[3]='Boss_Guard';
  attrs.CustomLists.h.ClassNames[1]='Beginner';attrs.CustomLists.h.ClassNames[5]='Squire';let writes=0;
  const context={get:key=>attrs[key],clean:value=>String(value).replace(/_/g,' '),a:{engine:{getGameAttribute:key=>attrs[key],setGameAttribute:()=>writes++}},
    c:{getActorType:id=>id,getActorsOfType:()=>[],isTransitioning:()=>false,getCurrentSceneName:()=> 'Town'},q:{_customBlock_AFKgains(){}},
    x:{_customBlock_ReturnClasses:()=>[1,5]},k:{_customBlock_TotalTalentPoints:spent=>[7,9,0,0,0,0]}};
  const adapter=vm.runInNewContext(adapterSource+';gameAdapter(()=>{})',context),state=adapter.buildState();
  assert.equal(state.valid,true);assert.equal(state.className,'Squire');assert.equal(state.preset,2);assert.equal(state.tabs[0].available,7);assert.equal(state.tabs[1].available,9);
  assert.equal(state.tabs[0].talents[0].name,'Idle Brawling');assert.equal(writes,0);
});
