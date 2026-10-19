import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/channels.html',import.meta.url),'utf8');
const providerSource=fs.readFileSync(new URL('../src/provider-model.js',import.meta.url),'utf8');
function fixture(shared,tenantId='HS-TEN-001'){
 const downloads=[];class ExportURL extends URL{static createObjectURL(blob){downloads.push(blob);return "blob:demo-export";}static revokeObjectURL(){}}
 const elements=new Map(),listeners=new Map();const el=selector=>{if(!elements.has(selector))elements.set(selector,{value:'',checked:false,hidden:false,disabled:false,innerHTML:'',textContent:'',dataset:{},style:{},setAttribute(){},focus(){},addEventListener(){},insertAdjacentHTML(){},classList:{add(){},remove(){},toggle(){},contains(){return false;}}});return elements.get(selector);};
 const window={document:{}};window.top=window;
 const ctx=vm.createContext({window,Map,Set,URL:ExportURL,Blob,Date,setTimeout(){},document:{createElement(){return {click(){}};},querySelector:el,querySelectorAll(){return [];},addEventListener(t,f){if(!listeners.has(t))listeners.set(t,[]);listeners.get(t).push(f);}}});
 if(shared)window.HSProviderDemo=shared;else vm.runInContext(providerSource,ctx);window.HSProviderDemo.tenantId=tenantId;
 const script=source.slice(source.lastIndexOf('<script>')+8,source.lastIndexOf('</script>'));const modified=script.replace(/ function close\(\)\{[^\n]+\}/,' function close(){context=null;}').replace(/ function finish\(text,object\)\{[^\n]+\}/,' function finish(text,object){model.log(text,object,tenantId);}').replace(/ render\(\);\s*\}\)\(\);\s*$/,`window.providerTests={list,render,exportPayoutProviders,payoutProvider,saveProviderEdit,previewProviderMoney,providerActionAllowed,providerAction,setContext(v){context=v;},business(d){providerBusiness=d;active='providers';context=null;selectedProviders.clear();},select(ids){selectedProviders=new Set(ids);}};})();`);
 assert.notEqual(modified,script);vm.runInContext(modified,ctx);return {downloads,model:window.HSProviderDemo,api:window.providerTests,el,set(id,value){el('#'+id).value=value;},radio(name,value){el('input[name="'+name+'"]:checked').value=value;}};
}
function form(f){for(const [key,val] of Object.entries({ppName:'本租户代付别名',ppCallback:'8',ppLimit:'1250.00',ppUncallbacked:'3',ppDeposit:'2000.00',ppBot:'DEMO-GROUP'}))f.set(key,val);f.radio('ppStatus','关闭');}
test('授权按业务分栏：双业务各出现，单方向及停用准确过滤',()=>{
 const f=fixture(),ids=()=>Array.from(f.api.list(),g=>g.providerId);f.api.business('代收');assert.deepEqual(ids(),['V-001','V-002','V-003']);f.api.business('代付');assert.deepEqual(ids(),['V-001','V-002','V-003','V-004']);
 f.model.grantFor('HS-TEN-001','V-001').directions=['代收'];assert(!ids().includes('V-001'));f.api.business('代收');assert(ids().includes('V-001'));f.model.grantFor('HS-TEN-001','V-001').status='已停用';assert(!ids().includes('V-001'));
});
test('代收表格保持原内容，代付显示管理列且不含新增删除或USDT入口',()=>{
 const f=fixture();f.api.business('代收');f.api.render();assert.match(f.el('#tableHead').innerHTML,/通道商编号/);assert.match(f.el('#tableHead').innerHTML,/授权业务/);assert.match(f.el('#tableHead').innerHTML,/最近变更/);assert(f.el('#providerPayoutOverview').hidden);
 f.api.business('代付');f.api.render();const head=f.el('#tableHead').innerHTML,body=f.el('#tableBody').innerHTML;assert.equal((head.match(/<th>/g)||[]).length,15);for(const col of ['余额','剩余预付限额','回调时间','保证金'])assert(head.includes(col));assert(!head.includes('USDT'));assert(!head.includes('是否自营'));assert(!body.includes('删除'));assert(!body.includes('新增'));assert(body.includes('providerEdit'));assert(body.includes('providerSettle'));assert(f.el('#primaryAction').hidden);
});
test('代付保存忽略被篡改的名称，经营设置按租户独立保存且切页保留',()=>{
 const f=fixture();f.api.business('代付');const platformBefore=JSON.stringify(f.model.providers),other=fixture(f.model,'HS-TEN-017');const otherBefore=JSON.stringify(other.api.payoutProvider('V-001'));form(f);f.api.setContext({kind:'providerEdit',id:'V-001'});f.api.saveProviderEdit();assert.equal(f.api.payoutProvider('V-001').name,'QuickPay');assert.equal(f.api.payoutProvider('V-001').status,'关闭');assert.equal(JSON.stringify(other.api.payoutProvider('V-001')),otherBefore);assert.equal(JSON.stringify(f.model.providers),platformBefore);
 f.api.business('代收');assert.equal(f.api.list()[0].name,'QuickPay');const again=fixture(f.model);again.api.business('代付');assert.equal(again.api.list()[0].name,'QuickPay');
});
test('编辑校验失败或弹窗期间撤销授权时设置与日志保持不变',()=>{
 const f=fixture();f.api.business('代付');form(f);f.api.setContext({kind:'providerEdit',id:'V-001'});const r=f.api.payoutProvider('V-001'),before=JSON.stringify(r),audit=f.model.audits.length;f.set('ppCallback','-1');f.api.saveProviderEdit();assert.equal(JSON.stringify(r),before);assert.equal(f.model.audits.length,audit);form(f);f.model.grantFor('HS-TEN-001','V-001').directions=['代收'];f.api.saveProviderEdit();assert.equal(JSON.stringify(r),before);assert.equal(f.model.audits.length,audit);
});
test('批量清算复验每个通道商代付授权且不改变资金',()=>{
 const f=fixture();f.api.business('代付');f.api.setContext({kind:'providerSettle',ids:['V-001','V-003']});const r=f.api.payoutProvider('V-001'),before=JSON.stringify(r);assert(f.api.providerActionAllowed('providerConfirmSettle'));f.model.grantFor('HS-TEN-001','V-003').status='已停用';assert.equal(f.api.providerActionAllowed('providerConfirmSettle'),false);f.model.grantFor('HS-TEN-001','V-003').status='已授权';f.api.providerAction('providerConfirmSettle');assert.equal(JSON.stringify(r),before);assert.match(f.el('#providerResult').textContent,/当前余额未改变/);assert.equal(f.model.audits.at(-1).tenantId,'HS-TEN-001');
});
test('调额校验谷歌验证码及金额，预览与日志不持久保存密码或改变额度',()=>{
 const f=fixture();f.api.business('代付');f.api.setContext({kind:'providerMoney',id:'V-001',key:'balance'});const r=f.api.payoutProvider('V-001'),before=JSON.stringify(r);f.set('pmAmount','100.25');f.set('pmGoogle','000000');f.radio('pmOperation','increase');f.api.previewProviderMoney();assert.equal(f.model.audits.length,0);assert.equal(f.el('#pmGoogle').value,'');f.set('pmGoogle','123456');f.api.previewProviderMoney();assert.match(f.el('#providerResult').textContent,/100.25/);assert.equal(JSON.stringify(r),before);assert.equal(f.el('#pmGoogle').value,'');assert(!JSON.stringify(f.model.audits).includes('123456'));
 f.el('#providerResult').textContent='';f.set('pmAmount','0.001');f.set('pmGoogle','123456');f.api.previewProviderMoney();assert.equal(f.el('#providerResult').textContent,'');f.set('pmAmount','1');f.radio('pmOperation','decrease');f.api.previewProviderMoney();assert.match(f.el('#modalFeedback').textContent,/不能大于/);
});
test('查询只作用于当前业务授权，平台名称更新同步回显且不沿用租户别名',()=>{
 const f=fixture();f.api.business('代付');f.api.payoutProvider('V-001').name='历史租户别名';f.model.providers.find(p=>p.id==='V-001').name='平台更新名称';f.set('keyword','平台更新');assert.equal(f.api.list().length,1);assert.equal(f.api.list()[0].name,'平台更新名称');f.set('keyword','V-004');assert.equal(f.api.list().length,1);f.model.grantFor('HS-TEN-001','V-004').status='已停用';assert.equal(f.api.list().length,0);f.api.business('代收');f.set('keyword','平台更新');assert.equal(f.api.list().length,1);
});

