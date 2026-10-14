import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/provider-model.js',import.meta.url),'utf8');
function boot(top={document:{}}){const win={top};vm.runInNewContext(source,{window:win,Date,Map,JSON,Error});return win.HSProviderDemo;}
test('不同租户的通道、产品和对接资料分别保存',()=>{
 const m=boot(),a=m.tenantData('HS-TEN-001'),b=m.tenantData('HS-TEN-017');
 const bName=b.channels[0].name;a.channels[0].name='本租户修改';a.products[0].status='关闭';a.connectionConfigs.set(a.channels[0].id,{secret:'DEMO-SECRET'});
 assert.equal(b.channels[0].name,bName);assert.equal(b.products[0].status,'开启');assert.equal(b.connectionConfigs.size,0);assert.throws(()=>m.tenantData('unknown'));
});
test('通道商更名后通过稳定编号保留租户通道关联',()=>{
 const m=boot();m.providers.find(p=>p.id==='V-001').name='QuickPay Renamed';
 const owned=m.tenantData().channels.filter(c=>c.providerId==='V-001');assert.ok(owned.length);assert.ok(owned.every(c=>c.vendor==='QuickPay Renamed'));
 m.providers.find(p=>p.id==='V-001').name='QuickPay Again';assert.ok(m.tenantData().channels.filter(c=>c.providerId==='V-001').every(c=>c.vendor==='QuickPay Again'));
});
test('授权只影响所选租户的通道商候选集合',()=>{
 const m=boot(),other=m.authorizedProviders('HS-TEN-017').length;m.grantFor('HS-TEN-001','V-001').status='已停用';
 assert.ok(!m.authorizedProviders('HS-TEN-001').some(p=>p.id==='V-001'));assert.equal(m.authorizedProviders('HS-TEN-017').length,other);
 assert.ok(m.tenantData().channels.some(c=>c.providerId==='V-001'),'停用授权不删除既有配置');
});
test('统一入口切端或切页复用同一会话状态',()=>{
 const top={document:{}},first=boot(top);first.grants.push({id:'TEST-GRANT'});const second=boot(top);assert.equal(second,first);assert.equal(second.grants.at(-1).id,'TEST-GRANT');
});
test('秘密资料独立保存，订单通道投影不带对接配置',()=>{
 const m=boot(),data=m.tenantData();data.codeConfigs.set('DEMO-CODE',{secret:'DEMO-SECRET',privateKey:'DEMO-PRIVATE'});
 assert.ok(!JSON.stringify(m.orderChannels()).includes('DEMO-SECRET'));const audit=m.log('保存对接信息','DEMO-CODE','HS-TEN-001');assert.ok(!JSON.stringify(audit).includes('DEMO-SECRET'));
});

test('同一租户逐个通道商授权方向，其他通道商和租户不受影响',()=>{
 const m=boot(),before=m.tenantData().channels.length;m.grantFor('HS-TEN-001','V-001').directions=['代收'];
 assert(m.canConfigureChannel('HS-TEN-001','V-001','代收'));
 assert.equal(m.canConfigureChannel('HS-TEN-001','V-001','代付'),false);
 assert(m.canConfigureChannel('HS-TEN-001','V-003','代付'));
 assert(m.canConfigureChannel('HS-TEN-017','V-001','代付'));
 assert.equal(m.authorizedProviders('HS-TEN-001','代付').some(p=>p.id==='V-001'),false);
 assert.equal(m.canConfigureChannel('HS-TEN-001','V-004','代收'),false);
 assert.deepEqual(Array.from(m.grantDirections('HS-TEN-001','V-001')),['代收']);
 assert.equal(m.tenantData().channels.length,before);
});
test('授权方向严格取已选业务与通道商支持方向交集，无记录和停用时无许可',()=>{
 const m=boot(),g=m.grantFor('HS-TEN-001','V-001');g.directions=['代付'];m.providers.find(p=>p.id==='V-001').directions=['代收'];
 assert.equal(m.grantDirections('HS-TEN-001','V-001').length,0);
 m.providers.find(p=>p.id==='V-001').directions=['代收','代付'];assert.equal(m.canConfigureChannel('HS-TEN-001','V-001','代收'),false);
 g.status='已停用';assert.equal(m.grantDirections('HS-TEN-001','V-001').length,0);
 assert.equal(m.canConfigureChannel('unknown','V-004','代付'),false);
 delete g.directions;g.status='已授权';assert.equal(m.grantDirections('HS-TEN-001','V-001').length,0);
});
test('授权方向校验拒绝空值、非法业务和通道商不支持的方向',()=>{
 const m=boot();for(const directions of [[],['非法'],['代收']])assert.throws(()=>m.validateGrantDirections('V-004',directions));
 assert.deepEqual(Array.from(m.validateGrantDirections('V-004',['代付','代付'])),['代付']);
 assert.throws(()=>m.validateGrantDirections('missing',['代付']));
});

test('租户计费仅支持百分比或单笔，校验精度范围且失败时保留全部设置',()=>{
 const m=boot(),valid={collection:{mode:'percentage',value:'0.45'},payout:{mode:'perTransaction',value:'2.00'}};m.setTenantBilling('HS-TEN-001',valid);const before=JSON.stringify(m.tenantBilling('HS-TEN-001'));
 for(const value of ['-1','NaN','1e2','101','0.12345'])assert.throws(()=>m.setTenantBilling('HS-TEN-001',{...valid,collection:{mode:'percentage',value}}));
 assert.throws(()=>m.setTenantBilling('HS-TEN-001',{...valid,payout:{mode:'perTransaction',value:'0.001'}}));assert.throws(()=>m.setTenantBilling('HS-TEN-001',{...valid,payout:{mode:'mixed',value:'1'}}));assert.throws(()=>m.setTenantBilling('unknown',valid));assert.equal(JSON.stringify(m.tenantBilling('HS-TEN-001')),before);
 const copy=m.tenantBilling('HS-TEN-001');copy.collection.value='9';assert.equal(JSON.stringify(m.tenantBilling('HS-TEN-001')),before);
});
test('服务费计算示例按成功金额或成功笔数计算，0与未设置不同',()=>{
 const m=boot();assert.equal(m.billingPreview({mode:'percentage',value:'0.45'}),'45.00');assert.equal(m.billingPreview({mode:'percentage',value:'0.29'}),'29.00');assert.equal(m.billingPreview({mode:'percentage',value:'0.0001'}),'0.01');assert.equal(m.billingPreview({mode:'perTransaction',value:'2'}),'200.00');assert.equal(m.billingPreview({mode:'perTransaction',value:'0'}),'0.00');assert.equal(m.billingPreview({mode:'percentage',value:''}),null);
});
