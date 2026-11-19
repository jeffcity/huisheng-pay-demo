// Prototype authorization only. Production must enforce the same tenant scope on the server.
(() => {
  let owner = window;
  try { if (window.top.document) owner = window.top; } catch {}
  if (!owner.__HSBeautyDemo) {
    const key = 'huisheng.beauty.authorization.v1';
    const PortalURL = owner.URL || URL;
    let saved = {};
    try { saved = JSON.parse(owner.localStorage.getItem(key) || '{}'); } catch {}
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    const grants = new Map(Object.entries(saved).filter(([id, value]) => /^HS-TEN-[A-Z0-9-]+$/.test(id) && value === true));
    const listeners = new Set();
    let currentTenantId = 'HS-TEN-001';
    function portalHost(id) {
      if (!/^HS-TEN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(id)) throw Error('租户上下文无效');
      return 'tenant-'+id.slice(7).toLowerCase()+'.beauty.hs-pay.com';
    }

    const domainKey='huisheng.beauty.portal-domains.v1';
    const domainLists=new Map();let domainSequence=0;
    const validHost=value=>typeof value==='string'&&value.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)&&value.split('.').every(label=>label.length<=63);
    const copy=value=>JSON.parse(JSON.stringify(value));
    function readDomains(value){
      let parsed;try{parsed=JSON.parse(value||'{}')}catch{return}
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return;
      domainLists.clear();
      Object.entries(parsed).forEach(([id,rows])=>{
        if(!/^HS-TEN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(id)||!Array.isArray(rows))return;
        domainLists.set(id,rows.filter(row=>row&&typeof row.id==='string'&&row.subjectId===id&&row.subjectType==='beauty_portal'&&validHost(row.value)&&['未启用','可用','已停用'].includes(row.status)).map(copy));
      });
    }
    try{readDomains(owner.localStorage.getItem(domainKey))}catch{}
    function persistDomains(id){try{owner.localStorage.setItem(domainKey,JSON.stringify(Object.fromEntries(domainLists)))}catch{}listeners.forEach(fn=>fn(id,grants.get(id)===true))}
    function domainRows(id){
      const host=portalHost(id);
      if(!domainLists.has(id)){
        domainLists.set(id,[{id:'BDOM-'+id.slice(7)+'-SYSTEM',value:host,kind:'美人桥商户端系统域名',subjectType:'beauty_portal',subjectId:id,status:'可用',updatedAt:'—'}]);
      }
      return domainLists.get(id);
    }
    function requireBusiness(id){if(grants.get(id)!==true)throw Error('当前租户未开通美人桥业务')}
    owner.addEventListener('storage', event => {
      if(event.key===domainKey){
        const ids=new Set(domainLists.keys());readDomains(event.newValue);domainLists.forEach((_,id)=>ids.add(id));ids.forEach(id=>listeners.forEach(fn=>fn(id,grants.get(id)===true)));return;
      }

      if (event.key !== key) return;
      let next;
      try { next = JSON.parse(event.newValue || '{}'); } catch { next = {}; }
      if (!next || typeof next !== 'object' || Array.isArray(next)) next = {};
      const ids = new Set([...grants.keys(), ...Object.keys(next)]);
      ids.forEach(id => {
        const enabled = next[id] === true;
        if ((grants.get(id) === true) === enabled) return;
        grants.set(id, enabled);
        listeners.forEach(fn => fn(id, enabled));
      });
    });
    owner.__HSBeautyDemo = {
      get currentTenantId() { return currentTenantId; },
      set currentTenantId(id) {
        if (!/^HS-TEN-[A-Z0-9-]+$/.test(id)) throw Error('租户上下文无效');
        if (id === currentTenantId) return;
        currentTenantId = id;
        listeners.forEach(fn => fn(id, grants.get(id) === true));
      },
      enabled: id => grants.get(id) === true,
      portalDomains(id) { return copy(domainRows(id)); },
      portalAddresses(id) { return grants.get(id)===true?domainRows(id).filter(row=>row.status==='可用').map(row=>'https://'+row.value+'/login'):[]; },
      portalAddress(id) { return this.portalAddresses(id)[0]||''; },
      addPortalDomain(id,value) {
        requireBusiness(id);const hostname=String(value).trim().toLowerCase().replace(/\.$/,'');
        if(!validHost(hostname))throw Error('请输入完整公网域名');
        const rows=domainRows(id);
        if([...domainLists.values()].flat().some(row=>row.value===hostname))throw Error('该域名已经存在，不能重复绑定');
        const row={id:'BDOM-'+id.slice(7)+'-'+Date.now()+'-'+(++domainSequence),value:hostname,kind:'美人桥商户端自定义域名',subjectType:'beauty_portal',subjectId:id,status:'未启用',updatedAt:new Date().toISOString()};
        rows.push(row);persistDomains(id);return copy(row);
      },
      changePortalDomain(id,domainId,action) {
        requireBusiness(id);const rows=domainRows(id),row=rows.find(row=>row.id===domainId);
        if(!row)throw Error('域名状态已变化，请刷新后重试');
        if(action==='解绑域名'){
          if(!row.kind.includes('自定义域名'))throw Error('系统域名不能解绑');
          domainLists.set(id,rows.filter(item=>item!==row));
        }else if(action==='启用域名'&&['未启用','已停用'].includes(row.status))row.status='可用';
        else if(action==='停用域名'&&row.status==='可用')row.status='已停用';
        else throw Error('域名状态已变化，请刷新后重试');
        row.updatedAt=new Date().toISOString();persistDomains(id);return copy(row);
      },
      resolvePortal(address) {
        let url;
        try { url=new PortalURL(address); } catch { throw Error('美人桥访问地址不可用'); }
        const id=[...grants.keys()].find(id=>grants.get(id)===true&&domainRows(id).some(row=>row.value===url.hostname&&row.status==='可用'));
        if(url.protocol!=='https:'||url.port||url.username||url.password||!id)throw Error('美人桥访问地址不可用');
        return id;
      },
      setEnabled(id, enabled) {
        if (!/^HS-TEN-[A-Z0-9-]+$/.test(id) || typeof enabled !== 'boolean') throw Error('租户授权参数无效');
        grants.set(id, enabled);
        if(enabled){domainRows(id);try{owner.localStorage.setItem(domainKey,JSON.stringify(Object.fromEntries(domainLists)))}catch{}}
        try { owner.localStorage.setItem(key, JSON.stringify(Object.fromEntries(grants))); } catch {}
        listeners.forEach(fn => fn(id, enabled));
      },
      subscribe(fn, subscriberWindow) {
        const dispose = () => { listeners.delete(notify); subscriberWindow.removeEventListener('unload', dispose); };
        const notify = (id, enabled) => {
          // Removing an about:blank iframe does not reliably dispatch unload in every browser.
          if (subscriberWindow !== owner && (!subscriberWindow.frameElement || !subscriberWindow.frameElement.isConnected)) { dispose(); return; }
          fn(id, enabled);
        };
        listeners.add(notify);
        subscriberWindow.addEventListener('unload', dispose, { once: true });
        return dispose;
      }
    };
  }
  window.HSBeautyDemo = owner.__HSBeautyDemo;
})();
