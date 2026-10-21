import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/channels.html',import.meta.url),'utf8');
const providerSource=fs.readFileSync(new URL('../src/provider-model.js',import.meta.url),'utf8');
const merchantsSource=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/merchants.html',import.meta.url),'utf8');
const overviewSource=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/overview.html',import.meta.url),'utf8');
function fixture(){
 const elements=new Map(),applies=[],listeners=new Map();let feedbackAbsent=false;const el=selector=>{if(feedbackAbsent&&selector==='#modalFeedback')return null;if(!elements.has(selector))elements.set(selector,{value:'',checked:false,disabled:false,hidden:false,innerHTML:'',textContent:'',dataset:{},setAttribute(){},focus(){},addEventListener(){},insertAdjacentHTML(){},classList:{add(){},remove(){},contains(){return false;}}});return elements.get(selector);};
 const window={document:{}};window.top=window;
 const ctx=vm.createContext({window,Map,Set,URL,setTimeout(){},document:{querySelector:el,querySelectorAll:selector=>selector==='[data-payout-apply]:checked'?applies:[],addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}}});vm.runInContext(providerSource,ctx);
 const script=source.slice(source.lastIndexOf('<script>')+8,source.lastIndexOf('</script>'));
 const modified=script.replace(/ function close\(\)\{[^\n]+\}/,' function close(){context=null;}').replace(/ function finish\(text,object\)\{[^\n]+\}/,' function finish(text,object){model.log(text,object,tenantId);}').replace(/ render\(\);\s*\}\)\(\);\s*$/,`window.payoutTest={productBindingRows,bindingsFor,availableBindings,setCodeBinding,saveBindingEdit,openBindCodes,openBindMerchants,saveMerchantRate,renderProductRow,saveCollectionCode,collectionRateAction,confirmDeleteProduct,configurationActionAllowed,productAction,savePayoutChannel,savePayoutDev,savePayoutBulk,savePayoutLimit,setPayoutType,confirmPayoutDelete,runPayoutMoney,runPayoutTest,saveReplicaProduct,setContext(value){context=value;}};})();`);
 assert.notEqual(modified,script);vm.runInContext(modified,ctx);
 return {key(event){for(const fn of listeners.get('keydown')||[])fn(event);},change(target){target.hasAttribute||=()=>false;for(const fn of listeners.get('change')||[])fn({target});},noModalFeedback(){feedbackAbsent=true;},click(action,id,extra={}){const button={dataset:{action,id,...extra},closest(){return null;}};const event={target:{closest(selector){return selector==='button'?button:null;}}};for(const fn of listeners.get('click')||[])fn(event);},el,ctx,model:window.HSProviderDemo,api:window.payoutTest,applies,set:(id,value)=>el('#'+id).value=value};
}
function setTenantGrantDirections(model,tenantId,directions){for(const g of model.grants.filter(g=>g.tenantId===tenantId))g.directions=directions.filter(d=>model.providers.find(p=>p.id===g.providerId).directions.includes(d));}
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

test('租户仅有代收许可时，代付创建、编辑、开发、限额和批量配置均不保存',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.providerId==='V-001'&&c.direction==='代付');
 setTenantGrantDirections(f.model,'HS-TEN-001',['代收']);const before=JSON.stringify(d.channels),products=JSON.stringify(d.products);
 channelForm(f,{name:'不应新增',providerId:'V-001',weight:'2',status:'开启'});f.api.setContext({id:undefined});f.api.savePayoutChannel();assert.equal(JSON.stringify(d.channels),before);
 channelForm(f,r);f.api.setContext({id:r.id});f.set('pcName','不应编辑');f.api.savePayoutChannel();assert.equal(JSON.stringify(d.channels),before);assert.equal(JSON.stringify(d.products),products);
 f.api.savePayoutDev();f.api.savePayoutLimit();assert.equal(d.connectionConfigs.size,0);assert.equal(d.payoutLimits.size,0);
 f.api.setContext({kind:'payoutBulkCallback',ids:[r.id]});f.set('pbTime','30');f.set('pbCallback','拒绝');f.api.savePayoutBulk();assert.equal(JSON.stringify(d.channels),before);
 setTenantGrantDirections(f.model,'HS-TEN-001',['代收','代付']);channelForm(f,r);f.set('pcName','重新授权后可编辑');f.api.setContext({id:r.id});f.api.savePayoutChannel();assert.equal(r.name,'重新授权后可编辑');
});
test('通道商支持方向不匹配时，即使租户双方向许可也不能保存代付',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.providerId==='V-001'&&c.direction==='代付');f.model.providers.find(p=>p.id==='V-001').directions=['代收'];
 channelForm(f,r);f.api.setContext({id:r.id});f.set('pcName','不应保存方向不匹配');const before=JSON.stringify(r);f.api.savePayoutChannel();assert.equal(JSON.stringify(r),before);
});

