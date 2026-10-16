import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const provider=fs.readFileSync(new URL('src/provider-model.js',root),'utf8'),source=fs.readFileSync(new URL('src/settlement-model.js',root),'utf8');
function fixture(){const window={document:{}};window.top=window;const ctx=vm.createContext({window,Date,Map,Set,JSON,Error});vm.runInContext(provider,ctx);vm.runInContext(source,ctx);return {model:window.HSTenantSettlements,provider:window.HSProviderDemo};}
test('月结只统计当前租户当月成功代收代付订单，金额和计费精确',()=>{
 const f=fixture();f.provider.setTenantBilling('HS-TEN-001',{collection:{mode:'percentage',value:'0.45'},payout:{mode:'perTransaction',value:'2.00'}});
 const b=f.model.preview('HS-TEN-001','2026-07');assert.equal(b.count,4);assert.equal(b.amount,'72870.00');assert.equal(b.lines[0].count,2);assert.equal(b.lines[0].amount,'13120.00');assert.equal(b.lines[0].fee,'59.04');assert.equal(b.lines[1].fee,'4.00');assert.equal(b.total,'63.04');assert(b.orders.every(o=>o.status==='成功'&&['代收','代付'].includes(o.direction)));
 assert.equal(f.model.preview('HS-TEN-001','2026-08').count,0);assert.equal(f.model.preview('HS-TEN-018','2026-07').count,0);assert.throws(()=>f.model.preview('HS-TEN-001','2026-13'));assert.throws(()=>f.model.preview('unknown','2026-07'));
});
test('未设置费率不能出单，免费可生成，同租户同月不重复且快照不随费率修改',()=>{
 const f=fixture();assert.equal(f.model.preview('HS-TEN-001','2026-07').total,null);assert.throws(()=>f.model.generate('HS-TEN-001','2026-07'),/费率/);assert.equal(f.model.list().length,0);
 f.provider.setTenantBilling('HS-TEN-001',{collection:{mode:'percentage',value:'0'},payout:{mode:'perTransaction',value:'0'}});const b=f.model.generate('HS-TEN-001','2026-07');assert.equal(b.total,'0.00');b.lines[0].fee='999.00';
 f.provider.setTenantBilling('HS-TEN-001',{collection:{mode:'percentage',value:'1'},payout:{mode:'perTransaction',value:'3'}});assert.equal(f.model.find('HS-TEN-001','2026-07').total,'0.00');assert.equal(f.model.generate('HS-TEN-001','2026-07').lines[0].fee,'0.00');assert.equal(f.model.list().length,1);assert.throws(()=>f.model.generate('HS-TEN-018','2026-07'),/没有成功订单/);
});
test('月结订单样例与全局订单查询保持一致，订单号不重复',()=>{
 const seeds=JSON.parse(source.split('\n')[0].slice('const hsSettlementSeeds='.length,-1)),orders=fs.readFileSync(new URL('public/legacy/sources/orders.html',root),'utf8'),part=orders.split('      orders: {')[1].split('      audit: {')[0],rows=vm.runInNewContext(part.match(/        rows: (\[[\s\S]*?\n        \]),/)[1]);
 assert.equal(seeds.orders.length,rows.length);assert.equal(new Set(seeds.orders.map(o=>o.id)).size,seeds.orders.length);for(const row of rows){const o=seeds.orders.find(o=>o.id===row[0]);assert.equal(o.direction,row[3]);assert.equal(o.status,row[4]);assert.equal(o.amount,row[5].replace('CNY ','').replaceAll(',',''));assert.equal(o.completedAt,row[8]);}
});

test('订单更正同步到待结算统计，已生成结算单仍保持快照',()=>{
 const f=fixture();f.provider.setTenantBilling('HS-TEN-001',{collection:{mode:'percentage',value:'0.45'},payout:{mode:'perTransaction',value:'2'}});
 const before=f.model.generate('HS-TEN-001','2026-07');
 const seeds=JSON.parse(source.split('\n')[0].slice('const hsSettlementSeeds='.length,-1)),rows=seeds.orders.map(o=>[o.id,'汇盛东南亚','-',o.direction,o.status,'CNY '+o.amount,'-','-',o.completedAt]);
 rows.find(r=>r[0]==='HS-P-260717-000220')[4]='成功';f.model.syncOrders(rows);assert.equal(f.model.preview('HS-TEN-001','2026-07').count,5);assert.equal(f.model.preview('HS-TEN-001','2026-07').total,'65.04');assert.equal(f.model.find('HS-TEN-001','2026-07').total,before.total);assert.equal(f.model.getOrderRows().find(r=>r[0]==='HS-P-260717-000220')[4],'成功');
});

test('租户更名或其他租户重名不改变历史订单归属',()=>{
 const f=fixture();f.provider.setTenantBilling('HS-TEN-001',{collection:{mode:'percentage',value:'0.45'},payout:{mode:'perTransaction',value:'2'}});
 const seeds=JSON.parse(source.split('\n')[0].slice('const hsSettlementSeeds='.length,-1)),rows=seeds.orders.map(o=>[o.id,'汇盛东南亚','-',o.direction,o.status,'CNY '+o.amount,'-','-',o.completedAt]);
 f.model.registerTenant({id:'HS-TEN-001',name:'汇盛新名称'});f.model.registerTenant({id:'HS-TEN-018',name:'汇盛东南亚'});f.model.syncOrders(rows);
 const b=f.model.preview('HS-TEN-001','2026-07');assert.equal(b.tenantName,'汇盛新名称');assert.equal(b.count,4);assert.equal(b.total,'63.04');assert.equal(f.model.preview('HS-TEN-018','2026-07').count,0);
});
