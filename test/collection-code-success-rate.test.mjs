import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('surfaces/tenant/public/legacy/sources/channels.html',root),'utf8');
const provider=fs.readFileSync(new URL('src/provider-model.js',root),'utf8');
function renderer(){
 const ctx=vm.createContext({});
 const definition=source.split('\n').find(line=>line.includes('const $=s=>'));
 vm.runInContext('const '+definition.slice(definition.indexOf('esc=')),ctx);
 const start=source.indexOf(' function renderCollectionPerformance('),end=source.indexOf(' function renderCollectionRow(',start);
 vm.runInContext(source.slice(start,end),ctx);
 return value=>ctx.renderCollectionPerformance(value);
}
test('子编码成交值与自身成功率同行，0%及100%均有效',()=>{
 const render=renderer();
 for(const rate of ['95.6%','0%','100%']){const html=render({todayAmount:'20,180',todaySuccessRate:rate});assert.match(html,/>20,180</);assert(html.includes('（'+rate+'）'));}
});
test('没有成功率时不伪造0%，无成交显示0，有成交显示未知且转义文本',()=>{
 const render=renderer();
 assert.doesNotMatch(render({todayAmount:'0'}),/（|0%/);
 for(const rate of [undefined,'','101%','-1%','NaN%','<script>']){const html=render({todayAmount:'86',todaySuccessRate:rate});assert(html.includes('（—）'));assert.doesNotMatch(html,/<script>/);}
 assert(render({todayAmount:'<b>86</b>',todaySuccessRate:'95%'}).includes('&lt;b&gt;86&lt;/b&gt;'));
});
test('每个子编码有独立模拟成功率，租户样例互不共享引用',()=>{
 const window={document:{}};window.top=window;const ctx=vm.createContext({window,Map,Set});vm.runInContext(provider,ctx);
 const model=window.HSProviderDemo,a=model.tenantData('HS-TEN-001'),b=model.tenantData('HS-TEN-017');
 const fast=a.channels.find(c=>c.id==='CH-FIAT-IN-018');assert.notEqual(fast.collectionTypes[0].todaySuccessRate,fast.collectionTypes[1].todaySuccessRate);
 const first=a.channels.find(c=>c.id==='CH-FIAT-IN-001').collectionTypes[0],other=b.channels.find(c=>c.id==='CH-FIAT-IN-001').collectionTypes[0];assert.equal(first.todaySuccessRate,'95.6%');first.todaySuccessRate='50%';assert.equal(other.todaySuccessRate,'95.6%');
});
