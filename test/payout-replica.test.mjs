import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/channels.html',import.meta.url),'utf8');
const providerSource=fs.readFileSync(new URL('../src/provider-model.js',import.meta.url),'utf8');
const merchantsSource=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/merchants.html',import.meta.url),'utf8');
const overviewSource=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/overview.html',import.meta.url),'utf8');
function fixture(){
 const elements=new Map(),applies=[];const el=selector=>{if(!elements.has(selector))elements.set(selector,{value:'',checked:false,disabled:false,hidden:false,innerHTML:'',textContent:'',dataset:{},setAttribute(){},focus(){},addEventListener(){},insertAdjacentHTML(){},classList:{add(){},remove(){},contains(){return false;}}});return elements.get(selector);};
 const window={document:{}};window.top=window;
 const ctx=vm.createContext({window,Map,Set,URL,setTimeout(){},document:{querySelector:el,querySelectorAll:selector=>selector==='[data-payout-apply]:checked'?applies:[],addEventListener(){}}});vm.runInContext(providerSource,ctx);
 const script=source.slice(source.lastIndexOf('<script>')+8,source.lastIndexOf('</script>'));
 const modified=script.replace(/ function finish\(text,object\)\{[^\n]+\}/,' function finish(text,object){model.log(text,object,tenantId);}').replace(/ render\(\);\s*\}\)\(\);\s*$/,`window.payoutTest={savePayoutChannel,savePayoutDev,savePayoutBulk,savePayoutLimit,setPayoutType,confirmPayoutDelete,runPayoutMoney,runPayoutTest,saveReplicaProduct,setContext(value){context=value;}};})();`);
 assert.notEqual(modified,script);vm.runInContext(modified,ctx);
 return {el,ctx,model:window.HSProviderDemo,api:window.payoutTest,applies,set:(id,value)=>el('#'+id).value=value};
}
function limitForm(f,r={}){const c=f.model.tenantData().payoutLimits.get(r.id)||{};const b=(r.limit||'1 - 10000').replaceAll(',','').split(/\s*-\s*/);for(const [id,v] of Object.entries({plMin:c.min||b[0],plMax:c.max||b[1],plDaily:c.dailyAmount||'0',plFixed:c.fixedAmounts||'',plExcluded:c.excludedAmounts||'',plIps:c.submitIpBlacklist||'',plStart:c.start||'00:00',plEnd:c.end||'23:59',plCallbackTime:r.callbackTime||'0',plCallbackStatus:r.callbackStatus||'接受'}))f.set(id,v);f.el('#plEnabled').checked=r.limitStatus==='开启';}
function channelForm(f,r,productId=r.productId){limitForm(f,r);for(const [id,v] of Object.entries({pcName:r.name,pcProvider:r.providerId,pcWeight:r.weight||'1',pcProduct:productId||'',pcInterface:r.interfaceType||'chpay',pcStatus:r.status,pcGroup:''}))f.set(id,v);}
test('新增代付通道检查授权与权重，并由主类型确定币种',()=>{
 const f=fixture(),d=f.model.tenantData(),before=d.channels.length,p=d.products.find(p=>p.direction==='代付'&&p.currency==='USDT');
 channelForm(f,{name:'测试新增',providerId:'V-MISSING',weight:'1',status:'开启'},p.id);f.api.setContext({id:undefined});f.api.savePayoutChannel();assert.equal(d.channels.length,before);
 f.set('pcProvider','V-004');f.set('pcWeight','10');f.api.savePayoutChannel();assert.equal(d.channels.length,before);
 f.set('pcWeight','2');f.api.savePayoutChannel();const r=d.channels.at(-1);assert.equal(r.asset,'USDT');assert.equal(r.productId,p.id);assert(p.channelIds.includes(r.id));assert.equal(r.thirdCode,'');
});
test('次级代付类型可以跨币种绑定，编辑通道和产品不会清除关系',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.direction==='代付'&&c.asset==='CNY'),secondary=d.products.find(p=>p.direction==='代付'&&p.currency==='USDT');
 f.api.setContext({id:r.id});f.api.setPayoutType(secondary.id,true);assert(secondary.channelIds.includes(r.id));
 channelForm(f,r);f.set('pcName','新版通道名');f.api.setContext({id:r.id});f.api.savePayoutChannel();assert(secondary.channelIds.includes(r.id));
 f.api.setContext({id:secondary.id,direction:'代付'});f.set('rpName','新版USDT类型');f.set('rpCode',secondary.productNo);f.set('rpCurrency','USDT');f.api.saveReplicaProduct();assert.equal(secondary.name,'新版USDT类型');
 const primary=d.products.find(p=>p.id===r.productId);f.api.setContext({id:r.id});f.api.setPayoutType(primary.id,false);assert(primary.channelIds.includes(r.id));channelForm(f,r,'');f.api.setContext({id:r.id});f.api.savePayoutChannel();assert(secondary.channelIds.includes(r.id));assert(!primary.channelIds.includes(r.id));assert.equal(r.productId,'');
});
test('批量开发配置只更新选中字段和通道，错误地址不产生部分保存',()=>{
 const f=fixture(),d=f.model.tenantData(),rs=d.channels.filter(c=>c.direction==='代付').slice(0,3);
 for(const r of rs)d.connectionConfigs.set(r.id,{merchantNo:'OLD',secret:'DEMO-SECRET',appId:'OLD-APP'});
 f.api.setContext({kind:'payoutBulkDev',ids:rs.slice(0,2).map(r=>r.id)});f.applies.push({dataset:{payoutApply:'orderUrl'}});f.set('pb-orderUrl','invalid');f.api.savePayoutBulk();assert(!d.connectionConfigs.get(rs[0].id).orderUrl);
 f.set('pb-orderUrl','https://gateway.example.test/create');f.api.savePayoutBulk();for(const r of rs.slice(0,2)){assert.equal(d.connectionConfigs.get(r.id).orderUrl,'https://gateway.example.test/create');assert.equal(d.connectionConfigs.get(r.id).secret,'DEMO-SECRET');assert.equal(d.connectionConfigs.get(r.id).appId,'OLD-APP');}assert(!d.connectionConfigs.get(rs[2].id).orderUrl);assert(!JSON.stringify(f.model.audits).includes('DEMO-SECRET'));
});
test('限额校验失败保留原配置，IP和凭据独立于订单投影',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.direction==='代付'),previous=r.limit;f.api.setContext({id:r.id});
 for(const [k,v] of Object.entries({plMin:'500',plMax:'100',plDaily:'10000',plCallbackTime:'10',plStart:'23:00',plEnd:'06:00',plFixed:'100,200',plExcluded:'300',plIps:'192.0.2.50',plStatus:'开启',plCallbackStatus:'拒绝'}))f.set(k,v);
 f.el('#plEnabled').checked=true;f.api.savePayoutLimit();assert.equal(r.limit,previous);assert(!d.payoutLimits.has(r.id));f.set('plMin','100');f.set('plMax','500');f.api.savePayoutLimit();assert.equal(r.limit,'100 - 500');assert.equal(r.callbackStatus,'拒绝');assert.equal(d.payoutLimits.get(r.id).start,'23:00');assert(!JSON.stringify(f.model.orderChannels()).includes('192.0.2.50'));
 const other=f.model.tenantData('HS-TEN-017');assert(!other.payoutLimits?.has(r.id));
});
test('删除代付通道清理关联并禁止新订单使用，历史快照结构保留',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.id==='CH-FIAT-OUT-012');assert(r);d.connectionConfigs.set(r.id,{secret:'DEMO'});d.payoutLimits.set(r.id,{min:'1',max:'100'});d.payoutMerchantBindings.set(r.id,{merchant:{bound:true}});f.api.setContext({id:r.id});f.api.confirmPayoutDelete();assert(!d.channels.includes(r));assert(d.products.every(p=>!p.channelIds.includes(r.id)));assert(!d.connectionConfigs.has(r.id));assert(!d.payoutLimits.has(r.id));assert(!d.payoutMerchantBindings.has(r.id));assert(d.deletedChannelIds.has(r.id));
 f.ctx.tenantChannelMaster=new Map([[r.id,{id:r.id,name:r.name,acceptsNewOrders:true,products:[]}]]);f.ctx.currentTenantAccount={tenantId:f.model.tenantId};const start=overviewSource.indexOf('    if (window.HSProviderDemo) {',overviewSource.indexOf('// Only overlay edited configuration'));const end=overviewSource.indexOf('    const tenantBusinessGrantSnapshots',start);vm.runInContext(overviewSource.slice(start,end),f.ctx);assert.equal(f.ctx.tenantChannelMaster.get(r.id).acceptsNewOrders,false);assert.equal(f.ctx.tenantChannelMaster.get(r.id).name,r.name);
});
test('调额和付款测试只生成预览，余额不变且不保存收款个人资料',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.direction==='代付'&&c.status==='开启'),before=r.balance;f.api.setContext({id:r.id,key:'balance'});for(const [k,v] of Object.entries({paAmount:'10',paDirection:'increase',paRemark:'演示',paGoogle:'123456'}))f.set(k,v);f.api.runPayoutMoney();assert.equal(r.balance,before);assert(f.el('#payoutMoneyResult').textContent.includes('当前余额未改变'));
 f.api.setContext({id:r.id});for(const [k,v] of Object.entries({pxAmount:'200',pxAccount:'DEMO-ACCOUNT-1234',pxRecipient:'DEMO-RECIPIENT',pxBank:'DEMO-BANK',pxBranch:'',pxBankCode:'',pxExtra:'{}'}))f.set(k,v);f.api.runPayoutTest();assert.equal(JSON.parse(f.el('#pxResponse').value).code,'DEMO_SUCCESS');assert.equal(r.balance,before);assert(!JSON.stringify(d).includes('DEMO-ACCOUNT-1234'));assert(!JSON.stringify(f.model.audits).includes('DEMO-RECIPIENT'));
});