test('产品批量开关按产品方向校验，不把产品ID当成通道ID',()=>{
 const f=fixture(),d=f.model.tenantData(),products=d.products.filter(p=>p.direction==='代收');f.api.setContext({kind:'productBatch',ids:products.map(p=>p.id),status:'关闭'});
 assert.equal(f.api.configurationActionAllowed('confirmProductBatch',''),true);f.api.productAction('confirmProductBatch','',{});assert(products.every(p=>p.status==='关闭'));
 setTenantGrantDirections(f.model,'HS-TEN-001',['代付']);f.api.setContext({kind:'productBatch',ids:products.map(p=>p.id),status:'开启'});assert.equal(f.api.configurationActionAllowed('confirmProductBatch',''),false);assert(products.every(p=>p.status==='关闭'));
});

test('批量删除编码逐项校验通道许可，任一未授权时整批保留',()=>{
 const f=fixture(),d=f.model.tenantData(),rows=d.channels.filter(c=>c.direction==='代收'&&c.collectionTypes.length).slice(0,2);assert.equal(rows.length,2);
 const targets=rows.map(r=>({channelId:r.id,id:r.collectionTypes[0].id,code:r.collectionTypes[0].code})),before=JSON.stringify(d.channels);
 f.model.providers.find(p=>p.id===rows[1].providerId).directions=['代付'];f.api.setContext({kind:'deleteCodes',targets});f.click('confirmDeleteCodes');assert.equal(JSON.stringify(d.channels),before);
 f.model.providers.find(p=>p.id===rows[1].providerId).directions=['代收','代付'];f.api.setContext({kind:'deleteCodes',targets});f.click('confirmDeleteCodes');assert(targets.every(t=>!d.channels.find(r=>r.id===t.channelId).collectionTypes.some(c=>c.id===t.id)));
});

test('商户批量费率按产品方向校验，不把商户ID当成通道目标',()=>{
 const f=fixture(),p=f.model.tenantData().products.find(p=>p.direction==='代收');f.api.setContext({kind:'merchantRate',id:p.id,targets:['DEMO-M-01','DEMO-M-02'],prop:'rate'});
 assert.equal(f.api.configurationActionAllowed('saveMerchantRate',''),true);
 setTenantGrantDirections(f.model,'HS-TEN-001',['代付']);assert.equal(f.api.configurationActionAllowed('saveMerchantRate',''),false);
});

test('未打开弹窗时，未授权方向操作正常提示并拒绝，不产生脚本错误',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.direction==='代付');setTenantGrantDirections(f.model,'HS-TEN-001',['代收']);f.noModalFeedback();const before=JSON.stringify(d.channels);
 assert.doesNotThrow(()=>f.click('channel',r.id));assert(f.el('#toastText').textContent.includes('代付'));assert.equal(JSON.stringify(d.channels),before);
});

test('新增代收编码使用单一三方编码输入，保存到所选父通道并校验必填及范围',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.direction==='代收'),other=d.channels.find(c=>c.direction==='代收'&&c.id!==r.id),before=r.collectionTypes.length,otherBefore=JSON.stringify(other);
 f.api.setContext({kind:'collectionCode',id:r.id});for(const [id,value] of Object.entries({childName:'',childRate:'',childRange:'1-10000',childCode:'BLUE-CODE-NEW',childAgentRate:'0.003'}))f.set(id,value);
 f.api.saveCollectionCode();assert.equal(r.collectionTypes.length,before);f.set('childName','新增编码备注');f.set('childRange','100-10');f.api.saveCollectionCode();assert.equal(r.collectionTypes.length,before);
 f.set('childRange','1-10000');f.api.saveCollectionCode();const c=r.collectionTypes.at(-1);assert.equal(c.code,'BLUE-CODE-NEW');assert.equal(c.thirdCode,c.code);assert.equal(c.name,'新增编码备注');assert.equal(c.rate,'0');assert.equal(c.agentRate,'0.003');assert.equal(JSON.stringify(other),otherBefore);
 f.api.setContext({kind:'collectionCode',id:r.id});f.api.saveCollectionCode();assert.equal(r.collectionTypes.length,before+1);
});

