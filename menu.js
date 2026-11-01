/* Injected inside the installed game's closure; uses its own map data. */
(() => {
  if (window.__romNavigation) return;
  window.__romNavigation = { version: '0.2.0' };
  let pending = null;
  const clean = value => String(value == null ? '' : value).replace(/_/g, ' ');
  const get = key => a.engine && a.engine.getGameAttribute(key);
  function createAssignment(adapter, clock = () => Date.now()) {
    let job = null;
    const durations = { switch:45000, afk:45000, loot:45000, travel:30000, arrival:15000, target:15000, activity:45000, finish:30000 };
    const change = (phase, message) => {
      job.phase = phase; job.since = clock(); job.issued = false; job.stable = null;
      adapter.report(message);
    };
    const stop = message => { job = null; adapter.report(message); };
    function claimAndWait() {
      if (adapter.afkOpen()) {
        adapter.claimAfk();
        change('loot', 'Claiming AFK loot and collecting drops…');
      } else if (adapter.canAct()) change('loot', 'Checking remaining drops…');
    }
    return {
      get current() { return job && {...job}; },
      start(spec) {
        if (job) throw new Error('An assignment is already running.');
        adapter.preflight(spec);
        job = {spec:{...spec}, origin:adapter.character(), returning:false};
        change('switch', 'Switching to '+spec.character+'…');
      },
      cancel() { if (job) stop('Assignment canceled. Any transition already started will finish; check the current character.'); },
      tick() {
        if (!job) return;
        try {
          if (clock()-job.since > durations[job.phase]) throw new Error('Timed out during '+job.phase+'. Check the current character and its loot before retrying.');
          const expected = job.returning ? job.origin : job.spec.character;
          if (job.phase !== 'switch' && adapter.character() !== expected) throw new Error('The active character changed unexpectedly.');
          if (job.phase === 'switch') {
            if (!job.issued) {
              if (!adapter.canSwitch()) return;
              job.issued = true;
              if (adapter.character() !== expected) adapter.switchCharacter(expected);
            }
            if (adapter.character() === expected && adapter.loaded()) change('afk', 'Waiting 5 seconds for '+expected+' to load AFK gains…');
          } else if (job.phase === 'afk') {
            if (adapter.loaded() && clock()-job.since >= 5000) claimAndWait();
          } else if (job.phase === 'loot') {
            if (adapter.afkOpen() || !adapter.canAct()) return;
            adapter.collectDrops();
            if (adapter.dropCount() > 0 || clock()-job.since < 2000) return;
            if (job.returning) { stop('Assignment complete. Returned to '+job.origin+'.'); return; }
            change('travel', 'Traveling to '+job.spec.location+'…');
          } else if (job.phase === 'travel') {
            if (!job.issued) {
              if (!adapter.canAct()) return;
              if (adapter.dropCount()) throw new Error('New drops appeared before travel. Collect them before retrying.');
              job.issued = true;
              if (adapter.map() !== job.spec.map) adapter.travel(job.spec.map);
            }
            if (adapter.loaded() && adapter.map() === job.spec.map) change('arrival', 'Waiting for the destination to load…');
          } else if (job.phase === 'arrival') {
            if (adapter.map() !== job.spec.map) throw new Error('The map changed unexpectedly.');
            if (clock()-job.since >= 1000 && adapter.canAct()) change('target', 'Finding '+job.spec.resourceName+'…');
          } else if (job.phase === 'target') {
            if (adapter.map() !== job.spec.map) throw new Error('The map changed unexpectedly.');
            if (adapter.beginActivity(job.spec.resource)) change('activity', 'Moving to '+job.spec.resourceName+' and waiting for gathering…');
          } else if (job.phase === 'activity') {
            if (adapter.map() !== job.spec.map) throw new Error('The map changed unexpectedly.');
            if (!adapter.activityStarted(job.spec.resource)) { job.stable=null; return; }
            if (job.stable === null) job.stable=clock();
            if (clock()-job.stable >= 1500) change('finish', 'Gathering confirmed. Checking drops before returning…');
          } else if (job.phase === 'finish') {
            if (adapter.map() !== job.spec.map || !adapter.activityStarted(job.spec.resource)) throw new Error('Gathering stopped before the assignment could be saved.');
            adapter.collectDrops();
            if (adapter.dropCount()) return;
            if (job.origin === job.spec.character) { stop('Assignment complete. '+job.spec.character+' is gathering '+job.spec.resourceName+'.'); return; }
            job.returning=true;
            change('switch', 'Saving the activity and returning to '+job.origin+'…');
          }
        } catch (error) { stop('Assignment stopped: '+error.message); }
      }
    };
  }

  function gameAdapter(report) {
    const alive = actor => actor && !actor.dead && !actor.recycled;
    const behavior = (actor, name) => {
      if (!alive(actor)) return null;
      const found=actor.behaviors.getBehavior(name);
      return found && (found.script || found);
    };
    const character = () => String((get('UserInfo') || [])[0] || '');
    const player = () => (get('OtherPlayers') || {}).h?.[character()];
    const playerBehavior = () => behavior(player(),'ActorEvents_20');
    const actors = type => Array.from(c.getActorsOfType(c.getActorType(type)) || []).filter(alive);
    const afk = () => actors(203).map(actor=>behavior(actor,'ActorEvents_203')).find(Boolean);
    const drops = () => actors(44).map(actor=>behavior(actor,'ActorEvents_44')).filter(drop=>drop && Number(drop._CollectedStatus)!==1 && Number(drop._DropAmount)>0);
    const loaded = () => !!(playerBehavior() && Array.isArray(get('MapMonstersList')) && !c.isTransitioning() && c.getCurrentSceneName()!=='PlayerSelect');
    const canAct = () => loaded() && !afk() && Number((get('OptionsList') || [])[18])===0 && Number(get('BlockMovement'))===0;
    return {
      report, character, loaded, canAct,
      map:()=>Number(get('CurrentMap')),
      afkOpen:()=>!!afk(),
      canSwitch:()=>canAct(),
      preflight(spec) {
        if (!canAct()) throw new Error('Finish loading and close game dialogs before assigning an activity.');
        if (drops().length) throw new Error('Collect ground drops on the current character first.');
        if (!(get('GetPlayersUsernames') || []).includes(spec.character)) throw new Error('That character is not on this account.');
        const def=get('MonsterDefinitionsGET')?.h?.[spec.resource]?.h;
        if (!def || !['MINING','FISHING','CHOPPIN','CHOPPING','CATCHING'].includes(def.AFKtype)) throw new Error('Choose a mining, fishing, chopping, or catching resource.');
        const lists=get('CustomLists')?.h;
        if (!lists || c.getIDForScene(String(lists.MapName[spec.map]))<0) throw new Error('Destination is unavailable.');
        const resources=[lists.MapAFKtarget[spec.map],...(lists.MapAFKtargetSide[spec.map] || [])];
        if (!resources.includes(spec.resource)) throw new Error('That resource is not listed on this map.');
        for (const [name, fn] of [['character switch',u.playButton],['cloud save',v._customBlock_CloudSAVE],['local save',k._customBlock_SaveGamee],['travel',q._customBlock_Teleport],['network movement',v._customBlock_NetworkMove]]) {
          if (typeof fn!=='function') throw new Error('The game no longer exposes '+name+'.');
        }
      },
      switchCharacter(name) {
        if (!canAct() || drops().length) throw new Error('The character is not ready to switch, or loot remains on the ground.');
        const index=(get('GetPlayersUsernames') || []).indexOf(name);
        if (index<0) throw new Error('Character not found.');
        const scene=Xa.get().scenes.h[19];
        if (!scene) throw new Error('Character-switch scene unavailable.');
        a.engine.setGameAttribute('CloudsaveTimer',Number(get('CloudsaveTimer'))+2);
        a.engine.setGameAttribute('DummyText',String(k._customBlock_add_new_player_to_database(character())));
        v._customBlock_CloudSAVE();
        a.engine.setGameAttribute('CloudsaveTimer',Number(get('CloudsaveTimer'))+2);
        k._customBlock_SaveGamee();
        get('OptionsList')[15]=index;
        u.playButton(name);
        get('FamilyValuesMap').h.SwapPlayerStatus='Swap';
        c.switchScene(scene.getID(),c.createFadeOut(.3,0),c.createFadeIn(.3,0));
      },
      claimAfk() {
        const popup=afk();
        if (!popup || Number(popup._ClaimedStatus)!==0) return;
        if (typeof popup._customEvent_AutoClaimio!=='function' || typeof popup._customEvent_AFKclaim!=='function') throw new Error('AFK claim controls have changed. Claim the gains manually.');
        // The cache action checks its own unlock and storage capacity.
        popup._customEvent_AutoClaimio();
      },
      collectDrops() {
        if (!canAct()) return;
        for (const drop of drops().slice(0,16)) {
          if (Number(drop._PlayerDroppedItem)!==0 || Number(drop._DungItemStatus)!==0 || Number(drop._CollectedStatus)!==0) continue;
          if (typeof drop._customEvent_ItemPickupInTheFirstPlace!=='function') throw new Error('Loot pickup controls have changed. Collect drops manually.');
          drop._customEvent_ItemPickupInTheFirstPlace();
        }
      },
      dropCount:()=>drops().length,
      travel:map=>q._customBlock_Teleport(map),
      beginActivity(resource) {
        if (!canAct()) return false;
        const target=(get('MapMonstersList') || []).find(actor=>{
          const mob=behavior(actor,'ActorEvents_1');
          return mob && mob._MonsterType===resource && Number(get('MonsterAlive')?.[mob._MonsterID])===1;
        });
        if (!target) return false;
        const mob=behavior(target,'ActorEvents_1'), state=playerBehavior(), id=character(), movement=get('PlayerMoveMaps');
        if (!movement || !state) throw new Error('Movement data is unavailable.');
        a.engine.setGameAttribute('ActionTimer',0);
        a.engine.setGameAttribute('MenuType',0); a.engine.setGameAttribute('MenuType2',0);
        a.engine.setGameAttribute('PlayerAutoMoveTOGGLE',0);
        a.engine.setGameAttribute('PortalSelectedArrow',-1);
        state._TargetEnemy=target; state._TargetEnemyTEMP=target;
        state._MouseClickX=target.getX()+Number(mob._Monster0ffsetX || 0);
        movement[1].h[id]=0; movement[2].h[id]=mob._MonsterNODE;
        movement[0].h[id]=state._PlayerNode===mob._MonsterNODE ? 1 : 0;
        v._customBlock_NetworkMove(player().getX(),Math.round(state._PlayerNode),state._MouseClickX,Math.round(mob._MonsterNODE));
        return true;
      },
      activityStarted(resource) {
        if (!loaded() || afk()) return false;
        const state=playerBehavior(), target=behavior(state?._TargetEnemy,'ActorEvents_1');
        const animation=String(player().getAnimation());
        return target?._MonsterType===resource && Number(get('PlayerMoveMaps')?.[0]?.h?.[character()])===2 && ['5','6','7','8'].includes(animation) && get('AFKtarget')===resource;
      }
    };
  }
  function mount() {
    if (!document.body) return setTimeout(mount, 500);
    const host = document.createElement('div');
    host.id = 'rom-navigation';
    host.style.cssText = 'position:fixed;right:12px;top:12px;z-index:2147483647;font:14px Arial,sans-serif';
    document.body.appendChild(host);
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<style>
      *{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;background:#25446b;color:white;border:1px solid #53749a;border-radius:7px;padding:8px}button:disabled{opacity:.45;cursor:default}
      #panel{width:345px;max-height:85vh;background:#111d2e;color:#eaf2ff;border:1px solid #53749a;border-radius:12px;padding:14px;box-shadow:0 8px 30px #0009}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}h2{font-size:18px;margin:0}input,select{width:100%;background:#0a1422;color:#fff;border:1px solid #4c6482;border-radius:6px;padding:9px;margin-bottom:9px}#rows{overflow:auto;max-height:45vh}.row{display:block;text-align:left;width:100%;margin:5px 0}.row small{display:block;margin-top:4px;color:#bdd0e6}#status{line-height:1.4;margin:10px 0;color:#bdcfe4;font-size:12px}footer{font-size:11px;color:#91a7c0;margin-top:9px}#cancel{width:100%}[hidden]{display:none!important}
      </style><button id="open">Travel menu · F8</button><section id="panel" hidden><header><h2>Travel menu</h2><button id="close" aria-label="Close">×</button></header><select id="mode" aria-label="Travel or assign activity"><option value="travel">Travel</option><option value="assign">Assign activity and return</option></select><select id="character" aria-label="Character" hidden></select><input id="search" placeholder="Search destinations or codes…" aria-label="Search destinations or codes"><select id="world" aria-label="World"><option value="">All worlds</option>${[1,2,3,4,5,6,7].map(w=>`<option value="${w}">World ${w}</option>`).join('')}</select><div id="assignment-choice" hidden><div id="chosen"></div><select id="resource" aria-label="Resource"></select><button id="start-assignment">Start assignment</button></div><div id="rows"></div><div id="status">Waiting for your character…</div><button id="cancel" hidden>Cancel</button><footer>Uses the game's teleport routine. Special enemies without a mapped destination are listed as unavailable.</footer></section>`;
    const el = id => root.getElementById(id);
    const status = message => { el('status').textContent = message; };
    let taskMessage = '', selectedRow = null;
    const assignment = createAssignment(gameAdapter(message => { taskMessage=message; status(message); }));
    window.__romNavigation.assignment=assignment;
    function refreshCharacters() {
      const names=get('GetPlayersUsernames') || [], selected=el('character').value;
      if (Array.from(el('character').options).map(option=>option.value).join('|')===names.join('|')) return;
      el('character').replaceChildren();
      names.forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;el('character').appendChild(option);});
      el('character').value=names.includes(selected) ? selected : String((get('UserInfo') || [])[0] || names[0] || '');
    }
    function chooseAssignment(row) {
      if (assignment.current || pending) return;
      selectedRow=row; el('resource').replaceChildren();
      const defs=get('MonsterDefinitionsGET')?.h || {};
      row.resourceIds.forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=clean(defs[id]?.h?.Name || id);el('resource').appendChild(option);});
      el('chosen').textContent=row.code+' - '+row.location;
      el('assignment-choice').hidden=false;
      status('Choose the character and resource, then start the assignment.');
    }
    el('mode').onchange=()=>{
      el('character').hidden=el('mode').value!=='assign';
      el('assignment-choice').hidden=true; selectedRow=null; render();
    };
    el('start-assignment').onclick=()=>{
      if (!selectedRow || pending || assignment.current) return;
      const resource=el('resource').value;
      try {
        assignment.start({character:el('character').value,map:selectedRow.map,location:selectedRow.location,resource,resourceName:clean(get('MonsterDefinitionsGET')?.h?.[resource]?.h?.Name || resource)});
        el('assignment-choice').hidden=true; render(); status(taskMessage);
      } catch(error) { status(error.message); }
    };
    const toggle = () => { el('panel').hidden = !el('panel').hidden; el('open').hidden = !el('panel').hidden; if (!el('panel').hidden) { render(); el('search').focus(); } };
    el('open').onclick = toggle; el('close').onclick = toggle;
    window.addEventListener('keydown', event => { if(event.code === 'F8'){event.preventDefault();event.stopImmediatePropagation();toggle();}}, true);
    ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','wheel','keydown','keyup'].forEach(type => host.addEventListener(type, event=>event.stopPropagation()));
    function ready() {
      const players = get('OtherPlayers'), user = get('UserInfo');
      return !!(players && players.h && user && players.h[String(user[0])] && get('PixelHelperActor') && get('QuestComplete'));
    }
    function entries() {
      const lists = get('CustomLists'), defs = get('MonsterDefinitionsGET');
      if (!lists || !lists.h || !defs || !defs.h) return [];
      const names = lists.h.MapName || [], targets = lists.h.MapAFKtarget || [];
      const displayNames = lists.h.MapDispName || [], sides = lists.h.MapAFKtargetSide || [];
      const skills = {
        MINING: ['M','Mining'], FISHING: ['F','Fishing'],
        CHOPPIN: ['C','Chopping'], CHOPPING: ['C','Chopping'],
        CATCHING: ['B','Bug catching'], TRAPPING: ['T','Trapping'],
        SPELUNKING: ['S','Spelunking'], LABORATORY: ['L','Laboratory'],
        DIVINITY: ['D','Divinity'], FARMING: ['Farm','Farming']
      };
      const result = [], mapped = new Set();
      names.forEach((internal, map) => {
        if (!internal || /^(Z$|Filler$|Unused$|PlayerSelect$|Tutorial)/i.test(internal) || c.getIDForScene(String(internal)) < 0) return;
        const world = Math.floor(map/50)+1, location = clean(displayNames[map] || internal);
        const base = {map,world,location};
        if (map % 50 === 0) result.push({...base,id:'town'+world,name:location,kind:'town',code:'Town '+world});
        const id = targets[map], def = defs.h[id] && defs.h[id].h;
        if (def && def.AFKtype === 'FIGHTING') {
          mapped.add(id);
          result.push({...base,id,name:clean(def.Name || id),kind:'enemy'});
        }
        const groups = new Map();
        for (const resource of [id,...(sides[map] || [])]) {
          const resourceDef = defs.h[resource] && defs.h[resource].h;
          let type = resourceDef && String(resourceDef.AFKtype).toUpperCase();
          if (!skills[type]) {
            if (/^Spelunking\d+$/.test(resource)) type='SPELUNKING';
            else if (['Laboratory','Divinity','Farming'].includes(resource)) type=resource.toUpperCase();
          }
          const skill = skills[type];
          if (!skill) continue;
          if (!groups.has(skill[0])) groups.set(skill[0],{skill,resources:new Set(),ids:new Set()});
          groups.get(skill[0]).ids.add(resource);
          groups.get(skill[0]).resources.add(clean(resourceDef && resourceDef.Name || resource));
        }
        // The dedicated trapper map has no primary or secondary AFK target.
        if (internal === 'ySnowZ1') groups.set('T',{skill:skills.TRAPPING,resources:new Set(['Trapping']),ids:new Set()});
        for (const [prefix, group] of groups) result.push({...base,id:prefix+'-'+map,name:group.skill[1],kind:'skill',prefix,resources:[...group.resources].join(', '),resourceIds:[...group.ids]});
      });
      Object.keys(defs.h).forEach(id=>{const def=defs.h[id].h;if(def && def.AFKtype==='FIGHTING' && !mapped.has(id))result.push({id,map:null,name:clean(def.Name||id),location:'No ordinary map destination',world:0,kind:'unavailable',code:''});});
      const mainRoute = [1,2,14,16,19,24,26,27,28,29];
      const rank = row => row.world === 1 && mainRoute.includes(row.map) ? mainRoute.indexOf(row.map) : 1000 + (row.map ?? 9999);
      const skillOrder = ['M','F','C','B','T','S','L','D','Farm'];
      const section = row => row.kind==='skill' ? 0 : row.kind==='unavailable' ? 2 : 1;
      result.sort((x,y)=>section(x)-section(y) || (x.kind==='skill' && y.kind==='skill'
        ? skillOrder.indexOf(x.prefix)-skillOrder.indexOf(y.prefix) || x.map-y.map
        : (x.world || 999)-(y.world || 999) || (x.kind==='town'?-1:0)-(y.kind==='town'?-1:0) || rank(x)-rank(y)) || x.name.localeCompare(y.name));
      const counts = new Map();
      result.forEach(row => {
        if (row.kind!=='enemy' && row.kind!=='skill') return;
        const key = row.kind==='skill' ? row.prefix : row.world;
        const number = (counts.get(key) || 0) + 1;
        counts.set(key,number);
        row.code = key+':'+number;
      });
      return result;
    }
    function render() {
      try {
        refreshCharacters();
        const busy=!!(pending || assignment.current);
        ['mode','character','search','world','resource','start-assignment'].forEach(id=>{el(id).disabled=busy;});
        el('cancel').hidden=!busy;
        const all=entries(), query=el('search').value.trim().toLowerCase(), world=Number(el('world').value);
        const rows=all.filter(row=>(el('mode').value!=='assign' || row.kind==='skill' && ['M','F','C','B'].includes(row.prefix)) && (!world || row.world===world) && `${row.code} ${row.name} ${row.id} ${row.location} ${row.resources || ''}`.toLowerCase().includes(query));
        el('rows').replaceChildren();
        rows.forEach(row=>{
          const button=document.createElement('button');button.className='row';button.disabled=row.map===null || !ready() || busy;
          button.textContent=`${row.code ? row.code+' - ' : ''}${row.name}`;const detail=document.createElement('small');detail.textContent=row.location+(row.resources ? ' - '+row.resources : '');button.appendChild(detail);
          button.onclick=()=>el('mode').value==='assign' ? chooseAssignment(row) : travel(row);el('rows').appendChild(button);
        });
        if (!busy) status(ready()?`${rows.length} destinations / entries. Select a destination to travel.`:'Select a character in the game to enable travel.');
      } catch(error) { status('Waiting for game data: '+error.message); }
    }
    function travel(row) {
      if(pending || assignment.current || !ready())return;
      if(Number(get('CurrentMap'))===row.map){status('You are already on this map.');return;}
      pending={row,started:Date.now(),issued:false};el('cancel').hidden=false;render();status('Preparing travel to '+row.name+'…');
    }
    el('cancel').onclick=()=>{if(assignment.current){assignment.cancel();render();status(taskMessage);}else{pending=null;render();status('Pending request canceled. A transition already started will finish.');}};
    el('search').oninput=render;el('world').onchange=render;
    let previousReady = false;
    setInterval(()=>{
      try {
        if(assignment.current){
          assignment.tick();
          if(!assignment.current){render();status(taskMessage);}
          return;
        }
        if(pending){
          const job=pending;
          if(Date.now()-job.started>15000){pending=null;el('cancel').hidden=true;render();status('Travel timed out. Check the game before retrying.');return;}
          if(!job.issued && ready() && !c.isTransitioning()) {job.issued=true;q._customBlock_Teleport(job.row.map);status('Traveling to '+job.row.name+'…');}
          else if(job.issued && !c.isTransitioning() && Number(get('CurrentMap'))===job.row.map){pending=null;el('cancel').hidden=true;render();status('Arrived at '+job.row.location+'.');}
        } else if(!el('panel').hidden && (!el('rows').children.length || ready() !== previousReady)) render();
        previousReady = ready();
      }catch(error){pending=null;el('cancel').hidden=true;render();status('Travel stopped: '+error.message);}
    },500);
  }
  setTimeout(mount,0);
})()
