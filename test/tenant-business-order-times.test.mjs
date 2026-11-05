import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/overview.html',import.meta.url),'utf8');
function extract(name){const a=source.indexOf('    function '+name+'(');assert(a>=0,name);return source.slice(a,source.indexOf('\n    function ',a+1));}
function fixture(){
 const c=vm.createContext({state:{autoRefresh:false,activePage:'other'},modulePages:{},currentTenantAccount:{dataScope:{scopeCode:'tenant.current'},authorizedMerchantIds:[]},escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
 const a=source.indexOf('    const tenantBusinessOrderTimeSamples ='),b=source.indexOf('    const tenantTrackingTimeSamples =',a);vm.runInContext(source.slice(a,b),c);
 for(const name of ['blueOrderTag','blueCopyButton','blueOrderNumberCell','blueMerchantCell','tenantBusinessOrderTimesFor','tenantBusinessOrderTimePairs','tenantBusinessOrderTimeCell','blueCollectActionCell','bluePayoutActionCell','blueTenantOrderManagementPage','tenantExportRowCoveredByScope','tenantExportRows'])vm.runInContext(extract(name),c);
 return c;
}
const labels=['提交：','支付：','通道回调：','通知商户：'];
test('代收代付订单所有行四时间独立标记，列数及表头对齐',()=>{
 const c=fixture();for(const name of ['法币代收订单','法币代付订单']){const p=c.blueTenantOrderManagementPage(name);assert.equal(p.rows.length,6);const ix=p.columns.indexOf('订单时间（UTC+8）');assert(ix>=0);assert.equal(p.columnWidths[ix],196);for(const row of p.rows){assert.equal(row.length,p.columns.length);assert.equal((row[ix].match(/class="order-time-line"/g)||[]).length,4);for(const label of labels)assert(row[ix].includes(label));}}
});
test('受理前驳回仅通知商户，未付款与无通道记录不伪造支付回调',()=>{
 const c=fixture(),r=c.tenantBusinessOrderTimesFor('HS-P-260717-000219');assert.equal(r.paidAt,'');assert.equal(r.channelCallbackAt,'');assert.equal(r.merchantNotifyAt,'2026-07-17 15:18:40');
 for(const id of ['HS-C-260717-000031','HS-C-260716-000058','HS-P-260717-002134']){const t=c.tenantBusinessOrderTimesFor(id);assert.equal(t.paidAt,'');assert.equal(t.channelCallbackAt,'');assert.equal(t.merchantNotifyAt,'');}
 assert.equal((c.tenantBusinessOrderTimeCell('unknown').match(/order-time-value">—/g)||[]).length,4);
});
test('成功支付及两种通知读取各自事件，返回值修改不改变样例',()=>{
 const c=fixture(),t=c.tenantBusinessOrderTimesFor('HS-P-260717-000336');assert.equal(t.submittedAt,'2026-07-17 10:29:40');assert.equal(t.paidAt,'2026-07-17 10:31:04');assert.equal(t.channelCallbackAt,'2026-07-17 10:31:18');assert.equal(t.merchantNotifyAt,'2026-07-17 10:31:33');t.paidAt='changed';assert.notEqual(c.tenantBusinessOrderTimesFor('HS-P-260717-000336').paidAt,'changed');
 vm.runInContext(`tenantBusinessOrderTimeSamples.set('unsafe',{submittedAt:'<img>',paidAt:'',channelCallbackAt:'',merchantNotifyAt:'<script>'})`,c);const html=c.tenantBusinessOrderTimeCell('unsafe');assert.doesNotMatch(html,/<img>|<script>/);assert.match(html,/&lt;img/);assert.match(html,/是否送达看通知状态/);
});
test('业务页导出沿用实际展示配置，含完整四时间及原商户范围',()=>{
 const c=fixture();for(const name of ['法币代收订单','法币代付订单']){c.modulePages[name]={columns:['过期配置'],rows:[]};const out=c.tenantExportRows(name),ix=out.fieldSnapshot.indexOf('订单时间（UTC+8）');assert(ix>=0);assert.equal(out.rowSnapshot.length,6);for(const row of out.rowSnapshot){assert.equal(row.length,out.fieldSnapshot.length);for(const label of labels)assert(row[ix].includes(label));}const scoped=c.tenantExportRows(name,{scopeCode:'tenant.allowed_merchants',merchantIds:['MCH-1188']});assert(scoped.rowSnapshot.every(row=>row.join(' ').includes('MCH-1188')));assert.equal(scoped.rowSnapshot.length,name==='法币代付订单'?1:0);}
});
test('两业务订单状态及提交快照保持原有值，不读取全局追踪覆盖',()=>{
 const c=fixture(),collect=c.blueTenantOrderManagementPage('法币代收订单'),payout=c.blueTenantOrderManagementPage('法币代付订单');assert.match(collect.rows[2][6],/异常/);assert.match(collect.rows[3][6],/处理中/);assert.match(payout.rows[0][6],/已打款/);assert.match(payout.rows[4][6],/已驳回/);assert.equal(c.tenantBusinessOrderTimesFor('HS-P-260717-000251').submittedAt,'2026-07-17 15:02:20');assert.doesNotMatch(extract('tenantBusinessOrderTimesFor'),/tenantTracking|updatedAt|status/);
});