test('代付保存按所选通道商授权校验，另一通道商的代付授权不能借用',()=>{
 const f=fixture(),d=f.model.tenantData();f.model.grantFor('HS-TEN-001','V-001').directions=['代收'];
 const before=d.channels.length;channelForm(f,{name:'QuickPay 不可代付',providerId:'V-001',status:'开启'});f.api.setContext({id:undefined});f.api.savePayoutChannel();assert.equal(d.channels.length,before);
 channelForm(f,{name:'BridgePay 可代付',providerId:'V-003',status:'开启'});f.api.setContext({id:undefined});f.api.savePayoutChannel();assert.equal(d.channels.length,before+1);assert.equal(d.channels.at(-1).providerId,'V-003');
});

test('代付产品单个绑定通道保留主类型，与其他产品及租户隔离',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.id==='PROD-OUT-002'),r=d.channels.find(c=>c.direction==='代付'&&c.providerId==='V-003'),main=d.products.find(p=>p.id===r.productId),mainBefore=JSON.stringify(main.channelIds),otherBefore=JSON.stringify(f.model.tenantData('HS-TEN-017'));
 f.api.setContext({kind:'bindCodes',id:p.id});f.api.setCodeBinding(r.id,true);assert(p.channelIds.includes(r.id));assert.equal(r.productId,main.id);assert.equal(JSON.stringify(main.channelIds),mainBefore);
 f.api.setCodeBinding(r.id,false);assert(!p.channelIds.includes(r.id));assert.equal(JSON.stringify(f.model.tenantData('HS-TEN-017')),otherBefore);
 f.api.setContext({kind:'bindCodes',id:main.id});f.api.setCodeBinding(r.id,false);assert(main.channelIds.includes(r.id));
 f.api.setContext({kind:'bindCodes',id:p.id});const collect=d.channels.find(c=>c.direction==='代收');f.api.setCodeBinding(collect.collectionTypes[0].id,true);assert(!p.channelIds.includes(collect.id));
});
test('代付产品候选只含获对应业务授权的通道，搜索和批量绑定解绑生效',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.id==='PROD-OUT-002'),quick=d.channels.find(c=>c.direction==='代付'&&c.providerId==='V-001');f.model.grantFor('HS-TEN-001','V-001').directions=['代收'];
 f.api.setContext({kind:'bindCodes',id:p.id});assert(f.api.availableBindings().every(r=>r.channel.direction==='代付'&&r.channel.providerId!=='V-001'));
 f.api.setCodeBinding(quick.id,true);assert(!p.channelIds.includes(quick.id));
 f.set('bindingCode','BRIDGE-CNY');const visible=f.api.availableBindings();assert.equal(visible.length,1);f.click('bindAllCodes');assert.deepEqual(Array.from(p.channelIds),[visible[0].channel.id]);
 f.set('bindingCode','');f.click('bindAllCodes');assert.equal(p.channelIds.length,f.api.availableBindings().length);f.click('unbindAllCodes');assert.equal(p.channelIds.length,0);
 const main=d.products.find(p=>p.id==='PROD-OUT-001');f.api.setContext({kind:'bindCodes',id:main.id});f.click('unbindAllCodes');assert(d.channels.filter(c=>c.productId===main.id).every(c=>main.channelIds.includes(c.id)));
});
test('代付绑定配置修改范围权重保存并校验，通道侧类型更新能回显',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.id==='PROD-OUT-002'),r=d.channels.find(c=>c.direction==='代付');
 f.api.setContext({kind:'bindingEdit',id:p.id,codeId:r.id,prop:'range'});f.set('bindingValue','20-10');f.api.saveBindingEdit();assert.equal(p.codeBindings,undefined);
 f.set('bindingValue','20-1000');f.api.saveBindingEdit();assert.equal(p.codeBindings[r.id].range,'20-1000');
 f.api.setContext({kind:'bindingEdit',id:p.id,codeId:r.id,prop:'weight'});f.set('bindingValue','101');f.api.saveBindingEdit();assert.equal(p.codeBindings[r.id].weight,'1');f.set('bindingValue','5');f.api.saveBindingEdit();assert.equal(p.codeBindings[r.id].weight,'5');
 f.api.setContext({kind:'payoutTypes',id:r.id});f.api.setPayoutType(p.id,true);assert.equal(f.api.bindingsFor(p)[r.id].bound,true);f.api.setPayoutType(p.id,false);assert.equal(f.api.bindingsFor(p)[r.id].bound,false);assert.equal(p.codeBindings[r.id].weight,'5');
 f.model.grantFor('HS-TEN-001',r.providerId).directions=['代收'];f.api.setContext({kind:'bindingEdit',id:p.id,codeId:r.id,prop:'weight'});f.set('bindingValue','8');f.api.saveBindingEdit();assert.equal(p.codeBindings[r.id].weight,'5');
});
test('代付产品商户绑定、搜索批量和费率保存与代收配置隔离',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.id==='PROD-OUT-002'),collect=d.products.find(p=>p.direction==='代收'),before=JSON.stringify(collect);
 f.api.openBindMerchants(p.id);f.change({dataset:{bindMerchant:'MCH-2031'},checked:true});assert(p.merchantBindings['MCH-2031'].bound);
 f.set('bindingMerchant','远航');f.click('bindAllMerchants');assert(p.merchantBindings['DEMO-MCH-002'].bound);assert(!p.merchantBindings['DEMO-MCH-003']);f.click('unbindAllMerchants');assert(!p.merchantBindings['DEMO-MCH-002'].bound);assert(p.merchantBindings['MCH-2031'].bound);
 f.api.setContext({kind:'merchantRate',id:p.id,merchantId:'MCH-2031',prop:'rate'});f.set('merchantRateValue','-1');f.api.saveMerchantRate();assert.equal(p.merchantBindings['MCH-2031'].rate,'0');f.set('merchantRateValue','0.015');f.api.saveMerchantRate();assert.equal(p.merchantBindings['MCH-2031'].rate,'0.015');assert.equal(JSON.stringify(collect),before);
 setTenantGrantDirections(f.model,'HS-TEN-001',['代收']);f.change({dataset:{bindMerchant:'MCH-2031'},checked:false});assert(p.merchantBindings['MCH-2031'].bound);
});
test('共享绑定通道改动保留代收子编码粒度',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.direction==='代收'),r=d.channels.find(c=>c.direction==='代收'&&c.collectionTypes.length>1),first=r.collectionTypes[0],second=r.collectionTypes[1];f.api.setContext({kind:'bindCodes',id:p.id});
 f.api.setCodeBinding(first.id,true);f.api.setCodeBinding(second.id,true);f.api.setCodeBinding(first.id,false);assert(p.channelIds.includes(r.id));assert(f.api.bindingsFor(p)[second.id].bound);f.api.setCodeBinding(second.id,false);assert(!p.channelIds.includes(r.id));assert(f.api.availableBindings().every(r=>r.channel.direction==='代收'));
});

