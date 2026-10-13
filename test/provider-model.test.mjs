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
