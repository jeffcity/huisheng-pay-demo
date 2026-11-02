import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('public/legacy/sources/home.html');
const w={},context=vm.createContext({window:w});
for(const p of ['src/provider-model.js','src/settlement-model.js','src/platform-dashboard-model.js'])vm.runInContext(read(p),context);
const m=w.HSPlatformDashboard,plain=v=>JSON.parse(JSON.stringify(v)),date='2026-11-02';
const base={date,cutoffAt:date+' 13:40:20',facts:m.createFacts(date),tenants:w.HSTenantSettlements.tenants,providers:w.HSProviderDemo.providers,scope:{scopeCode:'platform.all_tenants',tenantIds:[]}};
const sum=(rows,key,field)=>rows.reduce((n,r)=>n+r[key][field],0);
test('三层同源：平台与通道商、租户分别按代收代付对账，使用正式租户目录',()=>{
 const v=m.summarize(base);assert.equal(v.tenants.length,5);assert.equal(v.providers.length,4);assert.equal(v.tenants.find(t=>t.id==='HS-TEN-018').name,'北辰支付');
 for(const key of ['collection','payout','total'])for(const field of ['orderCount','terminalCount','successCount','successAmountMinor']){assert.equal(v[key][field],sum(v.providers,key,field));assert.equal(v[key][field],sum(v.tenants,key,field));}
 assert.equal(v.total.successAmountMinor,v.collection.successAmountMinor+v.payout.successAmountMinor);assert(v.total.orderCount>0);
});
test('成功率按笔数加权，处理中不进分母，零业务不显示虚假成功率',()=>{
 const facts=[{...base.facts[0],orderCount:12,terminalCount:10,successCount:9,successAmountMinor:90000},{...base.facts[0],orderCount:110,terminalCount:100,successCount:50,successAmountMinor:500000}];
 const v=m.summarize({...base,facts});assert.equal(v.total.successRate,59/110);assert.notEqual(v.total.successRate,.7);assert.equal(v.total.orderCount,122);
 const zero=v.tenants.find(t=>t.id==='HS-TEN-061');assert.equal(m.rate(zero.total),'—');assert.equal(m.money(zero.total),'0.00');assert.equal(m.rate(v.payout),'—');
});
test('先按授权租户过滤再汇总通道商，未知和空授权失败关闭',()=>{
 const scope={scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-018']},v=m.summarize({...base,scope});assert.equal(v.tenants.length,1);assert.equal(v.tenants[0].id,'HS-TEN-018');assert(!v.allTenants);
 const expected=base.facts.filter(r=>r.tenantId==='HS-TEN-018').reduce((n,r)=>n+r.successAmountMinor,0);assert.equal(v.total.successAmountMinor,expected);assert.equal(sum(v.providers,'total','successAmountMinor'),expected);
 for(const scope of [undefined,{scopeCode:'unknown'},{scopeCode:'platform.assigned_tenants',tenantIds:[]}]){const v=m.summarize({...base,scope});assert.equal(v.total.orderCount,0);assert.equal(v.providers.length,0);assert.equal(v.tenants.length,0);}
});
test('仅当前统计日、CNY、代收代付和已接入通道参与汇总，不变更源事实',()=>{
 const before=JSON.stringify(base.facts),v=m.summarize(base),bad=[{...base.facts[0],currency:'USDT'},{...base.facts[0],direction:'代收退款'},{...base.facts[0],date:'2026-11-01'},{...base.facts[0],providerId:'UNKNOWN'},{...base.facts[0],tenantId:'UNKNOWN'}];
 assert.equal(m.summarize({...base,facts:[...base.facts,...bad]}).total.orderCount,v.total.orderCount);assert.equal(JSON.stringify(base.facts),before);
 const unsupported=v.providers.find(p=>p.id==='V-002').payout;assert.equal(unsupported.orderCount,0);assert.equal(v.providers.find(p=>p.id==='V-003').collection.orderCount,0);
});
test('相同统计日样例稳定，新租户和新增通道商不凭空产生交易',()=>{
 assert.deepEqual(plain(m.createFacts(date)),plain(base.facts));assert.throws(()=>m.createFacts('wrong'));
 const v=m.summarize({...base,tenants:[...base.tenants,{id:'new',name:'新租户'}],providers:[...base.providers,{id:'new-provider',name:'新通道商',adapterStatus:'已接入'}]});assert.equal(v.tenants.find(t=>t.id==='new').total.orderCount,0);assert.equal(v.providers.find(t=>t.id==='new-provider').total.orderCount,0);
});
test('导出与页面使用同一范围和截止快照，包含三层两业务且表头对齐',()=>{
 const v=m.summarize({...base,scope:{scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-018']}}),out=m.exportRows(v);
 assert.equal(out.rowSnapshot.length,(1+v.providers.length+v.tenants.length)*3);assert(out.rowSnapshot.every(r=>r.length===out.fieldSnapshot.length&&r[5]==='CNY'&&r[11]===base.cutoffAt));assert.equal(out.rowSnapshot[0][6],m.money(v.collection));assert.equal(out.rowSnapshot[0][10],m.rate(v.collection));assert(!JSON.stringify(out).includes('汇盛东南亚'));
 const scope={scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-018']};const c=vm.createContext({window:{HSPlatformDashboard:m},currentPlatformAccount:{dataScope:scope},platformDashboardView:scope=>m.summarize({...base,scope})});const a=source.indexOf('    function platformExportRows(pageId, dataScope'),b=source.indexOf('    function platformExportSecuritySnapshot',a);vm.runInContext(source.slice(a,b),c);assert.deepEqual(plain(c.platformExportRows('home')),plain(out));
});
test('首页挂载前保留页面鉴权，刷新不改订单和资金，导出继续复用权限码',()=>{
 const render=source.slice(source.indexOf('    function renderPage(id)'),source.indexOf('    function renderPlatformListState'));
 assert(render.indexOf('!canAccessPlatformPage(id)')<render.indexOf('renderPlatformDashboardHome()'));assert.match(source,/home: 'platform.dashboard.export'/);assert.match(source,/platformDashboardSnapshot = null;\s+renderPage\('home'\)/);assert.match(read('src/embed.js'),/sourceKey === 'home' \? '<script>'\+platformDashboardModel/);assert.match(source,/getDashboardSnapshot:/);
});

test('首页实际导出任务不夹带旧退款元数据，重试保留原截止时间和文件快照',()=>{
 const scope={scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-018']},view=m.summarize({...base,scope});
 const c=vm.createContext({window:{HSPlatformDashboard:m},Date,currentPlatformAccount:{dataScope:scope,canExport:true,name:'范围测试'},pages:{home:{title:'首页数据看板',filters:[]}},platformExportPermissionByPage:{home:'platform.dashboard.export'},hasPlatformActionPermission:()=>true,utc8DateTime:()=>date+' 16:00:00',platformDashboardView:()=>view,clonePlatformExportValue:plain,platformExportSecuritySnapshot:()=>({dataScope:scope,sensitiveAccess:false,permanentlyExcluded:[],fieldPolicy:'页面相同脱敏值'}),platformExportRows:()=>m.exportRows(view),platformExportSnapshotDigest:v=>JSON.stringify(v),currentFilterSummary:()=>view.date,platformExportSequence:1,platformExportTasks:new Map(),addPlatformExportAudit:()=>{},platformRefundAggregate:{tenantId:'HS-TEN-001',formalCount:99999},PLATFORM_REFUND_JOURNEY_FACTS_REVISION:'old'});
 const a=source.indexOf('    function createPlatformExportTask('),b=source.indexOf('    function openPlatformExportResult(',a);vm.runInContext(source.slice(a,b),c);
 const task=c.createPlatformExportTask('home','CSV');assert.equal(task.refundAggregateSnapshot,null);assert.equal(task.factRevision,'platform-dashboard-cny-v1');assert.equal(task.cutoffAt,base.cutoffAt);assert.equal(task.normalizedFilterSnapshot.filters.date,date);assert.equal(task.normalizedFilterSnapshot.filters.currency,'CNY');assert.deepEqual(plain(task.fileDefinitionSnapshot.rowSnapshot),plain(m.exportRows(view).rowSnapshot));assert(!JSON.stringify(task).includes('HS-TEN-001'));
 c.platformDashboardView=()=>({...view,cutoffAt:'2099-01-01 00:00:00'});const retried=c.createPlatformExportTask('home','CSV',task);assert.equal(retried.cutoffAt,task.cutoffAt);assert.deepEqual(plain(retried.fileDefinitionSnapshot.rowSnapshot),plain(task.fileDefinitionSnapshot.rowSnapshot));
 c.hasPlatformActionPermission=()=>false;assert.equal(c.createPlatformExportTask('home','CSV'),null);
});