test('已配置代收产品的父通道新增子编码时，不自动授权绑定新编码',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.id==='PROD-IN-001'),r=d.channels.find(c=>p.channelIds.includes(c.id)&&c.collectionTypes.length);
 f.api.bindingsFor(p);const old=r.collectionTypes[0];assert(p.codeBindings[old.id].bound);r.collectionTypes.push({id:r.id+'-NEW',code:'NEW-CODE',name:'新增编码',rule:'1-10000',status:'开启'});
 f.api.openBindCodes(p.id);assert.equal(p.codeBindings[r.id+'-NEW'].bound,false);assert(p.codeBindings[old.id].bound);assert(p.channelIds.includes(r.id));
});

test('代付编辑权重加减限制1至9，状态单选提交保存且保留限额配置',()=>{
 const f=fixture(),r=f.model.tenantData().channels.find(c=>c.direction==='代付');channelForm(f,r);f.api.setContext({kind:'payoutChannel',id:r.id});
 f.set('pcWeight','9');f.click('payoutWeightStep','',{step:'1'});assert.equal(f.el('#pcWeight').value,'9');f.set('pcWeight','1');f.click('payoutWeightStep','',{step:'-1'});assert.equal(f.el('#pcWeight').value,'1');f.click('payoutWeightStep','',{step:'1'});assert.equal(f.el('#pcWeight').value,'2');
 f.change({name:'pcStatusChoice',value:'关闭',dataset:{}});assert.equal(f.el('#pcStatus').value,'关闭');f.set('pcGroup','DEMO-GROUP');f.api.savePayoutChannel();assert.equal(r.status,'关闭');assert.equal(r.weight,'2');assert.equal(r.tgGroup,'DEMO-GROUP');assert.equal(r.limitStatus,'开启');
});


