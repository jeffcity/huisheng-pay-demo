import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/legacy/sources/audit.html',import.meta.url),'utf8');
function extract(name){const a=source.indexOf('    function '+name+'(');assert(a>=0,name);const b=source.indexOf('\n    function ',a+1);return source.slice(a,b);}
function fixture(){
 const c=vm.createContext({pages:{tenants:{rows:[['HS-TEN-001','汇盛东南亚'],['HS-TEN-017','蓝盛拆分租户'],['HS-TEN-029','北辰支付']]},audit:{rows:[],columns:['日志编号','发生时间','租户','操作账号 / 层级','动作','对象','结果','风险','来源 IP','操作']}},platformOrderQueryMeta:new Map(),platformFundMeta:new Map(),platformWorkOrders:[],filterState:{audit:Array(8).fill('')},currentPlatformAccount:{dataScope:{scopeCode:'platform.all_tenants'}},escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
 const a=source.indexOf('    const platformAuditMeta ='),b=source.indexOf('    let platformLatestReceipt',a);vm.runInContext(source.slice(a,b),c);
 for(const name of ['datePartUtc8','normalizedUtc8DateRange','inUtc8DateRange','platformAuditMetaFor','platformAuditIdentifiersFor','platformTenantIdFromKnownIdentifier','platformAuditTenantIdForRow','platformAuditTenantFor','platformAuditDisplayValues','platformAuditMatchesFilters','platformExportTenantIdForRow','platformExportRowsCoveredByScope','renderPlatformAuditFilters','platformExportRows','platformSafeSummary'])vm.runInContext(extract(name),c);
 c.document={createElement:()=>({set innerHTML(v){this.textContent=v;}})};c.pages.ledger={rows:[]};c.filteredRowsForPage=()=>c.pages.audit.rows;return c;
}
test('开发基线查询：关键词、账号、模块、类型、明细与对象编号分别生效',()=>{
 const c=fixture(),r=c.pages.audit.rows[0],f=Array(8).fill('');
 for(const [i,value] of [[0,'MCH-1188'],[1,'tenant.ops'],[2,'商户'],[3,'登录白名单'],[4,'保存'],[5,'1188']]){const q=[...f];q[i]=value;assert(c.platformAuditMatchesFilters(r,q),value);q[i]='no-match';assert.equal(c.platformAuditMatchesFilters(r,q),false);}
 f[0]='保存';f[1]='tenant.ops';f[5]='MCH-1188';assert(c.platformAuditMatchesFilters(r,f));f[1]='tenant';assert.equal(c.platformAuditMatchesFilters(r,f),false);
});
test('UTC+8 日期按完整自然日包含起止边界，不混用旧索引',()=>{
 const c=fixture(),r=[...c.pages.audit.rows[0]],f=Array(8).fill('');f[6]='2026-11-05';f[7]='2026-11-05';
 for(const time of ['2026-11-05 00:00:00','2026-11-05 23:59:59']){r[1]=time;assert(c.platformAuditMatchesFilters(r,f));}
 for(const time of ['2026-11-04 23:59:59','2026-11-06 00:00:00']){r[1]=time;assert.equal(c.platformAuditMatchesFilters(r,f),false);}
});
test('平台可见多租户审计，受限账号只见授权租户且账号选项不泄漏其他租户',()=>{
 const c=fixture(),rows=c.pages.audit.rows;assert.equal(rows.length,6);
 const scope={scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-001']};const allowed=c.platformExportRowsCoveredByScope('audit',rows,scope);assert.equal(allowed.length,3);assert(allowed.every(r=>c.platformAuditTenantFor(r).id==='HS-TEN-001'));
 c.currentPlatformAccount.dataScope={scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-029']};const html=c.renderPlatformAuditFilters();assert.match(html,/tenant.admin/);assert.doesNotMatch(html,/value="tenant.ops"|value="tenant.finance"/);
 assert.equal(c.platformExportRowsCoveredByScope('audit',rows,{scopeCode:'invalid'}).length,0);
});
test('详情与导出同一租户投影、列数和值对齐，不修改原始事实行',()=>{
 const c=fixture(),r=c.pages.audit.rows[0],before=JSON.stringify(r);const values=c.platformAuditDisplayValues(r);assert.equal(values[2],'汇盛东南亚 / HS-TEN-001');assert.equal(values[3],'tenant.ops / 租户');assert.equal(values[6],'成功');assert.equal(values[8],'198.51.100.24');assert.equal(JSON.stringify(r),before);const summary=c.platformSafeSummary({...c.pages.audit,detailKind:'audit'},r);assert.match(summary,/租户：汇盛东南亚 \/ HS-TEN-001/);assert.match(summary,/来源 IP：198.51.100.24/);assert.match(summary,/结果：成功/);
 const out=c.platformExportRows('audit',{scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-001']});assert.equal(out.rowSnapshot.length,3);for(const row of out.rowSnapshot){assert.equal(row.length,out.fieldSnapshot.length);assert.match(row[2],/HS-TEN-001/);}assert.equal(out.fieldSnapshot[2],'租户');
});
test('筛选控件采用开发环境字段，输入和账号值转义，审计无修改删除操作',()=>{
 const c=fixture();c.filterState.audit[0]='<img src=x>';const html=c.renderPlatformAuditFilters();assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|所属层级|执行结果|风险级别|来源 IP/);for(const label of ['关键词','操作账号','动作分类','对象类型','动作明细','对象编号','UTC+8 时间','查询日志','重置','审计导出'])assert(html.includes(label),label);
 const branch=source.slice(source.indexOf("        if (pageId === 'audit') {",source.indexOf('function renderTableRows')),source.indexOf("        if (pageId === 'orders') {",source.indexOf('function renderTableRows')));assert.doesNotMatch(branch,/data-delete|data-edit/);assert.match(branch,/data-detail/);
});

 test('审计菜单 sourceKey 对应被验证的 audit.html 源',()=>{const modules=JSON.parse(fs.readFileSync(new URL('../src/legacy/modules.json',import.meta.url),'utf8'));assert.match(JSON.stringify(modules),/"sourceKey":"audit"/);assert.match(source,/function renderPlatformAuditFilters/);assert.match(extract('renderPage'),/document.body.dataset.currentPage = id/);});
