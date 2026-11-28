import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { prepareBeautyDocument } from '../src/beauty-document.js';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
function windowFixture(sharedTop) {
  const handlers = new Map(), store = new Map();
  const window = {document:{},frameElement:{isConnected:true},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:(name,fn)=>{if(handlers.get(name)===fn)handlers.delete(name)}};
  window.top=sharedTop || window;
  vm.runInNewContext(read('src/beauty-model.js'),{window,Map,Set,JSON,Error,URL});
  return {window,handlers,store,model:window.HSBeautyDemo};
}
test('美人桥授权默认关闭、按租户独立；停用不触碰钱包数据',()=>{
  const f=windowFixture(),m=f.model;assert.equal(m.enabled('HS-TEN-001'),false);m.setEnabled('HS-TEN-001',true);
  assert(m.enabled('HS-TEN-001'));assert.equal(m.enabled('HS-TEN-018'),false);
  f.store.set('huisheng.HS-TEN-001.beauty-wallet.v1','wallet-fixture');m.setEnabled('HS-TEN-001',false);
  assert.equal(f.store.get('huisheng.HS-TEN-001.beauty-wallet.v1'),'wallet-fixture');
  assert.throws(()=>m.setEnabled('../other',true));assert.throws(()=>m.setEnabled('HS-TEN-001','false'));
});
test('切端订阅跟随当前订阅窗口卸载，跨标签授权变更通知当前端',()=>{
  const owner=windowFixture(),child=windowFixture(owner.window);let calls=0;
  child.model.subscribe(()=>calls++,child.window);
  owner.model.setEnabled('HS-TEN-001',true);assert.equal(calls,1);
  owner.handlers.get('storage')({key:'huisheng.beauty.authorization.v1',newValue:'{}'});assert.equal(calls,2);assert.equal(child.model.enabled('HS-TEN-001'),false);
  child.window.frameElement.isConnected=false;owner.model.setEnabled('HS-TEN-001',true);assert.equal(calls,2);
});
test('嵌入适配器保留业务逻辑，隔离租户存储并先设置原页面启动上下文',()=>{
  const source=read('surfaces/tenant/public/legacy/sources/beauty-wallet.html');
  const a=prepareBeautyDocument(source,{boot:'admin-merchants',tenantId:'HS-TEN-001'}),b=prepareBeautyDocument(source,{surface:'BEAUTY_MERCHANT',boot:'home',tenantId:'HS-TEN-018'});
  assert.match(a,/huisheng.HS-TEN-001.beauty-wallet.v1/);assert.match(b,/huisheng.HS-TEN-018.beauty-wallet.v1/);assert.doesNotMatch(a,/['"]bluepay\./);
  assert(a.indexOf('window.__BP_BOOT__=')<a.indexOf('const WALLET_KEY'));assert(a.includes("window.parent.location.hash='admin-beauty-wallet-ledger'"));
  assert(a.indexOf('id="hs-beauty-embed"')>a.lastIndexOf('</style>',a.indexOf('id="hs-beauty-embed"')));
});
function authorizationFixture() {
  const tenant={id:'HS-TEN-001',status:'正常'},fields=new Map([['confirmReason',{value:'原型评审'}],['confirmOperator2fa',{value:'123456'}]]),changes=[],errors=[],receipts=[];
  let permitted=true, scoped=true;
  const source=read('public/legacy/sources/tenants.html');
  const script=source.slice(source.indexOf('    function applyTenantConfirm('),source.indexOf('    function bindEvents('));
  fields.set('confirmActionBtn',{disabled:false});
  const context=vm.createContext({window:{top:{HSAddressPortal:{configure:async()=>null}},HSBeautyDemo:{setEnabled:(...args)=>changes.push(args)}},appState:{currentConfirm:'开通美人桥业务'},document:{getElementById:id=>fields.get(id)},currentTenantForAction:()=>tenant,getPermissions:()=>({canBusinessAuth:permitted}),tenantInCurrentScope:()=>scoped,showFormError:(id,text)=>errors.push(text),platformNow:()=> '2026-11-16 12:00:00',finishTenantAction:(t,r)=>receipts.push(r)});
  vm.runInContext(script,context);return {tenant,fields,changes,errors,receipts,scope:v=>scoped=v,permission:v=>permitted=v,apply:()=>vm.runInContext('applyTenantConfirm()',context)};
}
test('授权提交复验按钮权限、租户范围、状态及验证，失败不改授权或写成功审计',async()=>{
 for(const kind of ['permission','scope','closed','reason','otp']){const f=authorizationFixture();if(kind==='permission')f.permission(false);if(kind==='scope')f.scope(false);if(kind==='closed')f.tenant.status='关闭';if(kind==='reason')f.fields.get('confirmReason').value='';if(kind==='otp')f.fields.get('confirmOperator2fa').value='';f.apply();assert.equal(f.changes.length,0,kind);assert.equal(f.receipts.length,0,kind);assert.equal(f.errors.length,1,kind)}
 const f=authorizationFixture();await f.apply();assert.equal(f.changes.length,1);assert.equal(f.changes[0][0],'HS-TEN-001');assert.equal(f.changes[0][1],true);assert.equal(f.receipts.length,1);assert.doesNotMatch(JSON.stringify(f.receipts),/123456/);
});
test('迁移表保持新旧入口分离，四个业务菜单和钱包内部跳转均有注册',()=>{
 const modules=JSON.parse(read('surfaces/tenant/src/legacy/modules.json'));
 assert.equal(Object.values(modules).filter(m=>m.module==='beauty'&&!m.hidden).length,4);
 assert.equal(modules['admin-beauty-wallet-ledger'].initialHash,'admin-ledger');
 const app=read('surfaces/tenant/src/App.jsx');assert.equal((app.match(/!beauty.enabled\(beauty.currentTenantId\)/g)||[]).length,2);
 assert.match(app,/group.title !== '美人桥业务' \|\| beautyEnabled/);
 assert.match(read('src/unified.html'),/End:buttons.length-1/);
});

test('未授权直接路由不加载源，加载期间撤权也不挂载业务 iframe',async()=>{
 const app=read('surfaces/tenant/src/App.jsx');const start=app.indexOf('  const openPage = useCallback('),end=app.indexOf('  }, []);',start)+'  }, []);'.length;
 const script=app.slice(start,end)+';globalThis.openPageForTest=openPage;';
 for(const initial of [false,true]){
  let enabled=initial,fetches=0,mounts=0,resolveSource;const errors=[];const sourcePromise=new Promise(resolve=>resolveSource=resolve);
  const context=vm.createContext({useCallback:fn=>fn,requestRef:{current:0},resolvePageId:id=>id,MODULES:{'admin-pay-order':{module:'beauty',label:'订单管理',sourceKey:'beauty-orders'}},beauty:{currentTenantId:'HS-TEN-001',enabled:()=>enabled},setActivePage(){},frameHostRef:{current:{replaceChildren(){}}},setLoading(){},loadingRef:{current:false},setError:v=>errors.push(v),prepareEmbeddedDocument:()=>{fetches++;return sourcePromise},mountFrameDocument:()=>mounts++,frameRef:{},window:{history:{replaceState(){}}}});
  vm.runInContext(script,context);const pending=context.openPageForTest('admin-pay-order');enabled=false;resolveSource('<html>demo</html>');await pending;assert.equal(fetches,initial?1:0);assert.equal(mounts,0);assert.match(errors.at(-1),/未开通美人桥/);
 }
});

test('骗子库从后台、商户端与打包注册排除',()=>{
 const modules=JSON.parse(read('surfaces/tenant/src/legacy/modules.json'));
 assert.equal(modules['admin-beauty-risk-library'],undefined);
 assert.doesNotMatch(read('surfaces/beauty/demo.html'),/beauty-risk-library|骗子库/);
 const build=read('scripts/build-unified.mjs');assert.match(build,/file !== 'beauty-risk.html'/);assert.doesNotMatch(build,/'beauty-risk-library':/);
});
test('当前租户变化通知端内重载，非法上下文不会生效',()=>{
 const f=windowFixture(),calls=[];f.model.subscribe(id=>calls.push(id),f.window);
 f.model.setEnabled('HS-TEN-018',true);f.model.currentTenantId='HS-TEN-018';assert.equal(f.model.currentTenantId,'HS-TEN-018');assert.equal(calls.at(-1),'HS-TEN-018');assert.throws(()=>{f.model.currentTenantId='../other'});assert.equal(f.model.currentTenantId,'HS-TEN-018');
});
test('同商户号、订单号的钱包快照按租户读写，切租户和撤权后旧页面不可读写',()=>{
 const f=windowFixture();f.model.setEnabled('HS-TEN-001',true);f.model.setEnabled('HS-TEN-018',true);
 function storage(id){
  const html=prepareBeautyDocument('<html><head></head><body></body></html>',{tenantId:id});
  const window={top:f.window},document={documentElement:{dataset:{}}};
  const localStorage={getItem:k=>f.store.get(k)||null,setItem:(k,v)=>f.store.set(k,v),removeItem:k=>f.store.delete(k)};
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{window,document,localStorage,Error});return window.HSBeautyStorage;
 }
 const a=storage('HS-TEN-001'),aKey='huisheng.HS-TEN-001.beauty-wallet.v1',bKey='huisheng.HS-TEN-018.beauty-wallet.v1';
 a.setItem(aKey,JSON.stringify({merchants:[{id:'same',name:'A商户'}],orders:[{id:'same',amount:100}]}));assert.throws(()=>a.getItem(bKey));
 f.model.currentTenantId='HS-TEN-018';const b=storage('HS-TEN-018');assert.equal(b.getItem(bKey),null);b.setItem(bKey,JSON.stringify({merchants:[{id:'same',name:'B商户'}],orders:[{id:'same',amount:200}]}));
 assert.throws(()=>a.setItem(aKey,'overwrite'));assert.throws(()=>a.getItem(aKey));assert.throws(()=>b.getItem(aKey));
 f.model.currentTenantId='HS-TEN-001';assert.equal(JSON.parse(a.getItem(aKey)).merchants[0].name,'A商户');assert.equal(JSON.parse(f.store.get(bKey)).orders[0].amount,200);
 f.model.setEnabled('HS-TEN-001',false);assert.throws(()=>a.getItem(aKey));assert.throws(()=>a.setItem(aKey,'overwrite'));assert.match(f.store.get(aKey),/A商户/);
});
test('异步加载捕获原租户，切换后不挂载旧页面',async()=>{
 const app=read('surfaces/tenant/src/App.jsx'),start=app.indexOf('  const openPage = useCallback('),end=app.indexOf('  }, []);',start)+'  }, []);'.length;
 let id='HS-TEN-001',resolveSource,mounts=0;const errors=[],sourcePromise=new Promise(resolve=>resolveSource=resolve);
 const context=vm.createContext({useCallback:fn=>fn,requestRef:{current:0},resolvePageId:id=>id,MODULES:{orders:{module:'beauty',label:'订单',sourceKey:'beauty-orders'}},beauty:{get currentTenantId(){return id},enabled:()=>true},setActivePage(){},frameHostRef:{current:{replaceChildren(){}}},setLoading(){},loadingRef:{current:false},setError:v=>errors.push(v),prepareEmbeddedDocument:()=>sourcePromise,mountFrameDocument:()=>mounts++,frameRef:{},window:{history:{replaceState(){}}}});
 vm.runInContext(app.slice(start,end)+';globalThis.openPageForTest=openPage;',context);const pending=context.openPageForTest('orders');id='HS-TEN-018';resolveSource('<html>old</html>');await pending;assert.equal(mounts,0);assert.match(errors.at(-1),/租户上下文已变化/);
});

test('美人桥登录地址按租户生成并由网址解析租户，未授权或不匹配地址不默认进入',()=>{
 const f=windowFixture(),m=f.model;assert.equal(m.portalAddress('HS-TEN-001'),'');m.setEnabled('HS-TEN-001',true);m.setEnabled('HS-TEN-018',true);
 const a=m.portalAddress('HS-TEN-001'),b=m.portalAddress('HS-TEN-018');assert.notEqual(a,b);assert.equal(m.resolvePortal(a),'HS-TEN-001');assert.equal(m.resolvePortal(b),'HS-TEN-018');
 for(const address of ['https://unknown.example/login','https://tenant-001.merchant.hs-pay.com/login','http://tenant-001.beauty.hs-pay.com/login','https://tenant-001.beauty.hs-pay.com:444/login'])assert.throws(()=>m.resolvePortal(address));
 m.setEnabled('HS-TEN-001',false);assert.equal(m.portalAddress('HS-TEN-001'),'');assert.throws(()=>m.resolvePortal(a));assert.equal(m.resolvePortal(b),'HS-TEN-018');
});
test('访问域名页签仅展示当前已开通租户的可用美人桥地址，普通商户详情无该区块',()=>{
 const source=read('surfaces/tenant/public/legacy/sources/system.html');
 assert.match(source, /data-tenant-panel="access"[\s\S]*id="beautyAccessDomains"/);
 assert.doesNotMatch(read('surfaces/tenant/public/legacy/sources/merchants.html'), /merchantBeautyLogin/);
 const start=source.indexOf('function renderBeautyAccessDomains('),end=source.indexOf('beautyAccessModel?.subscribe(',start);
 const f=windowFixture(), provider={tenantId:'HS-TEN-001'};
 const elements={beautyAccessDomains:{},beautyAccessDomainRows:{}};
 const context=vm.createContext({window:{HSProviderDemo:provider},beautyAccessModel:f.model,document:{getElementById:id=>elements[id]},esc:value=>value});
 vm.runInContext(source.slice(start,end),context);
 const render=()=>context.renderBeautyAccessDomains();
 render();assert.equal(elements.beautyAccessDomains.hidden,true);
 f.model.setEnabled('HS-TEN-018',true);render();assert.equal(elements.beautyAccessDomainRows.innerHTML,'');
 f.model.setEnabled('HS-TEN-001',true);render();assert.equal(elements.beautyAccessDomains.hidden,false);
 assert.match(elements.beautyAccessDomainRows.innerHTML,/tenant-001\.beauty/);
 assert.doesNotMatch(elements.beautyAccessDomainRows.innerHTML,/tenant-018/);
 const domain=f.model.portalDomains('HS-TEN-001')[0];
 f.model.changePortalDomain('HS-TEN-001',domain.id,'停用域名');render();
 assert.match(elements.beautyAccessDomainRows.innerHTML,/暂无可用域名/);
 provider.tenantId='HS-TEN-018';render();assert.match(elements.beautyAccessDomainRows.innerHTML,/tenant-018\.beauty/);
 f.model.setEnabled('HS-TEN-018',false);render();
 assert.equal(elements.beautyAccessDomains.hidden,true);assert.equal(elements.beautyAccessDomainRows.innerHTML,'');
});

test('美人桥域名独立新增启停解绑，多域名地址投影与解析同步',()=>{
 const f=windowFixture(),m=f.model;m.setEnabled('HS-TEN-001',true);m.setEnabled('HS-TEN-018',true);
 const original=m.portalDomains('HS-TEN-001')[0],b=m.portalAddress('HS-TEN-018');
 const custom=m.addPortalDomain('HS-TEN-001','beauty-a.example.com');assert.equal(custom.status,'未启用');assert.throws(()=>m.resolvePortal('https://beauty-a.example.com/login'));assert.throws(()=>m.addPortalDomain('HS-TEN-018','beauty-a.example.com'));
 m.changePortalDomain('HS-TEN-001',custom.id,'启用域名');assert.equal(m.portalAddresses('HS-TEN-001').length,2);assert.equal(m.resolvePortal('https://beauty-a.example.com/login'),'HS-TEN-001');
 m.changePortalDomain('HS-TEN-001',original.id,'停用域名');assert.equal(m.portalAddress('HS-TEN-001'),'https://beauty-a.example.com/login');assert.throws(()=>m.resolvePortal('https://'+original.value+'/login'));
 m.changePortalDomain('HS-TEN-001',custom.id,'停用域名');assert.equal(m.portalAddress('HS-TEN-001'),'');assert.equal(m.portalAddress('HS-TEN-018'),b);
 m.changePortalDomain('HS-TEN-001',custom.id,'解绑域名');assert.equal(m.portalDomains('HS-TEN-001').length,1);assert.throws(()=>m.changePortalDomain('HS-TEN-001',original.id,'解绑域名'));
 assert.throws(()=>m.changePortalDomain('HS-TEN-018',original.id,'启用域名'));
 m.setEnabled('HS-TEN-001',false);assert.throws(()=>m.addPortalDomain('HS-TEN-001','other.example.com'));assert.equal(m.portalDomains('HS-TEN-001')[0].status,'已停用');m.setEnabled('HS-TEN-001',true);assert.equal(m.portalAddress('HS-TEN-001'),'');
});
function beautyDomainActionFixture(){
 const f=windowFixture(),m=f.model;m.setEnabled('HS-TEN-001',true);
 const tenant={id:'HS-TEN-001',status:'正常',name:'A',domains:[{id:'D',value:'ordinary.example.com',subjectType:'tenant',status:'可用'}],merchantDomains:[]},fields=new Map(),errors=[],receipts=[];
 const el=id=>{if(!fields.has(id))fields.set(id,{value:''});return fields.get(id)};
 let allowed=true,scoped=true;
 const source=read('public/legacy/sources/tenants.html');
 const context=vm.createContext({window:f.window,appState:{currentConfirm:'新增美人桥商户端域名',confirmDomainId:''},tenants:[tenant],document:{getElementById:el},currentTenantForAction:()=>tenant,getPermissions:()=>({canAccessProcess:allowed}),tenantInCurrentScope:()=>scoped,showFormError:(id,text)=>errors.push(text),finishTenantAction:(t,r)=>receipts.push(r),platformNow:()=> '2026-11-19 12:00:00',currentDomainForAction:()=>m.portalDomains(tenant.id).find(row=>row.id===context.appState.confirmDomainId)});
 for(const [start,end] of [['    function allTenantDomains(','    function domainActionButtons('],['    function applyTenantConfirm(','    function bindEvents(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context);
 el('newCustomDomain').value='beauty-a.example.com';el('domainAddReason').value='新增入口';el('domainActionReason').value='验证域名入口';el('domainAction2fa').value='123456';
 return {...f,context,tenant,errors,receipts,el,permission:v=>allowed=v,scope:v=>scoped=v,apply:()=>vm.runInContext('applyTenantConfirm()',context)};
}
test('平台美人桥域名提交复验权限范围授权，重复普通域名不保存',()=>{
 for(const kind of ['permission','scope','grant','closed','duplicate','reason']){
  const f=beautyDomainActionFixture(),before=JSON.stringify(f.model.portalDomains(f.tenant.id));
  if(kind==='permission')f.permission(false);if(kind==='scope')f.scope(false);if(kind==='grant')f.model.setEnabled(f.tenant.id,false);if(kind==='closed')f.tenant.status='关闭';if(kind==='duplicate')f.el('newCustomDomain').value='ordinary.example.com';if(kind==='reason')f.el('domainAddReason').value='';
  f.apply();assert.equal(f.errors.length,1,kind);assert.equal(f.receipts.length,0,kind);assert.equal(JSON.stringify(f.model.portalDomains(f.tenant.id)),before,kind);
 }
 const f=beautyDomainActionFixture();f.apply();assert.equal(f.model.portalDomains(f.tenant.id).length,2);assert.equal(f.receipts[0].action,'录入美人桥商户端域名');
});
test('平台美人桥域名启停需原因和验证码，撤权或范围变化不提交',()=>{
 for(const kind of ['permission','scope','grant','reason','otp']){
  const f=beautyDomainActionFixture(),row=f.model.portalDomains(f.tenant.id)[0];f.context.appState.currentConfirm='停用域名';f.context.appState.confirmDomainId=row.id;
  if(kind==='permission')f.permission(false);if(kind==='scope')f.scope(false);if(kind==='grant')f.model.setEnabled(f.tenant.id,false);if(kind==='reason')f.el('domainActionReason').value='';if(kind==='otp')f.el('domainAction2fa').value='12';f.apply();assert.equal(f.errors.length,1,kind);assert.equal(f.receipts.length,0,kind);assert.equal(f.model.portalDomains(f.tenant.id)[0].status,'可用');
 }
 const f=beautyDomainActionFixture(),row=f.model.portalDomains(f.tenant.id)[0];f.context.appState.currentConfirm='停用域名';f.context.appState.confirmDomainId=row.id;f.apply();assert.equal(f.model.portalDomains(f.tenant.id)[0].status,'已停用');assert.equal(f.receipts.length,1);assert.doesNotMatch(JSON.stringify(f.receipts),/123456/);
});
test('美人桥域名更改跨标签同步并影响当前租户地址',()=>{
 const f=windowFixture(),m=f.model;m.setEnabled('HS-TEN-001',true);const row=m.portalDomains('HS-TEN-001')[0];let calls=0;m.subscribe(()=>calls++,f.window);
 f.handlers.get('storage')({key:'huisheng.beauty.portal-domains.v1',newValue:JSON.stringify({'HS-TEN-001':[{...row,status:'已停用'}]})});assert.equal(m.portalAddress('HS-TEN-001'),'');assert.equal(calls,1);
});

test('共享域名解析不依赖已卸载业务端的URL全局',()=>{
 const window={document:{},localStorage:{getItem:()=>null,setItem(){}},addEventListener(){},removeEventListener(){}};window.top=window;
 const context=vm.createContext({window,URL,Map,Set,JSON,Error});vm.runInContext(read('src/beauty-model.js'),context);window.HSBeautyDemo.setEnabled('HS-TEN-001',true);context.URL=undefined;assert.equal(window.HSBeautyDemo.resolvePortal(window.HSBeautyDemo.portalAddress('HS-TEN-001')),'HS-TEN-001');
});