test('代收商户批量操作仅作用已搜索的列表，未搜索输入不改变目标',()=>{
 const f=fixture(),p=f.model.tenantData().products.find(p=>p.direction==='代收');f.api.openBindMerchants(p.id);
 f.set('bindingMerchant','远航');f.click('merchantSearch');f.click('bindAllMerchants');assert(p.merchantBindings['DEMO-MCH-002'].bound);assert(!p.merchantBindings['DEMO-MCH-003']);
 f.set('bindingMerchant','不存在');f.click('unbindAllMerchants');assert.equal(p.merchantBindings['DEMO-MCH-002'].bound,false);
 f.click('merchantSearch');const before=JSON.stringify(p.merchantBindings);f.click('bindAllMerchants');assert.equal(JSON.stringify(p.merchantBindings),before);
});
test('代收产品按通道与编码备注组合搜索，批量绑定仅作用搜索结果',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.direction==='代收');f.api.openBindCodes(p.id);f.click('unbindAllCodes');const r=d.channels.find(c=>c.direction==='代收'&&c.collectionTypes.length>1&&f.model.canConfigureChannel(f.model.tenantId,c.providerId,'代收')),code=r.collectionTypes[0];
 f.set('bindingChannel',r.id);f.set('bindingCode',code.name);f.click('bindingSearch');const rows=f.api.availableBindings();assert.equal(rows.length,1);assert.equal(rows[0].code.id,code.id);
 f.set('bindingCode','未执行搜索');f.click('bindAllCodes');assert.equal(p.codeBindings[code.id].bound,true);assert.equal(Object.values(p.codeBindings).filter(b=>b.bound).length,1);
 f.set('bindingCode',code.code.toLowerCase());f.click('bindingSearch');assert.equal(f.api.availableBindings()[0].code.id,code.id);f.set('bindingChannel','不存在');f.click('bindingSearch');assert.equal(f.api.availableBindings().length,0);
});
test('代收编码回车复用确定保存和校验，组合输入及长按不提交',()=>{
 const f=fixture(),r=f.model.tenantData().channels.find(c=>c.direction==='代收'&&c.collectionTypes.length),c=r.collectionTypes[0],before=c.rate;
 f.api.setContext({kind:'collectionCode',id:r.id,codeId:c.id});for(const [k,v] of Object.entries({childName:c.name,childCode:c.code,childRange:c.rule,childRate:'-1'}))f.set(k,v);
 f.el('#modalBackdrop').classList.contains=()=>true;let attempts=0,prevented=0;f.el('#modalFoot [data-action="saveCollectionCode"]').click=()=>{attempts++;f.click('saveCollectionCode');};const event={key:'Enter',target:{matches:selector=>selector==='#modalBody input'},preventDefault(){prevented++;}};
 f.key(event);assert.equal(c.rate,before);assert.match(f.el('#modalFeedback').textContent,/有效费率/);f.set('childRate','0.0123');f.key({...event,isComposing:true});f.key({...event,repeat:true});assert.equal(c.rate,before);assert.equal(attempts,1);
 f.key(event);assert.equal(c.rate,'0.0123');assert.equal(attempts,2);assert.equal(prevented,3);
 f.model.grantFor(f.model.tenantId,r.providerId).directions=['代付'];f.set('childRate','0.04');f.key(event);assert.equal(c.rate,'0.0123');
});
test('代收产品删除可预览自动解绑，取消或配置变化不会部分解绑',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.direction==='代收'),before=JSON.stringify(p),channelsBefore=JSON.stringify(d.channels),count=d.products.length;
 f.click('deleteProduct',p.id);assert.match(f.el('#modalBody').innerHTML,/自动解除/);f.click('close');assert.equal(d.products.length,count);assert.equal(JSON.stringify(p),before);
 f.click('deleteProduct',p.id);p.merchantBindings||={};p.merchantBindings.TEST={bound:true};f.click('confirmDeleteProduct');assert(d.products.includes(p));assert.match(f.el('#modalFeedback').textContent,/配置已变化/);assert.equal(JSON.stringify(d.channels),channelsBefore);assert(p.merchantBindings.TEST.bound);
 f.api.setContext({kind:'deleteProduct',id:'MISSING'});f.api.confirmDeleteProduct();assert.equal(d.products.length,count);
});
test('删除代收产品自动清除自身商户及编码绑定，保留通道和其他产品，编码可重新创建',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.direction==='代收'),code=p.productNo,related=d.channels.find(c=>p.channelIds.includes(c.id)),channelCount=d.channels.length,codeBefore=JSON.stringify(related.collectionTypes),balance=related.balance,otherProduct=d.products.find(x=>x.id!==p.id),otherProductBefore=JSON.stringify(otherProduct),otherBefore=JSON.stringify(f.model.tenantData('HS-TEN-017'));
 f.api.bindingsFor(p);p.merchantBindings={OLD:{bound:true,rate:'0.9'}};d.codeConfigs.set(related.collectionTypes[0].id,{secret:'DEMO-KEEP'});f.model.log('历史订单审计样例',p.id,f.model.tenantId);const audit=f.model.audits[0];f.click('deleteProduct',p.id);f.click('confirmDeleteProduct');
 assert(!d.products.includes(p));assert.equal(p.channelIds.length,0);assert.equal(Object.keys(p.merchantBindings).length,0);assert.equal(Object.keys(p.codeBindings).length,0);assert.equal(d.channels.length,channelCount);assert.equal(JSON.stringify(related.collectionTypes),codeBefore);assert.equal(related.balance,balance);assert.equal(d.codeConfigs.get(related.collectionTypes[0].id).secret,'DEMO-KEEP');assert(related.modified);assert.equal(JSON.stringify(otherProduct),otherProductBefore);assert(f.model.audits.includes(audit));
 f.api.setContext({kind:'replicaProduct',direction:'代收'});for(const [k,v] of Object.entries({rpName:'同编码新产品',rpCode:code,rpCurrency:'CNY',rpRate:'0.01'}))f.set(k,v);f.api.saveReplicaProduct();const fresh=d.products.find(x=>x.productNo===code&&x.direction==='代收');assert(fresh);assert.notEqual(fresh.id,p.id);assert.equal(fresh.merchantBindings,undefined);assert.equal(fresh.codeBindings,undefined);assert.equal(fresh.channelIds.length,0);assert.equal(JSON.stringify(f.model.tenantData('HS-TEN-017')),otherBefore);
});
test('代收产品确认删除前授权或租户变化时不删除、不解绑',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.direction==='代收');f.click('deleteProduct',p.id);const before=JSON.stringify(p);f.model.tenantId='HS-TEN-017';f.api.confirmDeleteProduct();assert(d.products.includes(p));assert.equal(JSON.stringify(p),before);f.model.tenantId='HS-TEN-001';for(const g of f.model.grants.filter(g=>g.tenantId==='HS-TEN-001'))g.directions=['代付'];f.click('confirmDeleteProduct');assert(d.products.includes(p));assert.equal(JSON.stringify(p),before);
});

