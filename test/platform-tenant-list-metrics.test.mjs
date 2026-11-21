import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/legacy/sources/tenants.html',import.meta.url),'utf8');
function fixture(auth=null){
 const window={document:{},HSBeautyDemo:{enabled:()=>false}};window.top=window;
 const tenants=[{id:'HS-TEN-001',name:'汇盛东南亚',contact:'Lin',status:'正常'},{id:'HS-TEN-017',name:'其他',contact:'',status:'正常'}];
 let scope=new Set(tenants.map(t=>t.id)),authorization=auth,downloads=0;
 window.HSPlatformAuthRouteGuard={getAuthorizationContext:()=>authorization,allowBusinessBoot:()=>true};
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{add(){}});return elements.get(id);};
 const ctx=vm.createContext({window,Date,Map,Set,JSON,Error,BigInt,URL:{createObjectURL:()=>{downloads++;return 'blob:demo';},revokeObjectURL(){}},Blob,Option:function(){},
 platformTenantAuthorization:auth,platformTenantActionPermissions:new Set(auth?.actionPermissions||[]),
 appState:{filtered:tenants},tenantInCurrentScope:t=>scope.has(t?.id),tenantBusinessDirections:()=>['代收','代付'],escapeHtml:s=>String(s).replaceAll('<','&lt;'),showToast(){},
 document:{getElementById:el,querySelectorAll:()=>[],createElement:()=>({click(){}})}});
 for(const name of ['provider-model','settlement-model','tenant-fee-wallet-model'])vm.runInContext(fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),ctx);
 function load(a,b){const start=source.indexOf('    function '+a+'('),end=source.indexOf('    function '+b+'(',start);assert(start>0&&end>start);vm.runInContext(source.slice(start,end),ctx);}
 load('tenantStatisticsDate','renderRows');load('exportTenantList','openDetailModal');load('applyPlatformTenantAuthorization','openTenantCreatedResult');
 const run=(s)=>vm.runInContext(s,ctx);
 return {window,tenants,run,el,scope:ids=>{scope=new Set(ids);},auth:v=>{authorization=v;},downloads:()=>downloads};
}
const billing={collection:{mode:'percentage',value:'1'},payout:{mode:'perTransaction',value:'2'}};
const success=(id,direction,amount,day)=>({id,tenantId:'HS-TEN-001',direction,amount,currency:'CNY',status:'成功',completedAt:day+' 12:00:00'});
test('昨日按UTC+8自然日，年/月边界与空日准确',()=>{
 const f=fixture();for(const [now,want] of [['2027-01-01 00:00:00','2026-12-31'],['2028-03-01 00:00:01','2028-02-29']]){f.window.HSProviderDemo.now=()=>now;assert.equal(f.run('tenantStatisticsDate()'),want);}
 assert.equal(f.run("tenantListStatistics(appState.filtered[0],{from:'2026-11-04',to:'2026-11-04'}).collection.amount"),'0.00');
 assert.equal(f.run("tenantStatisticsMoney('-1234567.005')"),'-1,234,567.005');
});
test('昨日实时统计不被月账冻结，成功快照、当前费率和共用余额正确显示，查询不扣费',()=>{
 const f=fixture(),w=f.window.HSFeeWallets,b=f.window.HSProviderDemo,s=f.window.HSTenantSettlements;b.setTenantBilling('HS-TEN-001',billing);
 w.recordSuccess(success('BEFORE-BILL','代收','10.00','2026-11-02'));s.generate('HS-TEN-001','2026-11');
 w.recordSuccess(success('AFTER-BILL-C','代收','100.00','2026-11-04'));w.recordSuccess(success('AFTER-BILL-P','代付','50.00','2026-11-04'));
 b.setTenantBilling('HS-TEN-001',{collection:{mode:'percentage',value:'9'},payout:{mode:'percentage',value:'0'}});b.now=()=> '2026-11-05 00:00:01';
 const before=JSON.stringify(w.wallet('HS-TEN-001')),m=f.run('tenantListStatistics(appState.filtered[0])');
 assert.equal(m.collection.amount,'100.00');assert.equal(m.payout.amount,'50.00');assert.equal(m.collection.exactFee,'1.00');assert.equal(m.payout.exactFee,'2.00');assert.equal(m.exactTotal,'3.00');assert.equal(m.rates.collection.value,'9');assert.equal(m.balance,'933.84688');
 assert.equal(w.daily('HS-TEN-001','2026-11').totals.collection.amount,'10.00');
 const rows=f.run('tenantListExportRows()');assert.equal(rows[0].length,17);assert.equal(rows[1][7],'100.00');assert.equal(rows[1][13],'3.00');assert.equal(rows[1][16],m.balance);assert.equal(JSON.stringify(w.wallet('HS-TEN-001')),before);
});
test('未配置与零费率区分，待计费成功包含跑量但不假算免费，过滤租户范围',()=>{
 const f=fixture(),w=f.window.HSFeeWallets;w.recordSuccess(success('PENDING','代收','20.00','2026-11-04'));
 const m=f.run("tenantListStatistics(appState.filtered[0],{from:'2026-11-04',to:'2026-11-04'})");assert.equal(m.collection.pendingCount,1);assert.equal(m.collection.amount,'20.00');assert.match(f.run("tenantStatisticsCells(tenantListStatistics(appState.filtered[0],{from:'2026-11-04',to:'2026-11-04'}))"),/待计费1笔/);
 assert.equal(f.run("tenantStatisticsRate({mode:'percentage',value:'0'})"),'0%');assert.equal(f.run("tenantStatisticsRate({mode:'percentage',value:''})"),'未设置');
 f.scope(['HS-TEN-001']);assert.equal(f.run('tenantListExportRows().length'),2);assert.throws(()=>f.run("tenantListStatistics(appState.filtered[1])"),/无权/);
});
test('有查看无导出权限、授权后导出及撤权后再次执行均复验',()=>{
 const f=fixture({actionPermissions:[],pagePermissions:[],account:'readonly'});f.run('applyPlatformTenantAuthorization()');assert.equal(f.el('exportTenants').hidden,true);assert.equal(f.el('exportTenants').disabled,true);f.run('exportTenantList()');assert.equal(f.downloads(),0);assert.throws(()=>f.run('tenantListExportRows()'),/无.*权限/);
 f.auth({actionPermissions:['platform.tenant.export']});f.run('exportTenantList()');assert.equal(f.downloads(),1);
 f.auth({actionPermissions:[]});f.run('exportTenantList()');assert.equal(f.downloads(),1);
});

