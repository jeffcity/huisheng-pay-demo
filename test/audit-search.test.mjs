import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const tenant=fs.readFileSync(new URL('surfaces/tenant/public/legacy/sources/system.html',root),'utf8');
function fn(source,name,indent=''){const a=source.indexOf(indent+'function '+name+'('),b=source.indexOf('\n'+indent+'function ',a+1);assert(a>=0,name);return source.slice(a,b).trim();}
for(const [file,indent] of [['public/legacy/sources/audit.html','    '],['surfaces/tenant/public/legacy/sources/system.html','']])test(file+' uses same UTC8 exact IP and AND contract',()=>{const src=fs.readFileSync(new URL(file,root),'utf8'),c=vm.createContext({});for(const name of ['auditSearchTime','auditSearchError','auditSearchMatches'])vm.runInContext(fn(src,name,indent),c);const record={occurredAt:'2026-11-05 10:30:01',account:'Finance.Op',surface:'商户',sourceIp:'2001:db8::31',tenantId:'HS-TEN-001',tenantName:'汇盛',merchantId:'MCH-1188',merchantName:'东盛'};const filter={account:'finance',surface:'商户',sourceIp:'2001:DB8::31',tenant:'001',merchant:'东盛',from:'2026-11-05T10:30:01',to:'2026-11-05T10:30:01'};assert(c.auditSearchMatches(record,filter));for(const key of ['account','surface','sourceIp','tenant','merchant'])assert.equal(c.auditSearchMatches(record,{...filter,[key]:'x'}),false,key);assert.equal(c.auditSearchMatches(record,{...filter,to:'2026-11-05T10:30:00'}),false);assert.equal(c.auditSearchMatches(record,{from:'2026-11-06'}),false);assert(c.auditSearchMatches(record,{to:'2026-11-05'}));assert(c.auditSearchError({from:'2026-02-30'}));});
test('tenant audit scope never includes another tenant or merchant',()=>{
 const rows=[['A','登录安全','x','登录','text','admin','192.0.2.1','成功','2026-11-05 10:00:00'],['B','商户','y','查询','text','merchant','192.0.2.2','成功','2026-11-05 10:00:00'],['C','商户','z','查询','text','merchant','192.0.2.3','成功','2026-11-05 10:00:00']];
 const c=vm.createContext({window:{HSProviderDemo:{tenantId:'HS-TEN-001',tenants:[{id:'HS-TEN-001',name:'汇盛'}]}},accounts:[['admin@hs-pay']],accountRoleNames:()=>[],tenantEffectiveScope:()=>({code:'tenant.allowed_merchants',merchantIds:['MCH-1188']}),tenantSystemPublicAudits:()=>rows,tenantAuditMetadata:new Map([['A',{tenantId:'HS-TEN-002',surface:'平台'}],['B',{tenantId:'HS-TEN-001',merchantId:'MCH-1188'}],['C',{tenantId:'HS-TEN-001',merchantId:'MCH-2031'}]])});
 for(const name of ['tenantAuditIdentity','tenantAuditRecordFor','tenantAuditVisibleRows'])vm.runInContext(fn(tenant,name),c);assert.equal(c.tenantAuditVisibleRows().length,1);assert.equal(c.tenantAuditVisibleRows()[0][0],'B');
 rows.push(['unknown']);
 c.tenantEffectiveScope=()=>({code:'tenant.current'});
 assert.equal(c.tenantAuditVisibleRows().length,2);
 c.window.HSProviderDemo.tenantId='HS-TEN-002';
 assert.deepEqual(c.tenantAuditVisibleRows().map(row=>row[0]),['A']);
 c.tenantEffectiveScope=()=>({code:'invalid'});assert.equal(c.tenantAuditVisibleRows().length,0);
});

test('租户检索固定当前租户，只有商户操作端保留商户输入',()=>{const c=vm.createContext({});vm.runInContext(fn(tenant,'tenantAuditNormalizedFilters'),c);for(const surface of ['', '平台','租户']){const normalized=c.tenantAuditNormalizedFilters({surface,tenant:'其他租户',merchant:'旧商户',account:'admin'});assert.equal(normalized.tenant,'');assert.equal(normalized.merchant,'');assert.equal(normalized.account,'admin');}assert.equal(c.tenantAuditNormalizedFilters({surface:'商户',merchant:'  MCH-1188  ',tenant:'其他租户'}).merchant,'MCH-1188');assert.doesNotMatch(tenant,/id="tenantAuditTenant"/);});