function inlineRateEditor(f,r,c){
 const feedback={textContent:''},controls=Object.fromEntries(['edit','save','cancel'].map(a=>[a+'CollectionRate',{hidden:a!=='edit',focus(){}}]));
 const input={value:c.rate,readOnly:true,dataset:{collectionRate:c.id,channelId:r.id},focus(){},select(){},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},matches:s=>s==='[data-collection-rate]',closest:()=>editor};
 const editor={querySelector(s){if(s==='[data-collection-rate]')return input;if(s==='.collection-rate-error')return feedback;return controls[s.match(/data-action="([^"]+)"/)[1]];}};
 for(const [a,b] of Object.entries(controls)){b.closest=()=>editor;b.click=()=>f.api.collectionRateAction(a,r.id,c.id,b);}
 return {input,feedback,controls,run:a=>controls[a+'CollectionRate'].click(),key:(key,extra={})=>f.key({key,target:input,preventDefault(){},...extra})};
}
test('列表费率须先点击修改，回车校验并仅保存目标编码',()=>{
 const f=fixture(),d=f.model.tenantData(),r=d.channels.find(c=>c.direction==='代收'&&c.collectionTypes.length>1),c=r.collectionTypes[0],other=r.collectionTypes[1].rate,old=c.rate,tenantBefore=JSON.stringify(f.model.tenantData('HS-TEN-017')),e=inlineRateEditor(f,r,c);
 e.input.value='0.2';e.run('save');assert.equal(c.rate,old);e.run('edit');assert.equal(e.input.readOnly,false);e.input.value='-1';e.key('Enter');assert.equal(c.rate,old);assert.match(e.feedback.textContent,/非负费率/);e.input.value='0.0123';e.key('Enter',{isComposing:true});e.key('Enter',{repeat:true});assert.equal(c.rate,old);e.key('Enter');assert.equal(c.rate,'0.0123');assert.equal(e.input.readOnly,true);assert.equal(e.controls.editCollectionRate.hidden,false);assert.equal(r.collectionTypes[1].rate,other);assert.equal(JSON.stringify(f.model.tenantData('HS-TEN-017')),tenantBefore);
});
test('列表费率取消或Escape恢复原值，失焦不写入',()=>{
 const f=fixture(),r=f.model.tenantData().channels.find(c=>c.direction==='代收'&&c.collectionTypes.length),c=r.collectionTypes[0],old=c.rate,e=inlineRateEditor(f,r,c);
 e.run('edit');e.input.value='0.5';assert.equal(c.rate,old);e.run('cancel');assert.equal(e.input.value,old);assert(e.input.readOnly);e.run('edit');e.input.value='0.8';e.key('Escape');assert.equal(c.rate,old);assert.equal(e.input.value,old);assert.equal(e.feedback.textContent,'');
});
test('列表费率保存复验记录、授权及租户，失败不覆盖现值',()=>{
 const f=fixture(),r=f.model.tenantData().channels.find(c=>c.direction==='代收'&&c.collectionTypes.length),c=r.collectionTypes[0],e=inlineRateEditor(f,r,c);
 e.run('edit');e.input.value='0.2';c.rate='0.3';e.run('save');assert.equal(c.rate,'0.3');assert.match(e.feedback.textContent,/记录已变化/);e.run('cancel');assert.equal(e.input.value,'0.3');e.run('edit');e.input.value='0.4';f.model.grantFor(f.model.tenantId,r.providerId).directions=['代付'];e.run('save');assert.equal(c.rate,'0.3');e.run('cancel');f.model.grantFor(f.model.tenantId,r.providerId).directions=['代收'];e.run('edit');e.input.value='0.5';f.model.tenantId='HS-TEN-017';e.run('save');assert.equal(c.rate,'0.3');
});

test('代收产品删除确认期间仅部分关联通道商撤权也不执行，既有撤权关系仍可重新确认清理',()=>{
 const f=fixture(),d=f.model.tenantData(),p=d.products.find(p=>p.direction==='代收'),r=d.channels.find(c=>p.channelIds.includes(c.id)),grant=f.model.grantFor(f.model.tenantId,r.providerId);f.click('deleteProduct',p.id);const before=JSON.stringify(p),channels=JSON.stringify(d.channels);grant.directions=['代付'];assert(f.model.tenantBusinessDirections(f.model.tenantId).includes('代收'));f.click('confirmDeleteProduct');assert(d.products.includes(p));assert.equal(JSON.stringify(p),before);assert.equal(JSON.stringify(d.channels),channels);assert.match(f.el('#modalFeedback').textContent,/授权已变化/);
 f.click('close');f.click('deleteProduct',p.id);f.click('confirmDeleteProduct');assert(!d.products.includes(p));assert(d.channels.includes(r));
});