test('跨月跑量和系统费共用成功日期范围，导出保持一致', () => {
 const f=fixture(), wallet=f.window.HSFeeWallets, provider=f.window.HSProviderDemo;
 provider.setTenantBilling('HS-TEN-001',billing);
 provider.now=()=> '2026-12-03 00:00:01';
 wallet.recordSuccess({...success('PRE-RANGE','代收','999.00','2026-11-29'), completedAt:'2026-11-29 23:59:59'});
 wallet.recordSuccess({...success('START-RANGE','代收','100.01','2026-11-30'), completedAt:'2026-11-30 00:00:00'});
 wallet.recordSuccess({...success('END-RANGE','代付','75.26','2026-12-01'), completedAt:'2026-12-01 23:59:59'});
 wallet.recordSuccess({...success('POST-RANGE','代收','900.00','2026-12-02'), completedAt:'2026-12-02 00:00:00'});
 wallet.recordSuccess({...success('UNSUCCESSFUL','代付','500.00','2026-12-01'), status:'失败'});
 f.run("appState.statisticsRange = {from:'2026-11-30',to:'2026-12-01'}");
 const stats=f.run('tenantListStatistics(appState.filtered[0])');
 assert.equal(stats.collection.amount,'100.01');
 assert.equal(stats.payout.amount,'75.26');
 assert.equal(stats.collection.exactFee,'1.0001');
 assert.equal(stats.payout.exactFee,'2.00');
 const [,row]=f.run('tenantListExportRows()');
 assert.deepEqual(Array.from(row.slice(5,9)),['2026-11-30','2026-12-01','100.01','75.26']);
 assert.deepEqual(Array.from(row.slice(11,14)),['1.0001','2.00','3.0001']);
 assert.throws(()=>wallet.statisticsForRange('HS-TEN-001','2026-12-02','2026-12-01'),/开始日期不能晚于/);
});

test('已扣费和待计费订单的成功时间以原快照为准，同步日期变化不会重复计入跑量', () => {
 const f = fixture(), provider = f.window.HSProviderDemo;
 const wallet = f.window.HSFeeWallets, settlements = f.window.HSTenantSettlements;
 provider.setTenantBilling('HS-TEN-001',{collection:billing.collection,payout:{mode:'perTransaction',value:''}});
 const input = date => [
  ['RANGE-SYNC-PAID','汇盛东南亚','-','代收','成功','CNY 100.00','-','-',`${date} 12:00:00`],
  ['RANGE-SYNC-PENDING','汇盛东南亚','-','代付','成功','CNY 75.00','-','-',`${date} 12:00:00`]
 ];
 settlements.syncOrders(input('2026-11-13'));
 settlements.syncOrders(input('2026-11-14'));
 const original = wallet.statisticsForRange('HS-TEN-001','2026-11-13','2026-11-13');
 const changed = wallet.statisticsForRange('HS-TEN-001','2026-11-14','2026-11-14');
 assert.equal(original.collection.amount,'100.00');
 assert.equal(original.collection.exactFee,'1.00');
 assert.equal(original.payout.amount,'75.00');
 assert.equal(original.payout.pendingCount,1);
 assert.equal(changed.collection.amount,'0.00');
 assert.equal(changed.payout.amount,'0.00');
 assert.equal(changed.pendingCount,0);
});
