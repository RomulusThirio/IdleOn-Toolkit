const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','menu.js'),'utf8');
const accessSource=source.slice(source.indexOf('function availableMaps('),source.indexOf('function createAssignment('));

function fixture() {
  const names=[],transitions=[],kills=[],other=[];
  Object.entries({0:'Town',1:'Mushrooms',2:'Frogs',6:'Copper',7:'Iron',50:'Town2',51:'Jars',52:'Mimics',54:'Fishing',55:'Fishing2',100:'Town3',150:'Town4',151:'Purples'}).forEach(([id,name])=>{names[id]=name;});
  transitions[0]=[[5,'Copper'],[6,'Town2'],[7,'Mushrooms']];
  transitions[1]=[[8,'Town'],[9,'Frogs']];
  transitions[6]=[[5,'Town'],[3,'Iron']];
  transitions[51]=[[6,'Town2'],[7,'Mimics']];
  transitions[54]=[[6,'Town2'],[7,'Fishing2']];
  transitions[150]=[[10,'Town3'],[12,'Town5'],[11,'Purples']];
  kills[0]=[1,0];kills[1]=[5];kills[6]=[10];kills[50]=[1,0,0];kills[51]=[100];kills[54]=[15];kills[100]=[1,0];kills[150]=[1,0];
  for(const key of Object.keys(kills))other[key]=[...kills[key]];
  other[0][0]=0;other[6][0]=0;other[54][0]=0;
  const attrs={UserInfo:['Main'],GetPlayersUsernames:['Main','Miner'],
    KillsLeft2Advance:kills,QuestComplete:{h:{}},Lv0:[10],OptionsListAccount:[],
    CustomLists:{h:{MapName:names,SceneTransitions:transitions}},CustomMaps:{h:{MapMulticharReq:{h:{}}}},
    PlayerDATABASE:{h:{Miner:{h:{KillsLeft2Advance:other,QuestComplete:{h:{}},Lv0:[10]}}}}};
  const native={_customBlock_Windwalker:(type,map,slot)=>type==='CanWeEnterPortal' && typeof kills[map]?.[slot]==='number' && kills[map][slot]<1 ? 1 : 0,_customBlock_ArcaneType:()=>0};
  const context={get:key=>attrs[key],m:native};
  const availableMaps=vm.runInNewContext(accessSource+';availableMaps',context);
  return {attrs,kills,other,native,availableMaps};
}

test('starter maps are visible while locked portals and worlds are hidden',()=>{
  const f=fixture(),maps=f.availableMaps();
  assert(maps.has(0));assert(maps.has(6));assert(maps.has(1));
  for(const map of [2,7,50,51,52,54,55,100,150,151])assert(!maps.has(map),'Locked map '+map+' was shown');
});

test('cleared portal requirements expose their destinations',()=>{
  const f=fixture();f.kills[1][0]=0;f.kills[6][0]=0;
  const maps=f.availableMaps();assert(maps.has(2));assert(maps.has(7));
});

test('inactive character choices use its saved unlocks',()=>{
  const f=fixture(),active=f.availableMaps(),miner=f.availableMaps('Miner');
  assert(!active.has(7));assert(!active.has(54));
  assert(miner.has(7));assert(miner.has(50));assert(miner.has(54));assert(miner.has(55));
});

test('missing character progression does not expose destinations',()=>{
  const f=fixture();assert.equal(f.availableMaps('Unknown').size,0);
  delete f.attrs.KillsLeft2Advance;assert.equal(f.availableMaps().size,0);
});

test('active character native portal restrictions override cleared kill counts',()=>{
  const f=fixture();f.kills[6][0]=0;
  const original=f.native._customBlock_Windwalker;
  f.native._customBlock_Windwalker=(type,map,slot)=>type==='CanWeEnterPortal' && map===6 ? 0 : original(type,map,slot);
  assert(!f.availableMaps().has(7));
});

test('account region gates require enough characters to clear the portal',()=>{
  const f=fixture();f.kills[1][0]=0;f.attrs.CustomMaps.h.MapMulticharReq.h['1']=2;
  assert(!f.availableMaps().has(2));f.other[1][0]=0;assert(f.availableMaps().has(2));
});

test('world quests are checked for the selected character',()=>{
  const f=fixture();f.kills[100][0]=0;f.other[100][0]=0;
  assert(f.availableMaps().has(150));assert(!f.availableMaps().has(151));
  f.attrs.QuestComplete.h.Gobo5=1;assert(f.availableMaps().has(151));
  assert(!f.availableMaps('Miner').has(151));
});

test('null and missing requirements are not treated as cleared portals',()=>{
  const f=fixture();f.other[0][0]=null;f.other[6][0]=undefined;
  const maps=f.availableMaps('Miner');assert(!maps.has(50));assert(!maps.has(7));
});

test('inactive challenge progress is not inferred from normal kill counts',()=>{
  const f=fixture();f.attrs.PlayerDATABASE.h.Miner.h.BuffsActive=[[420,1000]];
  assert.equal(f.availableMaps('Miner').size,0);
});
