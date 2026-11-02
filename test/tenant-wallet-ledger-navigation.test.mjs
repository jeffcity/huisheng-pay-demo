import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/overview.html',import.meta.url),'utf8');
function fixture(){
 const window={document:{}};window.top=window;const state={activePage:'法币代付订单',systemFeeMonth:'2026-07',walletLedgerFilters:{keyword:'previous',type:'all',from:'',to:''}},notices=[];let allowed=true;
 const ctx=vm.createContext({window,Date,Map,Set,JSON,Error,BigInt,state,currentTenantAccount:{tenantId:'HS-TEN-001'},canAccessTenantPage:()=>allowed,showToast:t=>notices.push(t),closeDrawer(){},document:{querySelector:selector=>{assert.equal(selector,'[data-nav="平台钱包"]');return {click(){state.activePage='平台钱包';}};}}});
 for(const name of ['provider-model','settlement-model','tenant-fee-wallet-model'])vm.runInContext(fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),ctx);
 const a=source.indexOf('    function openMergedWalletLedger('),b=source.indexOf('    function returnTenantSourcePage(',a);assert(a>0&&b>a);vm.runInContext(source.slice(a,b),ctx);
 return {state,notices,block:()=>{allowed=false;},open:(...args)=>ctx.openMergedWalletLedger(...args),enter:(...args)=>ctx.enterModuleWithSource(...args)};
}
test('旧账户流水详情入口跳转系统费，带入订单号与日期，统计月份不变',()=>{
 const f=fixture();const count=f.enter('账户流水',{},[{index:0,value:'000941'},{index:4,value:'2026-07-17'}]);assert.equal(f.state.activePage,'平台钱包');assert.equal(f.state.walletLedgerFilters.keyword,'000941');assert.equal(f.state.walletLedgerFilters.from,'2026-07-17');assert.equal(f.state.walletLedgerFilters.to,'2026-07-17');assert.equal(count,1);assert.equal(f.state.systemFeeMonth,'2026-07');
});
test('旧流水入口遵循目标页访问权限，不伪造成功跳转或改变原查询',()=>{
 const f=fixture();f.block();assert.equal(f.open('000941'),0);assert.equal(f.state.activePage,'法币代付订单');assert.equal(f.state.walletLedgerFilters.keyword,'previous');assert.match(f.notices[0],/没有目标页面权限/);
});
