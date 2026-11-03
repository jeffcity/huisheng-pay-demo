import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/overview.html',import.meta.url),'utf8');
function fixture(){
 const c={escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};vm.createContext(c);
 const map=source.slice(source.indexOf('    const tenantTrackingTimeSamples ='),source.indexOf('    const modulePages ='));
 const helpers=source.slice(source.indexOf('    function tenantTrackingTimesFor('),source.indexOf('    function renderTenantGlobalOrderTrackingPage('));
 vm.runInContext(map+helpers+';this.api={tenantTrackingTimesFor,tenantTrackingTimeCell};',c);
 const a=source.indexOf('      "全局订单追踪": {'),b=source.indexOf('      "业务待办": {',a);vm.runInContext('this.page=({'+source.slice(a,b)+'})["全局订单追踪"];',c);return {c,api:c.api,page:c.page};
}
test('租户全局订单追踪七行均有独立四类时间，更新值不替代通知事实',()=>{
 const {api,page}=fixture();assert.equal(page.columns[8],'订单时间（UTC+8）');assert.equal(page.rows.length,7);
 for(const row of page.rows){assert.equal(row.length,page.columns.length);assert.equal((row[8].match(/class="tracking-order-time"/g)||[]).length,4);for(const label of ['创建：','支付：','通道回调：','通知商户：'])assert(row[8].includes(label));}
 const times=api.tenantTrackingTimesFor('HS-C-260717-000941');assert.equal(times.paidAt,'2026-07-17 14:32:50');assert.equal(times.channelCallbackAt,'2026-07-17 14:33:20');assert.equal(times.merchantNotifyAt,'2026-07-17 14:33:26');assert.doesNotMatch(api.tenantTrackingTimeCell('HS-C-260717-000941','2099-01-01'),/tracking-time-value">2099/);
 assert.equal(api.tenantTrackingTimesFor('HS-P-260717-002134').paidAt,'');times.paidAt='changed';assert.notEqual(api.tenantTrackingTimesFor('HS-C-260717-000941').paidAt,'changed');
});
test('缺省四时间不从更新时间推导且属性与内容均转义',()=>{
 const {api}=fixture();const html=api.tenantTrackingTimeCell('unknown','<img src=x>');assert.equal((html.match(/tracking-time-value">—/g)||[]).length,4);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/是否送达看通知结果/);
});
test('租户全局追踪导出包含四时间标签并保持字段数据对齐',()=>{
 const {c,page}=fixture();Object.assign(c,{modulePages:{'全局订单追踪':page},state:{activePage:'other'},currentTenantAccount:{dataScope:{},authorizedMerchantIds:[]},tenantExportRowCoveredByScope:()=>true});const a=source.indexOf('    function tenantExportRows('),b=source.indexOf('    function tenantExportSecuritySnapshot(',a);vm.runInContext(source.slice(a,b),c);const out=c.tenantExportRows('全局订单追踪');assert.equal(out.fieldSnapshot[8],'订单时间（UTC+8）');assert.equal(out.rowSnapshot.length,7);for(const row of out.rowSnapshot){assert.equal(row.length,out.fieldSnapshot.length);for(const label of ['创建：','支付：','通道回调：','通知商户：'])assert(row[8].includes(label));}
});

test('同一平台订单号在平台和租户全局查询中四时间事实一致',()=>{
 const platform=fs.readFileSync(new URL('../public/legacy/sources/orders.html',import.meta.url),'utf8');const start=platform.indexOf('    const platformOrderTimeSamples ='),end=platform.indexOf('    function platformOrderTimesFor(',start);const p={};vm.createContext(p);vm.runInContext(platform.slice(start,end)+';this.samples=platformOrderTimeSamples;',p);const {api,page}=fixture();let shared=0;for(const row of page.rows){const id=row[0].match(/>(HS-[^<]+)</)[1];const expected=p.samples.get(id);if(!expected)continue;shared++;assert.deepEqual(JSON.parse(JSON.stringify(api.tenantTrackingTimesFor(id))),JSON.parse(JSON.stringify(expected)),id);}assert.equal(shared,6);
});