test('删除代付通道后提款审核候选禁用，已选订单快照仍可辨识',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.id==='CH-FIAT-OUT-004');assert(r);f.api.setContext({id:r.id});f.api.confirmPayoutDelete();
 const start=merchantsSource.indexOf('    const tenantPayoutChannels =');const end=merchantsSource.indexOf('    const fundingOrders =',start);assert(start>0&&end>start);vm.runInContext(merchantsSource.slice(start,end),f.ctx);const result=vm.runInContext(`fundingPayoutChannelProjection({authorizedPayoutChannelIds:['CH-FIAT-OUT-004']})`,f.ctx);assert.equal(result[0].selectable,false);assert.equal(result[0].acceptsNewOrders,false);
});

test('编辑代付通道同步保存限额与开关，关闭后保留配置并可重新开启',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.direction==='代付');
 channelForm(f,r);f.api.setContext({id:r.id});f.set('pcName','带限额的代付通道');f.set('plMin','20');f.set('plMax','800');f.set('plDaily','5000');f.set('plFixed','100,200');f.set('plExcluded','300');f.set('plIps','192.0.2.10');f.set('plStart','09:00');f.set('plEnd','18:00');f.set('plCallbackTime','15');f.set('plCallbackStatus','拒绝');f.el('#plEnabled').checked=true;f.api.savePayoutChannel();
 assert.equal(r.name,'带限额的代付通道');assert.equal(r.limitStatus,'开启');assert.equal(r.limit,'20 - 800');assert.equal(r.callbackTime,'15');assert.equal(r.callbackStatus,'拒绝');assert.equal(d.payoutLimits.get(r.id).submitIpBlacklist,'192.0.2.10');const config=JSON.stringify(d.payoutLimits.get(r.id));
 channelForm(f,r);f.el('#plEnabled').checked=false;f.api.savePayoutChannel();assert.equal(r.limitStatus,'关闭');assert.equal(JSON.stringify(d.payoutLimits.get(r.id)),config);
 channelForm(f,r);f.el('#plEnabled').checked=true;f.api.savePayoutChannel();assert.equal(r.limitStatus,'开启');assert.equal(JSON.stringify(d.payoutLimits.get(r.id)),config);
});
test('编辑限额校验失败不会部分保存名称、类型关系或限额开关',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.direction==='代付'),before=JSON.stringify(r),bindings=JSON.stringify(d.products);
 channelForm(f,r,'');f.api.setContext({id:r.id});f.set('pcName','不应保存');f.set('plMin','900');f.set('plMax','100');f.el('#plEnabled').checked=true;f.api.savePayoutChannel();assert.equal(JSON.stringify(r),before);assert.equal(JSON.stringify(d.products),bindings);assert(!d.payoutLimits.has(r.id));
 f.set('plMax','1000');f.set('plIps','999.0.0.1');f.api.savePayoutChannel();assert.equal(JSON.stringify(r),before);assert.equal(JSON.stringify(d.products),bindings);
});

test('代付通道主类型改为USDT后，既有CNY提款候选保留但不可选',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.id==='CH-FIAT-OUT-004'),p=d.products.find(p=>p.direction==='代付'&&p.currency==='USDT');
 channelForm(f,r,p.id);f.api.setContext({id:r.id});f.api.savePayoutChannel();assert.equal(r.asset,'USDT');assert.equal(r.productId,p.id);
 const start=merchantsSource.indexOf('    const tenantPayoutChannels ='),end=merchantsSource.indexOf('    const fundingOrders =',start);vm.runInContext(merchantsSource.slice(start,end),f.ctx);
 const rows=vm.runInContext(`fundingPayoutChannelProjection({authorizedPayoutChannelIds:['CH-FIAT-OUT-004']})`,f.ctx);assert.equal(rows.length,1);assert.equal(rows[0].id,r.id);assert.equal(rows[0].selectable,false);assert.equal(rows[0].acceptsNewOrders,false);
});