test('代付CSV只导出当前授权筛选结果，字段顺序匹配且无USDT或操作列',async()=>{
 const f=fixture();f.api.business('代付');f.set('keyword','PayoutX');f.api.exportPayoutProviders();const csv=await f.downloads[0].text(),lines=csv.trim().split('\n');assert.equal(lines.length,2);assert(lines[0].includes('剩余预付限额'));assert(!lines[0].includes('USDT'));assert(!csv.includes('自营'));assert(!csv.includes('第三方'));assert(!lines[0].includes('操作'));assert(lines[1].startsWith('"PayoutX","V-004"'));assert(!csv.includes('QuickPay'));assert.equal(lines[0].match(/"(?:[^"]|"")*"/g).length,13);f.model.grantFor('HS-TEN-001','V-004').status='已停用';f.api.exportPayoutProviders();assert.equal((await f.downloads[1].text()).trim().split('\n').length,1);
});

test('代付编辑名称只读且不提供自营设置，其他经营字段仍可保存',()=>{
 const f=fixture();f.api.business('代付');f.api.providerAction('providerEdit','V-001');const html=f.el('#modalBody').innerHTML;assert.match(html,/<input id="ppName"[^>]*readonly/);assert(!html.includes('是否自营'));assert(!html.includes('ppSelf'));form(f);f.api.saveProviderEdit();assert.equal(f.api.payoutProvider('V-001').name,'QuickPay');assert.equal(f.api.payoutProvider('V-001').callbackTime,8);assert.equal(f.api.payoutProvider('V-001').remainingLimit,1250);
});
