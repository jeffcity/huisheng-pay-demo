import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/legacy/sources/orders.html',import.meta.url),'utf8');
const times=source.slice(source.indexOf('    const platformOrderTimeSamples ='),source.indexOf('    function platformOrderStatsFor(rows)'));
function fixture(refunds=new Map()){
 const c={platformRefundJourneyFacts:refunds,escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};vm.createContext(c);vm.runInContext(times+';this.api={platformOrderTimesFor,platformOrderTimesText,renderPlatformOrderTimes};',c);return {c,api:c.api};
}
test('订单四类时间独立取值，不把更新时间当成支付或回调时间',()=>{const {api}=fixture();const row=['HS-C-260717-000941','','','','成功','','','','2099-01-01 00:00:00'];const t=api.platformOrderTimesFor(row);assert.equal(t.createdAt,'2026-07-17 14:31:08');assert.equal(t.paidAt,'2026-07-17 14:32:50');assert.equal(t.channelCallbackAt,'2026-07-17 14:33:20');assert.equal(t.merchantNotifyAt,'2026-07-17 14:33:26');const pending=api.platformOrderTimesFor(['HS-P-260717-000336']);assert.equal(pending.paidAt,'');assert.equal(pending.channelCallbackAt,'');assert.doesNotMatch(api.renderPlatformOrderTimes(row),/2099/);});
test('未知订单时间保持缺省，修改返回值不会改变时间样例',()=>{const {api}=fixture();assert.equal(api.platformOrderTimesText(['unknown']),'创建：—；支付：—；通道回调：—；通知商户：—');const t=api.platformOrderTimesFor(['HS-C-260717-000941']);t.paidAt='changed';assert.notEqual(api.platformOrderTimesFor(['HS-C-260717-000941']).paidAt,'changed');});
test('退款不将主动查单或成功状态时间冒充支付和回调时间',()=>{const r={statusTimeline:[{at:'2026-07-17 14:48:20',status:'processing'},{at:'2026-07-17 14:50:42',status:'succeeded'}],channelResults:[{obtainedVia:'callback',resultAt:'2026-07-17 14:50:42'},{obtainedVia:'query',resultAt:'2026-07-17 15:00:00'}]};const {api}=fixture(new Map([['refund',r]]));const t=api.platformOrderTimesFor(['refund']);assert.equal(t.createdAt,'2026-07-17 14:48:20');assert.equal(t.paidAt,'');assert.equal(t.channelCallbackAt,'2026-07-17 14:50:42');r.paidAt='2026-07-17 14:50:40';assert.equal(api.platformOrderTimesFor(['refund']).paidAt,r.paidAt);});
test('展示按创建支付回调排列且字段值转义',()=>{const {api}=fixture(new Map([['x',{statusTimeline:[{at:'<img src=x>'}],paidAt:'<script>',channelResults:[]}]]));const html=api.renderPlatformOrderTimes(['x']);assert(html.indexOf('创建')<html.indexOf('支付'));assert(html.indexOf('支付')<html.indexOf('回调'));assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script/);});
test('订单导出时间字段与表头对齐并包含四类时间',()=>{const {c,api}=fixture(),row=['HS-C-260717-000941','汇盛东南亚','','代收','成功','CNY 8,600.00','','','2026-07-17 14:33:20'];const config=source.slice(source.indexOf("      orders: {"),source.indexOf("      audit: {",source.indexOf("      orders: {")));const columns=vm.runInContext(config.match(/columns: (\[[^\n]+\])/)[1],c);Object.assign(c,{pages:{orders:{columns}},currentPlatformAccount:{dataScope:{scopeCode:'platform.all_tenants'}},filteredRowsForPage:()=>[row],platformExportRowsCoveredByScope:(_id,rows)=>rows,orderFactsFor:()=>({identifiers:{}}),platformOrderQueryMetaFor:()=>({tenantId:'HS-TEN-001',tenantName:'汇盛东南亚'}),platformOrderExceptionNode:()=>'',platformOrderResultSummary:()=>'',platformOrderNotificationResult:()=>''});const a=source.indexOf('    function platformExportRows(pageId, dataScope'),b=source.indexOf('    function platformExportSecuritySnapshot',a);vm.runInContext(source.slice(a,b),c);const out=c.platformExportRows('orders');assert.equal(out.fieldSnapshot.length,out.rowSnapshot[0].length);assert.equal(out.fieldSnapshot.at(-1),'订单时间（UTC+8）');assert.equal(out.rowSnapshot[0].at(-1),api.platformOrderTimesText(row));});

test('通道结果和商户通知为独立事实，发送失败不抹去发送时间，待投递不推算时间',()=>{
 const {api}=fixture();const failed=api.platformOrderTimesFor(['HS-C-260717-000902']);
 assert.equal(failed.channelCallbackAt,'2026-07-17 15:51:40');assert.equal(failed.merchantNotifyAt,'2026-07-17 15:53:10');
 const queued=api.platformOrderTimesFor(['HS-P-260717-000219']);assert.notEqual(queued.channelCallbackAt,'');assert.equal(queued.merchantNotifyAt,'');
 const html=api.renderPlatformOrderTimes(['HS-C-260717-000902']);assert.equal((html.match(/class="platform-order-time"/g)||[]).length,4);assert(html.indexOf('通道回调：')<html.indexOf('通知商户：'));assert.match(html,/是否送达看通知结果/);
});
test('退款没有商户发送记录时不从回调、更新时间或状态复制；显式发送记录独立显示',()=>{
 const refund={statusTimeline:[{at:'2026-07-17 14:48:20'}],channelResults:[{obtainedVia:'callback',resultAt:'2026-07-17 14:50:42'},{obtainedVia:'query',resultAt:'2026-07-17 15:00:00'}],callbackAt:'2099-01-01 00:00:00',updatedAt:'2099-01-01 00:00:00',notificationStatus:'已通知'};
 const {api}=fixture(new Map([['refund',refund]]));assert.equal(api.platformOrderTimesFor(['refund']).merchantNotifyAt,'');
 refund.merchantNotifyAt='2026-07-17 15:01:06';const times=api.platformOrderTimesFor(['refund']);assert.equal(times.merchantNotifyAt,refund.merchantNotifyAt);assert.equal(times.channelCallbackAt,'2026-07-17 14:50:42');assert.doesNotMatch(api.platformOrderTimesText(['refund']),/2099/);
});
