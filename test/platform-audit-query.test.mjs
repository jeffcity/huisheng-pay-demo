import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/legacy/sources/audit.html',import.meta.url),'utf8');
function extract(name){const a=source.indexOf('    function '+name+'(');assert(a>=0,name);const b=source.indexOf('\n    function ',a+1);return source.slice(a,b);}
function fixture(){
 const c=vm.createContext({pages:{tenants:{rows:[['HS-TEN-001','汇盛东南亚'],['HS-TEN-017','蓝盛拆分租户'],['HS-TEN-029','北辰支付']]},audit:{rows:[],columns:['日志编号','发生时间','操作账号 / 层级','动作','对象','结果','风险','来源 IP','操作']}},platformOrderQueryMeta:new Map(),platformFundMeta:new Map(),platformWorkOrders:[],filterState:{audit:Array(7).fill('')},currentPlatformAccount:{dataScope:{scopeCode:'platform.all_tenants'}},escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
 const a=source.indexOf('    const platformAuditMeta ='),b=source.indexOf('    let platformLatestReceipt',a);vm.runInContext(source.slice(a,b),c);
 for(const name of ['datePartUtc8','normalizedUtc8DateRange','inUtc8DateRange','platformAuditMetaFor','platformAuditIdentifiersFor','platformTenantIdFromKnownIdentifier','platformAuditTenantIdForRow','platformAuditTenantFor','auditSearchTime','auditSearchError','auditSearchMatches','platformAuditRecordFor','platformAuditActorIdentity','platformAuditNormalizedFilters','platformAuditDisplayValues','platformAuditMatchesFilters','platformExportTenantIdForRow','platformExportRowsCoveredByScope','renderPlatformAuditFilters','platformExportRows','platformSafeSummary'])vm.runInContext(extract(name),c);
 c.document={createElement:()=>({set innerHTML(v){this.textContent=v;}})};c.pages.ledger={rows:[]};c.filteredRowsForPage=()=>c.pages.audit.rows;return c;
}
test('操作端决定实体筛选，隐藏租户商户条件不参与查询',()=>{
 const c=fixture(),r=c.pages.audit.rows.find(row=>row[0]==='AL-TEN-20261105-0006');
 for(const [i,value] of [[0,'TENANT.OP'],[1,'租户'],[2,'198.51.100.24'],[3,'汇盛']]){const f=['','租户','','','','',''];f[i]=value;assert(c.platformAuditMatchesFilters(r,f),value);f[i]='no-match';assert.equal(c.platformAuditMatchesFilters(r,f),false);}
 assert(c.platformAuditMatchesFilters(r,['tenant.ops','租户','198.51.100.24','HS-TEN-001','应忽略的商户条件','2026-11-05T10:18:24','2026-11-05T10:18:24']));
 const merchant=c.pages.audit.rows[0];assert(c.platformAuditMatchesFilters(merchant,['','商户','','应忽略的租户条件','东盛','','']));assert.equal(c.platformAuditMatchesFilters(merchant,['','商户','','','星河','','']),false);
 assert.equal(c.platformAuditMatchesFilters(r,['','','198.51.100.2','','','','']),false);
 assert(c.platformAuditMatchesFilters(r,['','','','应忽略','应忽略','','']));
});
test('UTC8秒级边界、单边与自然日查询，拒绝无效日期和逆序',()=>{
 const c=fixture(),r=[...c.pages.audit.rows[0]],f=Array(7).fill('');f[5]='2026-11-05';f[6]='2026-11-05';
 for(const time of ['2026-11-05 00:00:00','2026-11-05 23:59:59']){r[1]=time;assert(c.platformAuditMatchesFilters(r,f));}
 r[1]='2026-11-06 00:00:00';assert.equal(c.platformAuditMatchesFilters(r,f),false);
 assert(c.auditSearchError({from:'2026-02-30'}));assert(c.auditSearchError({from:'2026-11-06',to:'2026-11-05'}));
 assert.equal(c.auditSearchTime('2026-11-05T10:18:24'),Date.parse('2026-11-05T02:18:24Z'));
});
test('平台授权租户先于检索和导出执行，非法范围拒绝',()=>{
 const c=fixture(),rows=c.pages.audit.rows;assert.equal(rows.length,9);
 const scope={scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-001']};const allowed=c.platformExportRowsCoveredByScope('audit',rows,scope);assert.equal(allowed.length,5);assert(allowed.every(r=>c.platformAuditTenantFor(r).id==='HS-TEN-001'));
 assert.equal(c.platformExportRowsCoveredByScope('audit',rows,{scopeCode:'invalid'}).length,0);
 const out=c.platformExportRows('audit',scope);assert.equal(out.rowSnapshot.length,5);assert.equal(out.fieldSnapshot.length,8);out.rowSnapshot.forEach(row=>assert.equal(row.length,8));
});
test('平台开发表格八项事实加详情操作，不串列、不改变原始事实',()=>{
 const c=fixture(),r=c.pages.audit.rows[0],before=JSON.stringify(r),values=c.platformAuditDisplayValues(r);assert.equal(values.length,8);assert.equal(values[2],'dongsheng.finance / 商户\n商户编号：MCH-1188');assert.equal(values[5],'成功');assert.equal(values[7],'198.51.100.61');assert.equal(JSON.stringify(r),before);
 const summary=c.platformSafeSummary({...c.pages.audit,detailKind:'audit'},r);assert.match(summary,/操作账号 \/ 层级：dongsheng.finance \/ 商户/);assert.match(summary,/来源 IP：198.51.100.61/);
});
test('新版检索可输入账号、三端与实体，不列举其他租户账号',()=>{
 const c=fixture();c.filterState.audit[0]='<img src=x>';const html=c.renderPlatformAuditFilters();assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);for(const label of ['发生时间','操作账号','操作端','来源 IP','租户','商户','重置','审计导出'])assert(html.includes(label),label);
 assert.equal((html.match(/data-page-filter=/g)||[]).length,7);
});
test('无效新条件不覆盖已查询状态，导出读取已生效条件',()=>{
 const c=fixture(),prior=['tenant.ops','','','','','',''];c.filterState.audit=prior;c.currentPage='audit';c.pages.audit.filters=Array(7).fill('');let message='';const values=['finance','','','','','2026-11-06T00:00:00','2026-11-05T00:00:00'];c.document.querySelector=selector=>{const i=Number(selector.match(/"(\d+)"/)[1]);return {value:values[i],removeAttribute(){},setAttribute(){},focus(){}}};c.showToast=v=>message=v;vm.runInContext(extract('capturePageFilters'),c);
 assert.equal(c.capturePageFilters({applyAudit:true}),false);assert.equal(c.filterState.audit,prior);assert(message);assert(c.capturePageFilters());assert.equal(c.filterState.audit,prior);
});

test('操作者编号随操作端展示，订单关联商户不冒充租户操作者',()=>{const c=fixture();c.platformOrderQueryMeta.set('HS-C-260717-000941',{tenantId:'HS-TEN-001',merchantId:'MCH-2031',merchantName:'星河游戏'});const row=c.pages.audit.rows.find(row=>row[0]==='AL-TEN-20261105-0002');const record=c.platformAuditRecordFor(row);assert.equal(record.merchantId,'MCH-2031');assert.equal(c.platformAuditActorIdentity(record),'租户编号：HS-TEN-001');assert.match(c.platformAuditDisplayValues(row)[2],/租户编号：HS-TEN-001/);assert.doesNotMatch(c.platformAuditDisplayValues(row)[2],/MCH-2031/);assert.equal(c.platformAuditActorIdentity({surface:'平台',tenantId:'HS-TEN-001'}),'');assert.equal(c.platformAuditActorIdentity({surface:'商户'}),'商户编号：—');});
