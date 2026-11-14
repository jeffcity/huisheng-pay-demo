import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const w={};const ctx=vm.createContext({window:w,Map,Set});
for(const path of ['surfaces/tenant/src/daily-reports-model.js','surfaces/tenant/src/channel-records-model.js','src/platform-reports-model.js'])vm.runInContext(read(path),ctx);
const m=w.HSPlatformReports,d=w.HSDailyReports,r=w.HSChannelRecords;
const tenants=[{id:'HS-TEN-001',name:'汇盛东南亚'},{id:'HS-TEN-018',name:'北辰支付'},{id:'HS-TEN-029',name:'蓝盛拆分租户'}],ids=tenants.map(t=>t.id),plain=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));

test('平台十二页与租户字段和类型一致，仅增加租户列，旧报表模块退出',()=>{
 const modules=JSON.parse(read('src/legacy/modules.json')),nav=read('src/modules.js');
 for(const route of ['channel-collect-prepay-change','channel-payout-receipt-change'])assert.equal(m.configs[route],undefined);
 assert.equal(Object.keys(m.configs).length,12);assert.equal(Object.values(m.configs).filter(c=>c.category==='日终').length,6);
 for(const [route,c] of Object.entries(m.configs)){
  const base=c.category==='日终'?d:r;assert.deepEqual(plain(c.columns.filter(([key])=>key!=='tenant')),plain(base.configs[route].columns));assert.deepEqual(plain(c.types),plain(base.configs[route].types));
  assert.equal(modules[route].label,c.title);assert.equal(modules[route].subgroup,c.category);assert(nav.includes(route));assert(!c.columns.some(([,name])=>/USDT|代理费/.test(name)));
 }
 for(const route of ['tenant-daily-report','channel-daily-report','ledger','agent-collect-daily'])assert.equal(modules[route],undefined);
});
test('多租户样例为不同租户逐行标识，默认租户与租户端既有值一致，不修改其模型',()=>{
 for(const [route,c] of Object.entries(m.configs)){
  const base=c.category==='日终'?d:r,original=base.fixtures(route,ids[0]),before=JSON.stringify(original),rows=m.fixtures(route,tenants);
  assert.equal(rows.length,original.length*tenants.length);assert.equal(new Set(rows.map(row=>row.key)).size,rows.length);
  assert(rows.every(row=>row.tenant.includes(row.tenantId)&&row.currency==='CNY'));
  for(const [index,row] of rows.filter(row=>row.tenantId===ids[0]).entries())for(const key of base.configs[route].columns.map(([key])=>key))assert.equal(row[key],original[index][key]);
  assert.equal(JSON.stringify(original),before);assert.equal(base.fixtures(route,ids[1]).length,0);
 }
});
test('全租户、单租户、同编号实体组合筛选在日终和记录全部路由隔离',()=>{
 for(const route of Object.keys(m.configs)){
  const rows=m.fixtures(route,tenants),all=m.query(rows,route,{currency:'CNY'},ids);assert.equal(all.length,rows.length);
  const own=m.query(rows,route,{tenant:ids[1],currency:'CNY'},ids);assert.equal(own.length,rows.length/3);assert(own.every(row=>row.tenantId===ids[1]));
  if(m.configs[route].kind!=='platform'){
   const choices=m.entities(route,tenants,ids[1],ids);assert(choices.length>0);assert(choices.every(([id,label])=>id.startsWith(ids[1]+':')&&label.includes(tenants[1].name)));
   const entity=m.query(rows,route,{tenant:ids[1],entity:choices[0][0],currency:'CNY'},ids);assert(entity.length>0);assert(entity.every(row=>row.tenantId===ids[1]&&row.entityKey===choices[0][0]));
   assert.equal(m.query(rows,route,{tenant:ids[0],entity:choices[0][0],currency:'CNY'},ids).length,0);
  }
  assert.equal(m.query(rows,route,{tenant:'NOT-ALLOWED',currency:'CNY'},ids).length,0);
  assert.equal(m.query(rows,route,{currency:'USDT'},ids).length,0);
 }
});
test('角色全租户与指定租户范围闭合，缺少授权默认无数据，CSV也不越界',()=>{
 assert.equal(m.accessible(tenants,null,false).length,0);assert.equal(m.accessible(tenants,{dataScope:{scopeCode:'unknown'}},false).length,0);
 assert.equal(m.accessible(tenants,{dataScope:{scopeCode:'platform.all_tenants'}},false).length,3);
 assert.deepEqual(plain(m.accessible(tenants,{dataScope:{scopeCode:'platform.assigned_tenants',tenantIds:[ids[1],'missing']}},false)),[tenants[1]]);
 for(const route of Object.keys(m.configs)){
  const rows=m.fixtures(route,tenants),subset=m.query(rows,route,{currency:'CNY'},[ids[1]]);assert(subset.length);assert(subset.every(row=>row.tenantId===ids[1]));
  assert.equal(m.query(rows,route,{},[]).length,0);assert.equal(m.query(rows,route,{tenant:ids[0]},[ids[1]]).length,0);
  const csv=m.csv(rows,route,[ids[1]]);assert(csv.includes(tenants[1].name));assert(!csv.includes(tenants[0].name));assert(!csv.includes(tenants[2].name));
 }
});
test('跨租户日终合计仅加交易统计、重算成交率，快照不加总',()=>{
 for(const route of Object.keys(d.configs)){
  const rows=m.fixtures(route,tenants),sum=m.totals(rows,route,ids);
  assert.equal(sum.amount,rows.reduce((a,row)=>a+row.amount,0));assert.equal(sum.total,rows.reduce((a,row)=>a+row.total,0));
  assert.equal(sum.rate,(sum.success/sum.total*100).toFixed(2)+'%');for(const key of ['walletStart','walletEnd','prepayStart','prepayEnd','merchantBalance'])assert.equal(sum[key],undefined);
  const subset=m.query(rows,route,{tenant:ids[1],start:'2026-10-25',end:'2026-10-25'},ids);assert(subset.length);assert(subset.every(row=>row.date==='2026-10-25'));
 }
});
test('日期与订单过滤沿用租户规则，跨租户导出完整记录包含租户信息且防公式',()=>{
 for(const [route,c] of Object.entries(m.configs)){
  const rows=m.fixtures(route,tenants),csv=m.csv(rows,route,ids);assert(csv.includes('"租户"'));assert(!csv.includes('undefined'));assert.equal(csv.split('\r\n').length,rows.length+(c.category==='日终'?2:1));
  assert.throws(()=>m.query(rows,route,{start:'2026-10-26',end:'2026-10-20'},ids));assert.throws(()=>m.query(rows,route,{start:'2026-02-30'},ids));
  const one={...rows[1],tenant:'=FAKE'};assert(m.csv([one],route,ids).includes("'=FAKE"));
  if(c.category==='账户记录'){
   for(const row of rows)assert.equal(Math.round(Number(row.before)*100)+Math.round(Number(row.change)*100),Math.round(Number(row.after)*100));
   const row=rows.find(r=>r.platformOrder!=='-')||rows[1],filtered=m.query(rows,route,{tenant:row.tenantId,currency:'CNY',platformOrder:row.platformOrder,merchantOrder:row.merchantOrder,type:row.type,start:row.at,end:row.at},ids);assert.equal(filtered.length,1);assert.equal(filtered[0].key,row.key);
  }
 }
});
test('平台页面只读且脚本可解析，租户端模型及备注编辑仍保持单租户',()=>{
 for(const file of ['report','ledger']){
  const html=read('public/legacy/sources/'+file+'.html');for(const script of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
  assert(html.includes('tenantFilter'));assert.doesNotMatch(html,/\bfetch\(|localStorage\.setItem|tenantData\(|setTenantBilling|data-remark-key|remarkDialog/);
  assert(html.includes("can('query')"));assert(html.includes("can('export')"));assert(html.includes('allowedIds'));
 }
 assert(read('surfaces/tenant/public/legacy/sources/reports.html').includes('data-remark-key'));
 assert(read('surfaces/tenant/src/daily-reports-model.js').includes("tenantId!=='HS-TEN-001'"));
 const system=read('public/legacy/sources/system.html');assert(system.includes("...platformReportPages"));assert(system.includes("['查询','导出']"));assert(system.includes('delete grants.platformReport;delete grants.platformLedger'));
});

test('新报表权限可解析登录目标，旧报表权限不再产生旧目标',()=>{
 const login=read('public/legacy/sources/login.html');const start=login.indexOf('    const platformReportNavigation ='),end=login.indexOf('    function getPlatformLoginPermissionFact',start),resolver=login.indexOf('    function resolvePlatformLoginRouteFromFact'),next=login.indexOf('\n    function ',resolver+10);
 const context=vm.createContext({window:{HSPlatformReports:m,location:{pathname:'/index.html'}},Map,Set,structuredClone});vm.runInContext(login.slice(start,end)+login.slice(resolver,next),context);
 for(const [route,c] of Object.entries(m.configs)){
  const fact={status:'active',factStatus:'current',permissionVersion:1,menuVersion:1,roles:[{enabled:true,pagePermissions:[c.permissions.view]}]};
  context.fact=fact;const result=vm.runInContext('resolvePlatformLoginRouteFromFact(fact)',context);assert.equal(result.routeResult,'page');assert.equal(result.target.id,route);
  const url=new URL(result.target.href,'http://127.0.0.1:4174/index.html');assert.equal(url.pathname,'/index.html');assert.equal(url.searchParams.get('platformPage'),route);assert.equal(url.hash,'#'+route);
 }
 for(const permission of ['platform.report.view','platform.ledger.view']){context.fact={status:'active',factStatus:'current',permissionVersion:1,menuVersion:1,roles:[{enabled:true,pagePermissions:[permission]}]};assert.equal(vm.runInContext('resolvePlatformLoginRouteFromFact(fact)',context).routeResult,'no_page');}
 assert(read('src/App.jsx').includes("get('platformPage')"));
});

test('登录票据可抵达十二个新报表并保留指定租户范围，错误目标不可使用票据',()=>{
 const guardSource=read('public/legacy/sources/authGuard.html');
 for(const [route,c] of Object.entries(m.configs)){
  const store=new Map(),sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k),key:i=>[...store.keys()][i],get length(){return store.size}};
  const setup=(href,targets)=>{const document={currentScript:{dataset:{platformRouteTargets:targets?JSON.stringify(targets):undefined}},documentElement:{dataset:{}},createElement:()=>({}),head:{appendChild(){}},readyState:'loading',addEventListener(){}};const window={location:new URL(href),sessionStorage};const ctx=vm.createContext({window,document,URL,URLSearchParams,Date,Math,Uint8Array,Map,Set});vm.runInContext(guardSource,ctx);return window.HSPlatformAuthRouteGuard;};
  const issuer=setup('http://127.0.0.1:4174/index.html',null).registerLoginIssuer();assert(issuer);assert(issuer.beginAuthentication({isTrusted:true,target:{id:'loginForm'}},{account:'reports.demo'}).ok);assert(issuer.completeAuthentication({account:'reports.demo'}).ok);
  const fact={account:'reports.demo',status:'active',factStatus:'current',permissionVersion:1,menuVersion:1,roles:[{enabled:true,pagePermissions:[c.permissions.view],actionPermissions:[c.permissions.query]}],dataScope:{scopeCode:'platform.assigned_tenants',tenantIds:[ids[1]]}};
  const issued=issuer.issueNavigationTicket({account:fact.account,fact,route:{target:{pagePermission:c.permissions.view,href:'/index.html?platformPage='+route+'#'+route}}});assert(issued.ok);
  const entries=[...store];const consumer=setup(issued.href,{[route]:c.permissions.view});assert.equal(consumer.allowBusinessBoot(),true);assert.equal(m.accessible(tenants,consumer.getAuthorizationContext()).length,1);assert.equal(consumer.getAuthorizationContext().actionPermissions.includes(c.permissions.export),false);
  store.clear();entries.forEach(([k,v])=>store.set(k,v));const wrong=new URL(issued.href);wrong.hash='wrong-report';assert.equal(setup(wrong.href,{[route]:c.permissions.view}).allowBusinessBoot(),false);
 }
});

test('所有旧内页render及下钻都经新报表桥接，未授权不回退旧数据',async()=>{
 const embed=read('src/embed.js').replace(/^import [^\n]+\n/gm,'').replace(/export async function/g,'async function');
 const html='<html><head></head><body><script>function renderPage(id) { oldCalls++; }\nfunction enterPlatformSource(target, { filter = "", filterIndex = 0, filters = null, context = "" } = {}) {\n oldCalls++;renderPage(target); }<\/script></body></html>';
 const window={__HS_EMBEDDED_SOURCES__:{home:html,authGuard:''}},ctx=vm.createContext({window,providerModel:'',settlementModel:'',feeWalletModel:'',platformDashboardModel:'',Map,Set});vm.runInContext(embed,ctx);
 const result=await ctx.prepareEmbeddedDocument('home','home'),messages=[],alerts=[];
 const runtime=vm.createContext({window:{location:new URL('http://127.0.0.1:4174/index.html'),parent:{postMessage:m=>messages.push(m)},alert:x=>alerts.push(x),HSPlatformAuthRouteGuard:{isAuthRouteMode:()=>false}},oldCalls:0});
 const scripts=[...result.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 vm.runInContext(scripts.find(s=>s.includes('window.__hsRedirectRetiredReport =')),runtime);vm.runInContext(scripts.find(s=>s.includes('function renderPage(id)')),runtime);
 vm.runInContext("renderPage('report');enterPlatformSource('ledger');",runtime);assert.equal(runtime.oldCalls,0);assert.equal(messages[0].module,'platform-collect-daily');assert.equal(messages[1].module,'channel-pay-change');
 runtime.window.HSPlatformAuthRouteGuard={isAuthRouteMode:()=>true,createAuthorizedNavigation:()=>({ok:false})};vm.runInContext("enterPlatformSource('report')",runtime);assert.equal(runtime.oldCalls,0);assert.equal(messages.length,2);assert.equal(alerts.length,1);
});

test('已授权首页旧下钻发行新票据，目标报表消费新票据并保持指定租户范围',async()=>{
 const guardSource=read('public/legacy/sources/authGuard.html'),store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k),key:i=>[...store.keys()][i],get length(){return store.size}};
 let nonce=0;const setup=(href,targets)=>{const document={currentScript:{dataset:{platformRouteTargets:targets?JSON.stringify(targets):undefined}},documentElement:{dataset:{}},createElement:()=>({}),head:{appendChild(){}},readyState:'loading',addEventListener(){}};const window={location:new URL(href),sessionStorage:storage,crypto:{randomUUID:()=>'11111111-2222-3333-4444-'+String(++nonce).padStart(12,'0')}};vm.runInContext(guardSource,vm.createContext({window,document,URL,URLSearchParams,Date,Math,Uint8Array,Set,Map}));return window.HSPlatformAuthRouteGuard;};
 const target='platform-collect-daily',c=m.configs[target],issuer=setup('http://127.0.0.1:4174/index.html',null).registerLoginIssuer(),account='bridge.demo';
 issuer.beginAuthentication({isTrusted:true,target:{id:'loginForm'}},{account});issuer.completeAuthentication({account});
 const fact={account,status:'active',factStatus:'current',permissionVersion:1,menuVersion:1,roles:[{enabled:true,pagePermissions:['platform.dashboard.view',c.permissions.view],actionPermissions:[c.permissions.query]}],dataScope:{scopeCode:'platform.assigned_tenants',tenantIds:[ids[1]]}};
 const initial=issuer.issueNavigationTicket({account,fact,route:{target:{pagePermission:'platform.dashboard.view',href:'/index.html?platformPage=home#home'}}});assert(initial.ok);
 const sourceGuard=setup(initial.href,{home:'platform.dashboard.view'});assert(sourceGuard.allowBusinessBoot());assert.equal([...store.keys()].filter(k=>k.startsWith('hs.platform.auth-route.ticket.')).length,0);
 const embed=read('src/embed.js').replace(/^import [^\n]+\n/gm,'').replace(/export async function/g,'async function'),context=vm.createContext({window:{__HS_EMBEDDED_SOURCES__:{home:'<html><head></head><body></body></html>',authGuard:''}},providerModel:'',settlementModel:'',feeWalletModel:'',platformDashboardModel:''});vm.runInContext(embed,context);
 const html=await context.prepareEmbeddedDocument('home','home'),script=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].find(match=>match[1].includes('window.__hsRedirectRetiredReport ='))[1];let destination='';
 const runtime=vm.createContext({window:{HSPlatformAuthRouteGuard:sourceGuard,location:new URL(initial.href),top:{location:{assign:href=>destination=href}},parent:{postMessage(){throw Error('auth navigation must issue a fresh ticket')}},alert(){throw Error('authorized route denied')}}});vm.runInContext(script,runtime);assert(vm.runInContext("window.__hsRedirectRetiredReport('report')",runtime));assert(destination);assert.notEqual(new URL(destination).searchParams.get('authTicket'),new URL(initial.href).searchParams.get('authTicket'));
 const targetGuard=setup(destination,{[target]:c.permissions.view});assert(targetGuard.allowBusinessBoot());assert.deepEqual(plain(targetGuard.getAuthorizationContext().dataScope),fact.dataScope);assert.equal(targetGuard.getAuthorizationContext().actionPermissions.includes(c.permissions.export),false);
});
