/* Injected inside the installed game's closure; uses its own map data. */
(() => {
  if (window.__romNavigation) return;
  window.__romNavigation = { version: '0.1.2' };
  let pending = null;
  const clean = value => String(value == null ? '' : value).replace(/_/g, ' ');
  const get = key => a.engine && a.engine.getGameAttribute(key);
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
      </style><button id="open">Travel menu · F8</button><section id="panel" hidden><header><h2>Travel menu</h2><button id="close" aria-label="Close">×</button></header><input id="search" placeholder="Search destinations or codes…" aria-label="Search destinations or codes"><select id="world" aria-label="World"><option value="">All worlds</option>${[1,2,3,4,5,6,7].map(w=>`<option value="${w}">World ${w}</option>`).join('')}</select><div id="rows"></div><div id="status">Waiting for your character…</div><button id="cancel" hidden>Cancel pending travel</button><footer>Uses the game's teleport routine. Special enemies without a mapped destination are listed as unavailable.</footer></section>`;
    const el = id => root.getElementById(id);
    const status = message => { el('status').textContent = message; };
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
          if (!groups.has(skill[0])) groups.set(skill[0],{skill,resources:new Set()});
          groups.get(skill[0]).resources.add(clean(resourceDef && resourceDef.Name || resource));
        }
        // The dedicated trapper map has no primary or secondary AFK target.
        if (internal === 'ySnowZ1') groups.set('T',{skill:skills.TRAPPING,resources:new Set(['Trapping'])});
        for (const [prefix, group] of groups) result.push({...base,id:prefix+'-'+map,name:group.skill[1],kind:'skill',prefix,resources:[...group.resources].join(', ')});
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
        const all=entries(), query=el('search').value.trim().toLowerCase(), world=Number(el('world').value);
        const rows=all.filter(row=>(!world || row.world===world) && `${row.code} ${row.name} ${row.id} ${row.location} ${row.resources || ''}`.toLowerCase().includes(query));
        el('rows').replaceChildren();
        rows.forEach(row=>{
          const button=document.createElement('button');button.className='row';button.disabled=row.map===null || !ready() || pending!==null;
          button.textContent=`${row.code ? row.code+' - ' : ''}${row.name}`;const detail=document.createElement('small');detail.textContent=row.location+(row.resources ? ' - '+row.resources : '');button.appendChild(detail);
          button.onclick=()=>travel(row);el('rows').appendChild(button);
        });
        if (!pending) status(ready()?`${rows.length} destinations / entries. Select a destination to travel.`:'Select a character in the game to enable travel.');
      } catch(error) { status('Waiting for game data: '+error.message); }
    }
    function travel(row) {
      if(pending || !ready())return;
      if(Number(get('CurrentMap'))===row.map){status('You are already on this map.');return;}
      pending={row,started:Date.now(),issued:false};el('cancel').hidden=false;render();status('Preparing travel to '+row.name+'…');
    }
    el('cancel').onclick=()=>{pending=null;el('cancel').hidden=true;render();status('Pending request canceled. A transition already started will finish.');};
    el('search').oninput=render;el('world').onchange=render;
    let previousReady = false;
    setInterval(()=>{
      try {
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
