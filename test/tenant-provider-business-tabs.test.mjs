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
 const script=source.slice(source.lastIndexOf('<script>')+8,source.lastIndexOf('</script>'));const modified=script.replace(/ function close\(\)\{[^\n]+\}/,' function close(){context=null;}').replace(/ function finish\(text,object\)\{[^\n]+\}/,' function finish(text,object){model.log(text,object,tenantId);}').replace(/ render\(\);\s*\}\)\(\);\s*$/,`window.providerTests={list,render,changeProviderUsage,payoutProviderUsed,selection(){return [...selectedProviders];},context(){return context;},exportPayoutProviders,payoutProvider,saveProviderAutoSettlement,syncProviderMoneyChannel,saveProviderEdit,previewProviderMoney,providerActionAllowed,providerAction,setContext(v){context=v;},business(d){providerBusiness=d;active='providers';context=null;selectedProviders.clear();},select(ids){selectedProviders=new Set(ids);}};})();`);
 assert.notEqual(modified,script);vm.runInContext(modified,ctx);return {downloads,model:window.HSProviderDemo,api:window.providerTests,el,set(id,value){el('#'+id).value=value;},radio(name,value){el('input[name="'+name+'"]:checked').value=value;}};
}
function form(f){for(const [key,val] of Object.entries({ppName:'本租户代付别名',ppCallback:'8',ppLimit:'1250.00',ppUncallbacked:'3',ppDeposit:'2000.00',ppBot:'DEMO-GROUP'}))f.set(key,val);f.radio('ppStatus','关闭');}
test('授权按业务分栏：双业务各出现，单方向及停用准确过滤',()=>{
 const f=fixture(),ids=()=>Array.from(f.api.list(),g=>g.providerId);f.api.business('代收');assert.deepEqual(ids(),['V-001','V-002','V-003']);f.api.business('代付');assert.deepEqual(ids(),['V-001','V-002','V-003','V-004']);
 f.model.grantFor('HS-TEN-001','V-001').directions=['代收'];assert(!ids().includes('V-001'));f.api.business('代收');assert(ids().includes('V-001'));f.model.grantFor('HS-TEN-001','V-001').status='已停用';assert(!ids().includes('V-001'));
});
test('代收表格保持原内容，代付显示管理列且不含新增删除或USDT入口',()=>{
 const f=fixture();f.api.business('代收');f.api.render();assert.match(f.el('#tableHead').innerHTML,/通道商编号/);assert.match(f.el('#tableHead').innerHTML,/授权业务/);assert.match(f.el('#tableHead').innerHTML,/最近变更/);assert(f.el('#providerPayoutOverview').hidden);
 f.api.business('代付');f.api.render();const head=f.el('#tableHead').innerHTML,body=f.el('#tableBody').innerHTML;assert.equal((head.match(/<th\b[^>]*>/g)||[]).length,16);for(const col of ['余额','剩余预付限额','回调时间','保证金'])assert(head.includes(col));assert(!head.includes('USDT'));assert(!head.includes('是否自营'));assert(!body.includes('删除'));assert(!body.includes('新增'));assert(body.includes('providerEdit'));assert(body.includes('providerSettle'));assert(f.el('#primaryAction').hidden);
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
test('总预付预览校验验证码与金额，不改变额度或保存验证码',()=>{
 const f=fixture();f.api.business('代付');f.api.setContext({kind:'providerMoney',id:'V-001',key:'totalPrepaid'});const r=f.api.payoutProvider('V-001'),before=JSON.stringify(r);f.set('pmAmount','100.25');f.set('pmGoogle','000000');f.radio('pmOperation','increase');f.api.previewProviderMoney();assert.equal(f.model.audits.length,0);assert.equal(f.el('#pmGoogle').value,'');f.set('pmGoogle','123456');f.api.previewProviderMoney();assert.match(f.el('#providerResult').textContent,/0.00 → 100.25/);assert.equal(JSON.stringify(r),before);assert.equal(f.el('#pmGoogle').value,'');assert(!JSON.stringify(f.model.audits).includes('123456'));
 f.el('#providerResult').textContent='';f.set('pmAmount','0.001');f.set('pmGoogle','123456');f.api.previewProviderMoney();assert.equal(f.el('#providerResult').textContent,'');f.set('pmAmount',String(r.totalPrepaid+1));f.radio('pmOperation','decrease');f.api.previewProviderMoney();assert.match(f.el('#modalFeedback').textContent,/不能大于/);
});
test('查询只作用于当前业务授权，平台名称更新同步回显且不沿用租户别名',()=>{
 const f=fixture();f.api.business('代付');f.api.payoutProvider('V-001').name='历史租户别名';f.model.providers.find(p=>p.id==='V-001').name='平台更新名称';f.set('keyword','平台更新');assert.equal(f.api.list().length,1);assert.equal(f.api.list()[0].name,'平台更新名称');f.set('keyword','V-004');assert.equal(f.api.list().length,1);f.model.grantFor('HS-TEN-001','V-004').status='已停用';assert.equal(f.api.list().length,0);f.api.business('代收');f.set('keyword','平台更新');assert.equal(f.api.list().length,1);
});

test('代付CSV只导出当前授权筛选结果，字段顺序匹配且无USDT或操作列',async()=>{
 const f=fixture();f.api.business('代付');f.set('keyword','PayoutX');f.api.exportPayoutProviders();const csv=await f.downloads[0].text(),lines=csv.trim().split('\n');assert.equal(lines.length,2);assert(lines[0].includes('剩余预付限额'));assert(!lines[0].includes('USDT'));assert(!csv.includes('自营'));assert(!csv.includes('第三方'));assert(!lines[0].includes('操作'));assert(lines[1].startsWith('"PayoutX","V-004"'));assert(!csv.includes('QuickPay'));assert.equal(lines[0].match(/"(?:[^"]|"")*"/g).length,14);f.model.grantFor('HS-TEN-001','V-004').status='已停用';f.api.exportPayoutProviders();assert.equal((await f.downloads[1].text()).trim().split('\n').length,1);
});

test('代付编辑名称只读且不提供自营设置，其他经营字段仍可保存',()=>{
 const f=fixture();f.api.business('代付');f.api.providerAction('providerEdit','V-001');const html=f.el('#modalBody').innerHTML;assert.match(html,/<input id="ppName"[^>]*readonly/);assert(!html.includes('是否自营'));assert(!html.includes('ppSelf'));form(f);f.api.saveProviderEdit();assert.equal(f.api.payoutProvider('V-001').name,'QuickPay');assert.equal(f.api.payoutProvider('V-001').callbackTime,8);assert.equal(f.api.payoutProvider('V-001').remainingLimit,1250);
});


test('代付分组以本租户代付通道存在为准，关闭和零跑量仍算使用',()=>{
 const f=fixture();f.api.business('代付');const d=f.model.tenantData();
 const removed=d.channels.filter(c=>c.providerId==='V-002'&&c.direction==='代付');
 d.channels=d.channels.filter(c=>!removed.includes(c));
 // 同供应商代收通道和其他租户代付通道均不能使它成为已使用。
 d.channels.push({id:'foreign-payout',providerId:'V-002',direction:'代付',tenantId:'HS-TEN-017',status:'开启'});
 d.channels.filter(c=>c.providerId==='V-001'&&c.direction==='代付').forEach(c=>{c.status='关闭';c.today=0;});
 f.api.render();assert.equal(f.api.list().length,3);assert(!f.api.list().some(g=>g.providerId==='V-002'));assert(f.api.list().some(g=>g.providerId==='V-001'));
 assert.match(f.el('#providerUsageTabs').innerHTML,/已使用<span>3<\/span>/);assert.match(f.el('#providerUsageTabs').innerHTML,/未使用<span>1<\/span>/);
 f.api.changeProviderUsage('unused');assert.deepEqual(Array.from(f.api.list(),g=>g.providerId),['V-002']);
 d.channels.push({...removed[0]});f.api.render();assert.equal(f.api.list().length,0);assert.match(f.el('#tableBody').innerHTML,/所有已授权的代付通道商都已使用/);
 f.api.changeProviderUsage('used');assert.equal(f.api.list().length,4);
 // 删掉最后一条后归回未使用，配置不被清空。
 const config=f.api.payoutProvider('V-002');config.remainingPrepaid=123;
 d.channels=d.channels.filter(c=>!(c.providerId==='V-002'&&c.direction==='代付'&&c.tenantId==='HS-TEN-001'));f.api.changeProviderUsage('unused');assert.equal(f.api.list().length,1);assert.equal(config.remainingPrepaid,123);
 f.api.business('代收');f.api.render();assert(f.el('#providerUsageTabs').hidden);assert(f.api.list().some(g=>g.providerId==='V-002'));
});

test('二十多家授权只使用两家，分组切换清空检索和选择，汇总清算导出限当前组',async()=>{
 const f=fixture();f.api.business('代付');const m=f.model,d=m.tenantData();
 d.channels=d.channels.filter(c=>c.direction!=='代付'||['V-001','V-003'].includes(c.providerId));
 for(let i=5;i<=22;i++){const id='TEST-'+i;m.providers.push({id,name:'演示代付通道商'+i,directions:['代付']});m.grants.push({id:'GRANT-'+i,tenantId:'HS-TEN-001',providerId:id,directions:['代付'],status:'已授权'});}
 f.api.render();assert.equal(f.api.list().length,2);assert.match(f.el('#providerUsageTabs').innerHTML,/未使用<span>20<\/span>/);
 f.api.select(['V-001']);f.set('keyword','QuickPay');f.api.changeProviderUsage('unused');assert.equal(f.el('#keyword').value,'');assert.equal(f.api.selection().length,0);assert.equal(f.api.list().length,20);
 f.set('keyword','TEST-22');f.api.render();assert.equal(f.api.list().length,1);assert.match(f.el('#providerPayoutOverview').innerHTML,/通道商数量：<strong>1<\/strong>/);assert.match(f.el('#providerUsageTabs').innerHTML,/未使用<span>20<\/span>/,'页签数量不随搜索减少');
 f.api.providerAction('providerSettleAll');assert.deepEqual(Array.from(f.api.context().ids),['TEST-22']);
 f.api.exportPayoutProviders();const csv=await f.downloads[0].text();assert(csv.includes('TEST-22'));assert(!csv.includes('QuickPay'));assert.equal(csv.trim().split('\n').length,2);
 f.api.select(['TEST-22']);m.grantFor('HS-TEN-001','TEST-22').status='已停用';f.api.render();assert.equal(f.api.list().length,0);assert.equal(f.api.selection().length,0);
});


test('通道商余额汇总本租户同供应商CNY代付通道，随通道变动且不串业务币种',async()=>{
 const f=fixture();f.api.business('代付');const d=f.model.tenantData();
 const qp=f.api.payoutProvider('V-001');assert.equal(qp.balance,1051800);
 const own=d.channels.filter(c=>c.providerId==='V-001'&&c.direction==='代付'&&c.asset==='CNY');own[0].balance='1,000.10';own[0].status='关闭';own[1].balance='200.20';
 d.channels.push({id:'extra',tenantId:'HS-TEN-001',providerId:'V-001',direction:'代付',asset:'CNY',balance:'0.03',status:'关闭'});
 d.channels.push({id:'foreign',tenantId:'HS-TEN-017',providerId:'V-001',direction:'代付',asset:'CNY',balance:'9999999'});
 d.channels.push({id:'collect',tenantId:'HS-TEN-001',providerId:'V-001',direction:'代收',asset:'CNY',balance:'9999999'});
 d.channels.push({id:'usdt',tenantId:'HS-TEN-001',providerId:'V-001',direction:'代付',asset:'USDT',balance:'9999999'});
 d.channels.push({id:'other',tenantId:'HS-TEN-001',providerId:'V-003',direction:'代付',asset:'CNY',balance:'888.88'});
 assert.equal(qp.balance,1200.33);f.set('keyword','V-001');f.api.render();assert.match(f.el('#tableBody').innerHTML,/1,200.33/);assert.match(f.el('#providerPayoutOverview').innerHTML,/总余额：1,200.33元/);
 f.api.exportPayoutProviders();assert.match(await f.downloads[0].text(),/"1,200.33"/);
 f.api.providerAction('providerSettle','V-001');assert.match(f.el('#modalBody').innerHTML,/1,200.33/);
 f.api.providerAction('providerMoney','V-001',{dataset:{key:'balance'}});assert.match(f.el('#modalBody').innerHTML,/余额：1,200.33元/);
 d.channels=d.channels.filter(c=>c.id!=='extra');assert.equal(qp.balance,1200.3);
 d.deletedChannelIds=new Set([own[0].id]);assert.equal(qp.balance,200.2);
 d.channels=d.channels.filter(c=>!(c.providerId==='V-001'&&c.direction==='代付'&&c.asset==='CNY'));assert.equal(qp.balance,0);
});


test('通道商余额调额必选本租户对应通道，只改所选明细并重新汇总',()=>{
 const f=fixture();f.api.business('代付');const d=f.model.tenantData(),r=d.channels.find(c=>c.id==='CH-FIAT-OUT-022'),other=d.channels.find(c=>c.id==='CH-FIAT-OUT-006'),beforeOther=other.balance;
 const open=()=>{f.api.providerAction('providerMoney','V-001',{dataset:{key:'balance'}});f.set('pmAmount','10000');f.set('pmRemark','演示');f.set('pmGoogle','123456');f.radio('pmOperation','decrease');};
 open();f.api.previewProviderMoney();assert.equal(r.balance,'418,000.00');assert.match(f.el('#modalFeedback').textContent,/请选择/);
 f.set('pmChannel',r.id);f.api.syncProviderMoneyChannel();f.api.previewProviderMoney();assert.equal(r.balance,'408,000.00');assert.equal(other.balance,beforeOther);assert.equal(f.api.payoutProvider('V-001').balance,1041800);f.api.previewProviderMoney();assert.equal(r.balance,'408,000.00');
 open();f.set('pmChannel','CH-FIAT-OUT-004');f.api.syncProviderMoneyChannel();f.api.previewProviderMoney();assert.equal(r.balance,'408,000.00');assert.match(f.el('#modalFeedback').textContent,/请选择/);
 open();f.set('pmChannel',r.id);f.api.syncProviderMoneyChannel();f.set('pmAmount','500000');f.api.previewProviderMoney();assert.equal(r.balance,'408,000.00');assert.match(f.el('#modalFeedback').textContent,/所选通道余额/);
 open();f.set('pmChannel',r.id);f.api.syncProviderMoneyChannel();r.balance='407,999.99';f.api.previewProviderMoney();assert.equal(r.balance,'407,999.99');assert.match(f.el('#modalFeedback').textContent,/余额已变化/);
 const unused='TEST-EMPTY';f.model.providers.push({id:unused,name:'未使用',directions:['代付']});f.model.grants.push({tenantId:'HS-TEN-001',providerId:unused,directions:['代付'],status:'已授权'});f.api.changeProviderUsage('unused');f.api.providerAction('providerMoney',unused,{dataset:{key:'balance'}});assert(f.el('#modalFoot [data-action="providerRunMoney"]').disabled);
 assert(!JSON.stringify(f.model.audits).includes('123456'));
});


test('自动清算默认关闭，确认后按租户和通道商保存，撤权与过期设置不能提交',async()=>{
 const f=fixture();f.api.business('代付');const r=f.api.payoutProvider('V-001'),before=r.balance,other=fixture(f.model,'HS-TEN-017');assert.equal(r.autoSettlement,false);
 f.api.providerAction('providerAutoSettlement','V-001');assert.match(f.el('#modalBody').innerHTML,/00:00（UTC\+8）/);assert.match(f.el('#modalBody').innerHTML,/现有手动清算/);assert.match(f.el('#modalBody').innerHTML,/TG/);assert.equal(r.autoSettlement,false,'未确认不变化');
 f.api.setContext(null);assert.equal(r.autoSettlement,false,'取消保留关闭');
 f.api.providerAction('providerAutoSettlement','V-001');f.api.saveProviderAutoSettlement();assert.equal(r.autoSettlement,true);assert.equal(r.balance,before);assert.equal(other.api.payoutProvider('V-001').autoSettlement,false);assert.equal(f.api.payoutProvider('V-003').autoSettlement,false);f.api.saveProviderAutoSettlement();assert.equal(r.autoSettlement,true,'重复确认不翻转');
 f.api.exportPayoutProviders();const csv=await f.downloads[0].text();assert(csv.includes('自动清算'));assert.match(csv,/"开启"/);
 const again=fixture(f.model);again.api.business('代付');assert.equal(again.api.payoutProvider('V-001').autoSettlement,true,'切页保留');
 f.api.providerAction('providerAutoSettlement','V-001');r.autoSettlement=false;f.api.saveProviderAutoSettlement();assert.equal(r.autoSettlement,false);assert.match(f.el('#modalFeedback').textContent,/已变化/);
 f.api.providerAction('providerAutoSettlement','V-001');f.model.grantFor('HS-TEN-001','V-001').directions=['代收'];f.api.saveProviderAutoSettlement();assert.equal(r.autoSettlement,false);
 f.model.grantFor('HS-TEN-001','V-001').directions=['代收','代付'];f.api.providerAction('providerAutoSettlement','V-001');f.api.saveProviderAutoSettlement();assert.equal(r.autoSettlement,true);f.api.providerAction('providerAutoSettlement','V-001');assert.match(f.el('#modalBody').innerHTML,/停止后续自动清算/);f.api.saveProviderAutoSettlement();assert.equal(r.autoSettlement,false);
});
