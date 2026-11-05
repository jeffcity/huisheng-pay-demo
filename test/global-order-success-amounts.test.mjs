import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sources=[['platform','public/legacy/sources/orders.html'],['tenantTracking','surfaces/tenant/public/legacy/sources/overview.html']];
for(const [prefix,file] of sources){
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const a=source.indexOf('    function '+prefix+'SuccessfulOrderAmounts('),b=source.indexOf('    function '+prefix+'SuccessAmountCard(',a);
 const context=vm.createContext({});vm.runInContext(source.slice(a,b)+';this.amounts='+prefix+'SuccessfulOrderAmounts;',context);
 const plain=records=>JSON.parse(JSON.stringify(context.amounts(records)));
 const record=(direction,status,amount)=>({direction,status,amount});
 test(prefix+'仅明确成功的CNY代收代付计入，退款及迟到成功异常不计入',()=>{
  const input=[record('代收','成功','CNY 100.10'),record('代付','成功','CNY 2,000.20'),record('代收退款','成功','CNY 900.00')];
  for(const status of ['处理中','失败','已取消','异常待处理','通知成功'])input.push(record('代收',status,'CNY 999.00'));
  input.push(record('代付','成功','USDT 100.00'));
  assert.deepEqual(plain(input),{collection:'CNY 100.10',payout:'CNY 2,000.20',total:'CNY 2,100.30'});
 });
 test(prefix+'小数精确相加、大金额不溢出、空筛选为0',()=>{
  assert.equal(plain([record('代收','成功','CNY 0.10'),record('代付','成功','CNY 0.20')]).total,'CNY 0.30');
  assert.equal(plain([record('代收','成功','CNY 9007199254740993.99'),record('代付','成功','CNY 0.01')]).total,'CNY 9,007,199,254,740,994.00');
  assert.deepEqual(plain([]),{collection:'CNY 0.00',payout:'CNY 0.00',total:'CNY 0.00'});
 });
 test(prefix+'只汇总提供的筛选结果，格式异常和负金额不计入',()=>{
  const all=[record('代收','成功','CNY 1.00'),record('代付','成功','CNY 5.00')];assert.equal(plain(all.filter(r=>r.direction==='代付')).total,'CNY 5.00');
  for(const amount of ['CNY -1.00','CNY 1,2.00','CNY 1.001','CNY 1e3','CNY Infinity','<img>'])assert.equal(plain([record('代收','成功',amount)]).total,'CNY 0.00');
 });
}

test('租户成功金额再次应用授权商户范围，按全部匹配行而非当前可见页汇总',()=>{
 const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/overview.html',import.meta.url),'utf8');
 const amounts={};const target={querySelector:selector=>({set textContent(value){amounts[selector.match(/"([^"]+)"/)[1]]=value;}})};
 const ctx=vm.createContext({state:{activePage:'全局订单追踪'},currentTenantAccount:{dataScope:{scopeCode:'tenant.allowed_merchants',merchantIds:['MCH-1']}},document:{querySelector:()=>target}});
 const a=source.indexOf('    function tenantTrackingSuccessfulOrderAmounts('),b=source.indexOf('    function renderTenantGlobalOrderTrackingPage(',a);vm.runInContext(source.slice(a,b),ctx);
 const sa=source.indexOf('    function tenantExportRowCoveredByScope('),sb=source.indexOf('    function tenantNotificationEffectiveMerchantScope(',sa);vm.runInContext(source.slice(sa,sb),ctx);
 const cell=(text,span=text)=>({textContent:text,querySelector:()=>({textContent:span})});
 const row=(merchant,amount,hidden)=>({hidden,cells:[cell('id'),cell('no'),cell(merchant),{textContent:'代收 '+amount,querySelector:s=>({textContent:s==='strong'?amount:'代收'})},cell('成功')]});
 ctx.rows=[row('MCH-1','CNY 10.10',false),row('MCH-1','CNY 0.20',true),row('MCH-2','CNY 999.00',false)];
 vm.runInContext('refreshTenantTrackingSuccessAmounts(rows)',ctx);assert.equal(amounts.total,'CNY 10.30');assert.equal(amounts.payout,'CNY 0.00');
});
