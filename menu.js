/* Injected inside the installed game's closure; uses its own map data. */
(() => {
  if (window.__romNavigation) return;
  window.__romNavigation = { version: '0.6.0' };
  let pending = null;
  const clean = value => String(value == null ? '' : value).replace(/_/g, ' ');
  const get = key => a.engine && a.engine.getGameAttribute(key);
  function availableMaps(name = String((get('UserInfo') || [])[0] || '')) {
    const current=String((get('UserInfo') || [])[0] || ''), active=name===current;
    const saved=active ? null : get('PlayerDATABASE')?.h?.[name]?.h;
    const read=key=>active ? get(key) : saved?.[key];
    const lists=get('CustomLists')?.h, kills=read('KillsLeft2Advance');
    const unlocked=new Set();
    if (!lists || !Array.isArray(kills) || !Array.isArray(lists.SceneTransitions)) return unlocked;
    const quests=read('QuestComplete')?.h || {}, options=get('OptionsListAccount') || [];
    const number=value=>value===null || value===undefined || value==='' ? NaN : Number(value);
    const cleared=(table,map,slot)=>Number.isFinite(number(table?.[map]?.[slot])) && number(table[map][slot])<1;
    const native=active && typeof m!=='undefined' && typeof m._customBlock_Windwalker==='function';
    const special=native && (m._customBlock_Windwalker('CompassTempest',0,0)===1 || m._customBlock_ArcaneType('TesseractArcanist',0,0)===1);
    // Normal kill counts cannot prove access during an inactive character's challenge run.
    if (!active && (read('BuffsActive') || []).some(buff=>[420,585].includes(Number(buff[0])) && Number(buff[1])>100)) return unlocked;
    const portalOpen=(map,slot)=>{
      try { return native ? m._customBlock_Windwalker('CanWeEnterPortal',map,slot)===1 : cleared(kills,map,slot); }
      catch (_) { return false; }
    };
    let worlds=1;
    for (let world=0;world<6;world++) if(portalOpen(world*50,0)) worlds=world+2;
    const add=map=>{
      if (Math.floor(map/50)>=worlds || !lists.MapName?.[map]) return;
      if (map>150 && Number(quests.Gobo5)!==1 || map>250 && Number(quests.Lafu_Shi6)!==1) return;
      unlocked.add(map);
    };
    [0,6].forEach(add);
    if (worlds>1) [50,51,54].forEach(add);
    if (worlds>2) [100,101,102].forEach(add);
    for (let world=3;world<worlds;world++) add(world*50);
    const first=(get('GetPlayersUsernames') || [])[0];
    const firstLevels=first===current ? get('Lv0') : get('PlayerDATABASE')?.h?.[first]?.h?.Lv0;
    if (Number(firstLevels?.[0])>16) add(41);
    if (!special) {
      if (Number(options[265])===1) add(42);
      if (Number(options[266])===1) add(73);
      if (Number(get('Dream')?.[2])>=1) add(120);
      if (Number(quests.Rift_Ripper1)===1) add(166);
      if (Number(get('Holes')?.[1]?.[0])>=1) add(216);
    }
    const regionReq=get('CustomMaps')?.h?.MapMulticharReq?.h || {};
    const regionCleared=source=>{
      const required=number(regionReq[String(source)]);
      if (!Number.isFinite(required)) return true;
      const count=(get('GetPlayersUsernames') || []).filter(owner=>{
        const table=owner===current ? get('KillsLeft2Advance') : get('PlayerDATABASE')?.h?.[owner]?.h?.KillsLeft2Advance;
        return cleared(table,source,0);
      }).length;
      return count>=required;
    };
    lists.SceneTransitions.forEach((portals,source)=>{
      if (!Array.isArray(portals) || Math.floor(source/50)>=worlds) return;
      portals.slice(1).forEach((portal,slot)=>{
        const destination=lists.MapName.indexOf(portal[1]);
        if (destination<0 || Math.floor(destination/50)!==Math.floor(source/50)) return;
        if (portalOpen(source,slot) && (slot!==0 || regionCleared(source))) add(destination);
      });
    });
    if (portalOpen(14,1)) add(17);
    if (unlocked.has(15)) add(8);
    return unlocked;
  }
  function createAssignment(adapter, clock = () => Date.now()) {
    let job = null;
    const stallTimeout = 10000;
    const change = (phase, message) => {
      job.phase = phase; job.issued = false;
      job.lastProgress = clock(); job.progress = undefined;
      if (phase==='afk') { job.afkClaimed=false; job.afkSeen=false; job.lootReadyAt=null; }
      adapter.report(message);
    };
    const stop = message => { job = null; adapter.report(message); };
    function claimAndWait() {
      if (adapter.afkOpen()) {
        job.afkSeen=true;
        adapter.claimAfk();
        job.afkClaimed=true;
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
          if (typeof adapter.progress === 'function') {
            const progress = adapter.progress(job.phase);
            if (job.progress !== undefined && progress !== job.progress) job.lastProgress = clock();
            job.progress = progress;
          }
          if (clock()-job.lastProgress >= stallTimeout) throw new Error('No progress for 10 seconds during '+job.phase+'. Check the current character and its loot before retrying.');
          const expected = job.returning ? job.origin : job.spec.character;
          if (job.phase !== 'switch' && adapter.character() !== expected) throw new Error('The active character changed unexpectedly.');
          if (job.phase === 'switch') {
            if (!job.issued) {
              if (!adapter.canSwitch()) return;
              if (job.returning) {
                if (adapter.map() !== job.spec.map || !adapter.activityStarted(job.spec.resource)) throw new Error('Gathering stopped before the assignment could be saved.');
              }
              if (adapter.character() !== expected && adapter.switchCharacter(expected, {allowGroundDrops:job.returning}) === false) return;
              job.issued = true;
            }
            if (adapter.character() === expected && adapter.loaded()) change('afk', 'Checking AFK gains for '+expected+'…');
          } else if (job.phase === 'afk') {
            if (adapter.afkOpen() || adapter.afkMenuSeen?.()) job.afkSeen=true;
            if (adapter.loaded() && adapter.afkReady()) claimAndWait();
          } else if (job.phase === 'loot') {
            if (adapter.afkOpen()) {
              job.afkSeen=true; job.lootReadyAt=null;
              if (!job.afkClaimed) {
                adapter.claimAfk(); job.afkClaimed=true;
                adapter.report('Claiming AFK loot and collecting drops…');
              }
              return;
            }
            if (job.afkSeen && job.lootReadyAt===null) {
              job.lootReadyAt=clock()+2000;
              adapter.report('AFK menu closed. Waiting 2 seconds for drops to land…');
            }
            if (job.lootReadyAt!==null && clock()<job.lootReadyAt) return;
            if (!adapter.canAct()) return;
            adapter.collectDrops();
            if (adapter.dropCount() > 0) return;
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
            if (adapter.loaded() && adapter.canAct()) change('target', 'Finding '+job.spec.resourceName+'…');
          } else if (job.phase === 'target') {
            if (adapter.map() !== job.spec.map) throw new Error('The map changed unexpectedly.');
            if (adapter.beginActivity(job.spec.resource)) change('activity', 'Moving to '+job.spec.resourceName+' and waiting for gathering…');
          } else if (job.phase === 'activity') {
            if (adapter.map() !== job.spec.map) throw new Error('The map changed unexpectedly.');
            if (adapter.activityStarted(job.spec.resource)) change('finish', 'Gathering confirmed. Waiting for the first drop.');
          } else if (job.phase === 'finish') {
            if (adapter.map() !== job.spec.map || !adapter.activityStarted(job.spec.resource)) throw new Error('Gathering stopped before the assignment could be saved.');
            if (!adapter.dropCount()) return;
            if (job.origin === job.spec.character) { stop('Assignment complete. '+job.spec.character+' is gathering '+job.spec.resourceName+'.'); return; }
            job.returning=true;
            change('switch', 'Saving the activity and returning to '+job.origin+'…');
          }
        } catch (error) { stop('Assignment stopped: '+error.message); }
      }
    };
  }

  function createRepeatGathering(adapter, report, clock = () => Date.now()) {
    let job=null;
    const stop=message=>{job=null;report(message);};
    return {
      get active() { return !!job; },
      start() {
        const state=adapter.gatheringState();
        if (!state?.gathering) throw new Error('Start mining, chopping, fishing, or catching first.');
        job={...state,restarting:false};
        report('Repeat gathering on: '+clean(state.name)+'.');
      },
      stop() { if(job) stop('Repeat gathering off.'); },
      tick() {
        if (!job) return;
        try {
          const state=adapter.gatheringState();
          if (!state || state.character!==job.character || state.map!==job.map || state.target!==job.target || state.resource!==job.resource) {
            stop('Repeat gathering stopped: character, map, or resource changed.');return;
          }
          if (!state.gathering) {
            if (!job.restarting || state.movement===0 || clock()-job.restartedAt>=1000) stop('Repeat gathering stopped: gathering was interrupted.');
            return;
          }
          job.restarting=false;
          const gained=state.level>job.level || state.level===job.level && state.xp>job.xp;
          job.level=state.level;job.xp=state.xp;
          if (gained) {
            if (!adapter.beginActivity(job.resource,job.target)) {stop('Repeat gathering stopped: resource unavailable.');return;}
            job.restarting=true;job.restartedAt=clock();
          }
        } catch(error) { stop('Repeat gathering stopped: '+error.message); }
      }
    };
  }

  function createAutoProgress(adapter, report, clock = () => Date.now()) {
    let job=null,lastState=null,lastMessage='Auto progress is off.';
    let settings={arrivalDelayMs:1000,noProgressMs:120000};
    const say=message=>{lastMessage=message;report(message);};
    const stop=message=>{job=null;say(message);};
    const describe=state=>state.remaining===1 ? '1 kill remaining before '+state.destinationName+'.' : state.remaining+' kills remaining before '+state.destinationName+'.';
    const freshJob=(state, phase='waiting')=>({map:state.map,phase,expectedDestination:null,moveStartedAt:0,enterStartedAt:0,checkAt:0,
      lastRemaining:state.remaining,lastProgressAt:clock(),lastAutoAttemptAt:-Infinity});
    const waitText=()=>settings.arrivalDelayMs===1000 ? '1 second' : (settings.arrivalDelayMs/1000)+' seconds';
    return {
      get active() { return !!job; },
      get diagnostics() {
        return {active:!!job,phase:job?.phase || 'off',message:lastMessage,map:lastState?.map,location:lastState?.location,
          destinationName:lastState?.destinationName,remaining:lastState?.remaining,autoCombat:lastState?.autoCombat,
          noProgressFor:job && job.phase==='waiting' && lastState?.remaining>0 ? Math.max(0,clock()-job.lastProgressAt) : 0,
          noProgressLimit:settings.noProgressMs,arrivalDelay:settings.arrivalDelayMs};
      },
      configure(next={}) {
        const arrival=Number(next.arrivalDelayMs), progress=Number(next.noProgressMs);
        if (Number.isFinite(arrival)) settings.arrivalDelayMs=Math.min(10000,Math.max(250,Math.round(arrival)));
        if (Number.isFinite(progress)) settings.noProgressMs=Math.min(900000,Math.max(15000,Math.round(progress)));
      },
      start() {
        const state=adapter.progressionState();
        if (!state?.valid) throw new Error(state?.reason || 'The next-area portal state is unavailable.');
        lastState=state;job=freshJob(state);
        if (state.remaining>0 && !state.autoCombat) {
          adapter.enableAutoCombat(state);job.lastAutoAttemptAt=clock();lastState={...state,autoCombat:true};
          say('Auto progress on. Auto combat enabled. '+describe(state));
        } else say(state.remaining>0 ? 'Auto progress on. '+describe(state) : 'Auto progress on. The next portal is unlocked.');
      },
      stop() { if(job) stop('Auto progress off.'); },
      tick() {
        if (!job) return;
        try {
          if (job.phase==='cooldown' && clock()<job.checkAt) return;
          const state=adapter.progressionState();
          if (job.phase==='entering' && state?.transitioning) return;
          if (!state?.valid) throw new Error(state?.reason || 'The next-area portal state became unavailable.');
          lastState=state;
          if (job.phase==='entering') {
            if (state.map===job.expectedDestination) {
              job.phase='cooldown';job.checkAt=clock()+settings.arrivalDelayMs;
              say('Arrived at '+state.location+'. Waiting '+waitText()+' before checking again.');
              return;
            }
            if (state.map!==job.map) throw new Error('The character entered an unexpected area.');
            if (clock()-job.enterStartedAt>=30000) throw new Error('The next area did not load within 30 seconds.');
            return;
          }
          if (job.phase==='cooldown') {
            if (state.map!==job.expectedDestination) throw new Error('The active area changed during the arrival wait.');
            job=freshJob(state);
            if (state.remaining>0 && !state.autoCombat) {
              adapter.enableAutoCombat(state);
              job.lastAutoAttemptAt=clock();lastState={...state,autoCombat:true};
              say('Arrived at '+state.location+'. Auto combat on. '+describe(state));
              return;
            }
            if (state.remaining>0) {say('Arrived at '+state.location+'. Auto combat already on. '+describe(state));return;}
            say('Arrived at '+state.location+'. Checking the next portal.');
          } else if (state.map!==job.map) {
            if (job.phase==='moving' && state.map===job.expectedDestination) {
              job.phase='cooldown';job.checkAt=clock()+settings.arrivalDelayMs;
              say('Arrived at '+state.location+'. Waiting '+waitText()+' before checking again.');
              return;
            }
            throw new Error('The active map changed unexpectedly.');
          }
          if (state.remaining>0) {
            job.phase='waiting';job.expectedDestination=null;
            if (state.remaining<job.lastRemaining) job.lastProgressAt=clock();
            else if (state.remaining>job.lastRemaining) job.lastProgressAt=clock();
            if (!state.autoCombat && clock()-job.lastAutoAttemptAt>=2000) {
              adapter.enableAutoCombat(state);job.lastAutoAttemptAt=clock();lastState={...state,autoCombat:true};
              say('Auto combat was off and has been restored. '+describe(state));
            } else if (state.remaining!==job.lastRemaining) say(describe(state));
            job.lastRemaining=state.remaining;
            if (clock()-job.lastProgressAt>=settings.noProgressMs) throw new Error('The kill count has not changed for '+Math.round(settings.noProgressMs/1000)+' seconds.');
            return;
          }
          if (!state.open) throw new Error('The kill count is complete, but the forward portal is still locked.');
          if (job.phase==='waiting') {
            adapter.moveToNextPortal(state);
            job.phase='moving';job.expectedDestination=state.destination;job.moveStartedAt=clock();job.lastRemaining=0;
            say('Portal unlocked. Moving to '+state.destinationName+'…');
            return;
          }
          if (job.phase==='moving') {
            if (clock()-job.moveStartedAt>=30000) throw new Error('Could not reach the forward portal within 30 seconds.');
            if (!state.atPortal) return;
            adapter.enterNextPortal(state);
            job.phase='entering';job.enterStartedAt=clock();
            say('Entering '+state.destinationName+'…');
          }
        } catch(error) { stop('Auto progress stopped: '+error.message); }
      }
    };
  }

  function createChoppingMinigame(adapter, report, clock = () => Date.now()) {
    let job=null;
    const stop=message=>{job=null;report(message);};
    const preferredTarget=state=>state.targets.find(target=>target.perfect) || state.targets[0];
    return {
      get active() { return !!job; },
      start() {
        const state=adapter.choppingState();
        if (!state?.active) throw new Error('Open and start the chopping minigame first.');
        if (!state.valid) throw new Error('The chopping bar state is incomplete or ambiguous.');
        job={lastTapCount:state.tapCount,lastTapPosition:null,postHitUntil:0};
        report('Chopping helper on. Watching the live bar and using native taps.');
      },
      stop() { if(job) stop('Chopping helper off.'); },
      tick() {
        if (!job) return;
        try {
          const state=adapter.choppingState();
          if (!state?.active) {stop('Chopping helper stopped: the chopping minigame closed or changed.');return;}
          if (clock()<job.postHitUntil) return;
          if (!state.valid) {stop('Chopping helper stopped: the bar state became ambiguous.');return;}
          if (state.result===1) {stop('Chopping helper stopped after a missed tap.');return;}
          if (!state.moving || state.result!==0) return;
          const target=preferredTarget(state);
          if (!target) {stop('Chopping helper stopped: no visible scoring target was detected.');return;}
          const inside=state.position>=target.start && state.position<=target.end;
          const alreadyTapped=state.tapCount===job.lastTapCount && state.position===job.lastTapPosition;
          if (!inside || alreadyTapped) return;
          adapter.choppingTap();
          job.lastTapCount=state.tapCount;
          job.lastTapPosition=state.position;
          job.postHitUntil=clock()+50;
          report('Chopping helper active. Native tap '+(state.tapCount+1)+' on '+(target.perfect?'perfect':'scoring')+' target.');
        } catch(error) { stop('Chopping helper stopped: '+error.message); }
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
    let awaitingAfk = null, lastAfkMenu = false;
    const nativeAfkGains = q._customBlock_AFKgains;
    if (typeof nativeAfkGains === 'function') {
      q._customBlock_AFKgains = function(...args) {
        const owner=character();
        const result=nativeAfkGains.apply(this,args);
        if (awaitingAfk===owner && character()===owner) { lastAfkMenu=!!afk(); awaitingAfk=null; }
        return result;
      };
    }
    return {
      report, character, loaded, canAct,
      afkReady:()=>awaitingAfk===null,
      afkMenuSeen:()=>lastAfkMenu,
      progress(phase) {
        if (phase==='switch' || phase==='travel') return JSON.stringify([character(),get('CurrentMap'),loaded(),drops().map(drop=>[drop.actor?.ID,drop._CollectedStatus,drop._DropAmount])]);
        if (phase==='afk' || phase==='arrival') return JSON.stringify([loaded(),awaitingAfk,!!afk(),canAct()]);
        if (phase==='loot' || phase==='finish') return JSON.stringify([!!afk(),canAct(),drops().map(drop=>[drop.actor?.ID,drop._CollectedStatus,drop._DropAmount])]);
        if (phase==='activity') {
          const actor=player(), state=playerBehavior();
          return JSON.stringify([get('CurrentMap'),state?._PlayerNode,actor && Math.round(actor.getX()),actor && Math.round(actor.getY()),get('PlayerMoveMaps')?.[0]?.h?.[character()],get('AFKtarget')]);
        }
        return '';
      },
      map:()=>Number(get('CurrentMap')),
      afkOpen:()=>!!afk(),
      canSwitch:()=>canAct(),
      preflight(spec) {
        if (!canAct()) throw new Error('Finish loading and close game dialogs before assigning an activity.');
        if (drops().length) throw new Error('Collect ground drops on the current character first.');
        if (!(get('GetPlayersUsernames') || []).includes(spec.character)) throw new Error('That character is not on this account.');
        if (!availableMaps(spec.character).has(spec.map)) throw new Error('That destination is locked for '+spec.character+'.');
        const def=get('MonsterDefinitionsGET')?.h?.[spec.resource]?.h;
        if (!def || !['MINING','FISHING','CHOPPIN','CHOPPING','CATCHING'].includes(def.AFKtype)) throw new Error('Choose a mining, fishing, chopping, or catching resource.');
        const lists=get('CustomLists')?.h;
        if (!lists || c.getIDForScene(String(lists.MapName[spec.map]))<0) throw new Error('Destination is unavailable.');
        const resources=[lists.MapAFKtarget[spec.map],...(lists.MapAFKtargetSide[spec.map] || [])];
        if (!resources.includes(spec.resource)) throw new Error('That resource is not listed on this map.');
        for (const [name, fn] of [['AFK gains',nativeAfkGains],['character switch',u.playButton],['cloud save',v._customBlock_CloudSAVE],['local save',k._customBlock_SaveGamee],['travel',q._customBlock_Teleport],['network movement',v._customBlock_NetworkMove]]) {
          if (typeof fn!=='function') throw new Error('The game no longer exposes '+name+'.');
        }
        lastAfkMenu=false;
      },
      switchCharacter(name, {allowGroundDrops=false} = {}) {
        if (!canAct()) return false;
        if (!allowGroundDrops && drops().length) return false;
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
        awaitingAfk=name; lastAfkMenu=false;
        try {
          u.playButton(name);
          get('FamilyValuesMap').h.SwapPlayerStatus='Swap';
          c.switchScene(scene.getID(),c.createFadeOut(.3,0),c.createFadeIn(.3,0));
        } catch (error) { awaitingAfk=null; throw error; }
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
      travel(map) {
        if (!availableMaps().has(map)) throw new Error('That destination is locked for the active character.');
        q._customBlock_Teleport(map);
      },
      beginActivity(resource, selectedTarget=null) {
        if (!canAct()) return false;
        if (!availableMaps().has(Number(get('CurrentMap')))) throw new Error('This map is locked for the active character.');
        const origin=player();
        const distance=actor=>{
          const mob=behavior(actor,'ActorEvents_1');
          const dx=actor.getX()+Number(mob._Monster0ffsetX || 0)-origin.getXCenter();
          const dy=actor.getY()+Number(mob._Monster0ffsetY || 0)-origin.getYCenter();
          return dx*dx+dy*dy;
        };
        const target=(get('MapMonstersList') || []).filter(actor=>{
          const mob=behavior(actor,'ActorEvents_1');
          return (!selectedTarget || actor===selectedTarget) && mob && mob._MonsterType===resource && Number(get('MonsterAlive')?.[mob._MonsterID])===1;
        }).sort((left,right)=>distance(left)-distance(right))[0];
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
      gatheringState() {
        if (!canAct()) return null;
        const state=playerBehavior(), target=state?._TargetEnemy, mob=behavior(target,'ActorEvents_1');
        if (!mob || !(get('MapMonstersList') || []).includes(target) || Number(get('MonsterAlive')?.[mob._MonsterID])!==1) return null;
        const def=get('MonsterDefinitionsGET')?.h?.[mob._MonsterType]?.h;
        const skill={MINING:1,CHOPPIN:3,CHOPPING:3,FISHING:4,CATCHING:6}[def?.AFKtype];
        const xp=get('Exp0')?.[skill], level=get('Lv0')?.[skill];
        if (!skill || xp==null || level==null || !Number.isFinite(Number(xp)) || !Number.isFinite(Number(level))) return null;
        return {character:character(),map:Number(get('CurrentMap')),target,resource:mob._MonsterType,name:def.Name || mob._MonsterType,
          xp:Number(xp),level:Number(level),movement:Number(get('PlayerMoveMaps')?.[0]?.h?.[character()]),gathering:this.activityStarted(mob._MonsterType)};
      },
      progressionState() {
        const map=Number(get('CurrentMap')), lists=get('CustomLists')?.h, transitions=lists?.SceneTransitions?.[map];
        const fail=reason=>({valid:false,reason,map});
        if (c.isTransitioning()) return {...fail('The area transition is still in progress.'),transitioning:true};
        if (!loaded() || afk()) return fail('Finish loading and close game dialogs before using Auto progress.');
        if (!Array.isArray(transitions) || !Array.isArray(transitions[1])) return fail('This area has no ordinary forward portal.');
        const node=Number(transitions[1][0]), destination=lists.MapName?.indexOf(transitions[1][1]);
        const remaining=Number(get('KillsLeft2Advance')?.[map]?.[0]);
        if (!Number.isInteger(destination) || destination<0 || !Number.isInteger(node) || node<0 || !Number.isFinite(remaining)) return fail('The forward portal data is incomplete.');
        const portal=actors(47).find(actor=>{
          const state=behavior(actor,'ActorEvents_47');
          return state && Number(state._isEtcPortal)===0 && Number(state._PortalID)===0;
        });
        if (!portal) return fail('The forward portal actor is unavailable.');
        const state=playerBehavior(), actor=player(), x=Number(get('NodeX')?.[node]), y=Number(get('NodeY')?.[node]);
        const playerY=Number(get('NodeY')?.[Number(state?._PlayerNode)]);
        if (!state || !actor || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(playerY)) return fail('The portal path is unavailable.');
        const open=typeof m?._customBlock_Windwalker==='function' && m._customBlock_Windwalker('CanWeEnterPortal',map,0)===1;
        return {valid:true,map,location:clean(lists.MapDispName?.[map] || lists.MapName?.[map] || map),destination,
          destinationName:clean(lists.MapDispName?.[destination] || transitions[1][1]),remaining:Math.max(0,Math.ceil(remaining)),
          open,node,x,portal,autoCombat:Number(get('PlayerAutoMoveTOGGLE'))===1,
          atPortal:Math.abs(x-actor.getXCenter())<50 && Math.abs(y-playerY)<25};
      },
      enableAutoCombat(snapshot) {
        const current=this.progressionState();
        if (!current.valid || current.map!==snapshot.map || current.destination!==snapshot.destination || current.remaining<=0) throw new Error('The next portal no longer requires kills.');
        if (!canAct()) throw new Error('The character cannot enable Auto combat while a dialog or transition is active.');
        const hud=actors(29).map(actor=>({actor,state:behavior(actor,'ActorEvents_29')})).find(entry=>Array.isArray(entry.state?._UIinventory));
        if (!hud || typeof c.removeImage!=='function' || typeof c.attachImageToActor!=='function' || typeof k?._customBlock_addImgInst!=='function') throw new Error('The native Auto combat button is unavailable.');
        // Match the native Auto button: it writes the live attribute directly and swaps the HUD image to its enabled state.
        a.engine.gameAttributes.h.PlayerAutoMoveTOGGLE=1;
        c.removeImage(hud.state._UIinventory[332]);
        const language=typeof m?._customBlock_Language==='function' ? Number(m._customBlock_Language()) : -1;
        const suffix=language>=0 ? String(get('Number2Letter')?.[language] ?? '') : '';
        hud.state._UIinventory[332]=k._customBlock_addImgInst('UIbuttons'+suffix+'6.png');
        c.attachImageToActor(hud.state._UIinventory[332],hud.actor,413,480,1);
      },
      moveToNextPortal(snapshot) {
        const current=this.progressionState();
        if (!current.valid || current.map!==snapshot.map || current.destination!==snapshot.destination || current.remaining>0 || !current.open) throw new Error('The forward portal changed before movement began.');
        if (!canAct()) throw new Error('The character cannot move while a dialog or transition is active.');
        const state=playerBehavior(), movement=get('PlayerMoveMaps'), id=character();
        if (!state || !movement?.[0]?.h || !movement?.[1]?.h || !movement?.[2]?.h) throw new Error('Movement data is unavailable.');
        a.engine.setGameAttribute('ActionTimer',0);
        a.engine.setGameAttribute('MenuType',0);a.engine.setGameAttribute('MenuType2',0);
        a.engine.setGameAttribute('PlayerAutoMoveTOGGLE',0);a.engine.setGameAttribute('PortalSelectedArrow',-1);
        state._TargetEnemy=null;state._TargetEnemyTEMP=null;state._MouseClickX=current.x;
        movement[1].h[id]=0;movement[2].h[id]=current.node;movement[0].h[id]=Number(state._PlayerNode)===current.node ? 1 : 0;
        v._customBlock_NetworkMove(player().getX(),Math.round(state._PlayerNode),current.x,current.node);
      },
      enterNextPortal(snapshot) {
        const current=this.progressionState();
        if (!current.valid || current.map!==snapshot.map || current.destination!==snapshot.destination || !current.open || !current.atPortal) throw new Error('The character is not at the unlocked forward portal.');
        const movement=get('PlayerMoveMaps'), id=character();
        if (!movement?.[0]?.h || !movement?.[1]?.h || !movement?.[2]?.h) throw new Error('Movement data is unavailable.');
        movement[0].h[id]=5;movement[1].h[id]=0;movement[2].h[id]=current.node;
        a.engine.setGameAttribute('BlockMovement',.5);
      },
      choppingState() {
        const helper=behavior(get('PixelHelperActor')?.[1],'ActorEvents_116');
        const info=helper?._GeneralINFO, bar=info?.[7], animation=String(player()?.getAnimation?.() ?? '');
        const active=Number(get('MenuType'))===7 && animation==='6' && Number(info?.[4])===1 && Number(helper?._UIinventoryOn2?.[94])===1;
        if (!active) return {active:false,valid:false,targets:[]};
        const number=value=>value===null || value===undefined || value==='' ? NaN : Number(value);
        const position=number(bar?.[0])+7, direction=number(bar?.[1]), speed=number(bar?.[3]);
        const target=(index,perfect)=>{
          const start=number(bar?.[index]), width=number(bar?.[index+1]);
          return Number.isFinite(start) && Number.isFinite(width) && width>0 && width<=225 && start>=-7 && start<=218
            ? {start:start+(perfect?1:3),end:start+width+(perfect?5:3),perfect} : null;
        };
        const regular=[4,6,8,10].map(index=>target(index,false)).filter(Boolean);
        const perfect=target(12,true), targets=perfect ? [perfect,...regular] : regular;
        const valid=Array.isArray(info) && Array.isArray(bar) && info.length>7 && bar.length>=17 &&
          Number.isFinite(position) && position>=0 && position<=225 && Number.isFinite(direction) && Math.abs(direction)===1 &&
          Number.isFinite(speed) && speed>0 && speed<50 && targets.length>0 &&
          Number.isFinite(number(info[2])) && Number.isFinite(number(bar[2])) && Number.isFinite(number(bar[15]));
        return {active,valid,position,direction,speed,targets,score:number(info[2]),result:number(bar[2]),tapCount:number(bar[15]),moving:direction!==0};
      },
      choppingTap() {
        const state=this.choppingState();
        if (!state.active || !state.valid || !state.moving || state.result!==0) throw new Error('The chopping screen is not ready for a safe tap.');
        const helper=behavior(get('PixelHelperActor')?.[1],'ActorEvents_116');
        if (typeof helper?._customEvent_MinigameTap!=='function') throw new Error('The native chopping tap action is unavailable.');
        helper._customEvent_MinigameTap();
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
      #panel{width:410px;max-height:88vh;overflow:auto;background:#111d2e;color:#eaf2ff;border:1px solid #53749a;border-radius:12px;padding:14px;box-shadow:0 8px 30px #0009}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}h2{font-size:18px;margin:0}h3{font-size:15px;margin:2px 0 5px}.hint{font-size:11px;color:#91a7c0;margin:0 0 10px;line-height:1.4}input,select{width:100%;background:#0a1422;color:#fff;border:1px solid #4c6482;border-radius:6px;padding:9px;margin-bottom:9px}.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}.tabs button{padding:8px 4px}.page{border-top:1px solid #29435f;padding-top:11px}#rows{overflow:auto;max-height:40vh}.row{display:block;text-align:left;width:100%;margin:5px 0}.row small{display:block;margin-top:4px;color:#bdd0e6}#status,#automation-status{line-height:1.4;margin:10px 0;color:#bdcfe4;font-size:12px}.settings{display:grid;grid-template-columns:1fr 1fr;gap:8px}.settings label{font-size:11px;color:#a9bdd4}.settings input{margin-top:4px}.diagnostics{background:#0a1422;border:1px solid #294968;border-radius:8px;padding:10px;margin:10px 0}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px;font-size:12px}.metric{background:#10243a;border-radius:6px;padding:7px}.metric span{display:block;color:#8fa8c2;font-size:10px;margin-bottom:2px}#automation-log{margin:8px 0 0;padding-left:20px;max-height:120px;overflow:auto;color:#aebfd2;font-size:11px;line-height:1.4}footer{font-size:11px;color:#91a7c0;margin-top:9px}#cancel,#automation-toggle,#start-assignment{width:100%}[hidden]{display:none!important}
      </style><button id="open">IdleOn Toolkit · F8</button><section id="panel" hidden><header><h2>IdleOn Toolkit</h2><button id="close" aria-label="Close">×</button></header><nav class="tabs"><button id="tab-travel">Travel</button><button id="tab-assign">Assignment</button><button id="tab-automation">Automation</button></nav><select id="mode" hidden aria-label="Travel or assign activity"><option value="travel">Travel</option><option value="assign">Assign activity and return</option></select><section id="destination-page" class="page"><h3 id="destination-title">Travel</h3><p id="destination-help" class="hint">Move the active character to an unlocked destination.</p><select id="character" aria-label="Character" hidden></select><input id="search" placeholder="Search destinations or codes…" aria-label="Search destinations or codes"><select id="world" aria-label="World"><option value="">All worlds</option>${[1,2,3,4,5,6,7].map(w=>`<option value="${w}">World ${w}</option>`).join('')}</select><div id="assignment-choice" hidden><div id="chosen"></div><select id="resource" aria-label="Resource"></select><button id="start-assignment">Start assignment</button></div><div id="rows"></div><div id="status">Waiting for your character…</div><button id="cancel" hidden>Cancel</button><footer>Only destinations unlocked for the selected character are shown.</footer></section><section id="automation-page" class="page" hidden><h3>Automation</h3><p class="hint">Run one focused helper at a time. Travel and assignments remain separate.</p><select id="automation" aria-label="Automation"><option value="progress">Auto progress</option><option value="repeat">Repeat gathering</option><option value="chopping">Chopping helper</option></select><div id="progress-tools"><div class="settings"><label>Arrival wait (seconds)<input id="arrival-delay" type="number" min="0.25" max="10" step="0.25"></label><label>No-kill timeout (seconds)<input id="progress-timeout" type="number" min="15" max="900" step="5"></label></div><div class="diagnostics"><div class="metrics"><div class="metric"><span>Phase</span><strong id="diag-phase">Off</strong></div><div class="metric"><span>Auto combat</span><strong id="diag-auto">Unknown</strong></div><div class="metric"><span>Area</span><strong id="diag-area">—</strong></div><div class="metric"><span>Next portal</span><strong id="diag-portal">—</strong></div><div class="metric"><span>Kills remaining</span><strong id="diag-kills">—</strong></div><div class="metric"><span>No progress</span><strong id="diag-stall">—</strong></div></div><ol id="automation-log"></ol></div></div><button id="automation-toggle" type="button">Start Auto progress</button><div id="automation-status" role="status">Choose an automation. Only one runs at a time.</div></section></section>`;
    const el = id => root.getElementById(id);
    const status = message => { el('status').textContent = message; };
    let taskMessage = '', selectedRow = null, displayedOwner = '', workspace='travel';
    const adapter=gameAdapter(message => { taskMessage=message; status(message); });
    const assignment = createAssignment(adapter);
    const automationEvents=[];
    const renderAutomationLog=()=>{el('automation-log').replaceChildren();automationEvents.slice(-8).reverse().forEach(event=>{const item=document.createElement('li');item.textContent=event;el('automation-log').appendChild(item);});};
    const automationReport=message=>{automationEvents.push(new Date().toLocaleTimeString()+' · '+message);el('automation-status').textContent=message;renderAutomationLog();updateAutomationControls();updateProgressDiagnostics();if(!el('panel').hidden && workspace!=='automation')render();};
    const repeat=createRepeatGathering(adapter,automationReport);
    const chopping=createChoppingMinigame(adapter,automationReport);
    const progress=createAutoProgress(adapter,automationReport);
    const automations={progress:{label:'Auto progress',controller:progress},repeat:{label:'Repeat gathering',controller:repeat},chopping:{label:'Chopping helper',controller:chopping}};
    const activeAutomation=()=>Object.values(automations).find(item=>item.controller.active);
    const phaseNames={off:'Off',waiting:'Fighting',moving:'Approaching portal',entering:'Entering area',cooldown:'Arrival wait'};
    function updateProgressDiagnostics() {
      const info=progress.diagnostics;
      el('diag-phase').textContent=phaseNames[info.phase] || info.phase;
      el('diag-auto').textContent=info.autoCombat===true?'ON':info.autoCombat===false?'OFF':'Unknown';
      el('diag-area').textContent=info.location || '—';
      el('diag-portal').textContent=info.destinationName || '—';
      el('diag-kills').textContent=info.remaining??'—';
      el('diag-stall').textContent=info.active && info.remaining>0 ? Math.floor(info.noProgressFor/1000)+'s / '+Math.round(info.noProgressLimit/1000)+'s' : '—';
    }
    function updateAutomationControls() {
      const active=activeAutomation(), selected=automations[el('automation').value] || automations.progress;
      el('automation').disabled=!!active || !!pending || !!assignment.current;
      el('automation-toggle').disabled=!!pending || !!assignment.current;
      el('automation-toggle').textContent=(active?'Stop ':'Start ')+(active?.label || selected.label);
      el('progress-tools').hidden=(active?.controller || selected.controller)!==progress;
      el('arrival-delay').disabled=!!active;el('progress-timeout').disabled=!!active;
      updateProgressDiagnostics();
    }
    window.__romNavigation.repeatGathering=repeat;
    window.__romNavigation.choppingMinigame=chopping;
    window.__romNavigation.autoProgress=progress;
    el('arrival-delay').value='1';el('progress-timeout').value='120';
    const configureProgress=()=>progress.configure({arrivalDelayMs:Number(el('arrival-delay').value)*1000,noProgressMs:Number(el('progress-timeout').value)*1000});
    el('arrival-delay').onchange=configureProgress;el('progress-timeout').onchange=configureProgress;
    el('automation').onchange=updateAutomationControls;
    el('automation-toggle').onclick=()=>{
      const active=activeAutomation();
      if (active) active.controller.stop();
      else if (!pending && !assignment.current) {
        const selected=automations[el('automation').value] || automations.progress;
        try {if(selected.controller===progress)configureProgress();selected.controller.start();} catch(error) {automationReport(error.message);}
      }
      updateAutomationControls();render();
    };
    setInterval(()=>repeat.tick(),50);
    setInterval(()=>{progress.tick();if(workspace==='automation')updateProgressDiagnostics();},250);
    if (typeof requestAnimationFrame==='function') {
      const choppingFrame=()=>{chopping.tick();requestAnimationFrame(choppingFrame);};
      requestAnimationFrame(choppingFrame);
    } else setInterval(()=>chopping.tick(),16);
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
    function setWorkspace(next) {
      workspace=['travel','assign','automation'].includes(next)?next:'travel';
      el('destination-page').hidden=workspace==='automation';el('automation-page').hidden=workspace!=='automation';
      for (const name of ['travel','assign','automation']) el('tab-'+name).style.background=name===workspace?'#3b6594':'#1a304c';
      if (workspace!=='automation') {
        el('mode').value=workspace;el('character').hidden=workspace!=='assign';
        el('destination-title').textContent=workspace==='assign'?'Assign activity and return':'Travel';
        el('destination-help').textContent=workspace==='assign'?'Send a selected character to a gathering resource, verify it starts, then return.':'Move the active character to an unlocked destination.';
        el('assignment-choice').hidden=true;selectedRow=null;render();
      } else {updateAutomationControls();renderAutomationLog();}
    }
    el('mode').onchange=()=>setWorkspace(el('mode').value);
    el('tab-travel').onclick=()=>setWorkspace('travel');
    el('tab-assign').onclick=()=>setWorkspace('assign');
    el('tab-automation').onclick=()=>setWorkspace('automation');
    el('character').onchange=()=>{selectedRow=null;el('assignment-choice').hidden=true;render();};
    el('start-assignment').onclick=()=>{
      if (!selectedRow || pending || assignment.current) return;
      const resource=el('resource').value;
      try {
        const active=activeAutomation();if(active)active.controller.stop();
        assignment.start({character:el('character').value,map:selectedRow.map,location:selectedRow.location,resource,resourceName:clean(get('MonsterDefinitionsGET')?.h?.[resource]?.h?.Name || resource)});
        el('assignment-choice').hidden=true; render(); status(taskMessage);
      } catch(error) { status(error.message); }
    };
    const toggle = () => { el('panel').hidden = !el('panel').hidden; el('open').hidden = !el('panel').hidden; if (!el('panel').hidden) { if(workspace==='automation')updateAutomationControls();else{render();el('search').focus();} } };
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
        const taskBusy=!!(pending || assignment.current), busy=taskBusy || !!activeAutomation();
        ['mode','character','search','world','resource','start-assignment'].forEach(id=>{el(id).disabled=busy;});
        updateAutomationControls();
        el('cancel').hidden=!taskBusy;
        const all=entries(), query=el('search').value.trim().toLowerCase(), world=Number(el('world').value);
        const owner=el('mode').value==='assign' ? el('character').value : String((get('UserInfo') || [])[0] || '');
        displayedOwner=owner;
        const unlocked=availableMaps(owner);
        const rows=all.filter(row=>unlocked.has(row.map) && (el('mode').value!=='assign' || row.kind==='skill' && ['M','F','C','B'].includes(row.prefix)) && (!world || row.world===world) && `${row.code} ${row.name} ${row.id} ${row.location} ${row.resources || ''}`.toLowerCase().includes(query));
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
      if(pending || assignment.current || activeAutomation() || !ready())return;
      if(!availableMaps().has(row.map)){render();status('That destination is locked for this character.');return;}
      if(Number(get('CurrentMap'))===row.map){status('You are already on this map.');return;}
      pending={row,started:Date.now(),issued:false};el('cancel').hidden=false;render();status('Preparing travel to '+row.name+'…');
    }
    el('cancel').onclick=()=>{if(assignment.current){assignment.cancel();render();status(taskMessage);}else{pending=null;render();status('Pending request canceled. A transition already started will finish.');}};
    el('search').oninput=render;el('world').onchange=render;
    setWorkspace('travel');
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
          if(Date.now()-job.started>=10000){pending=null;el('cancel').hidden=true;render();status('Travel timed out after 10 seconds. Check the game before retrying.');return;}
          if(!job.issued && ready() && !c.isTransitioning()) {if(!availableMaps().has(job.row.map))throw new Error('That destination is locked for this character.');job.issued=true;q._customBlock_Teleport(job.row.map);status('Traveling to '+job.row.name+'…');}
          else if(job.issued && !c.isTransitioning() && Number(get('CurrentMap'))===job.row.map){pending=null;el('cancel').hidden=true;render();status('Arrived at '+job.row.location+'.');}
        } else if(!el('panel').hidden && (!el('rows').children.length || ready() !== previousReady || displayedOwner!==(el('mode').value==='assign' ? el('character').value : String((get('UserInfo') || [])[0] || '')))) render();
        previousReady = ready();
      }catch(error){pending=null;el('cancel').hidden=true;render();status('Travel stopped: '+error.message);}
    },250);
  }
  setTimeout(mount,0);
})()
