import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/legacy/sources/channels.html',import.meta.url),'utf8');
function fixture(){
 const window={document:{}};window.top=window;let allowed=true,inScope=true;
 const inputs={vendorNameCreate:{value:'QuickPay'},vendorIntegrationSource:{value:''},vendorSourceInline:{value:'',focus(){}},vendorSourceInlineError:{textContent:''},vendorDirectionCollect:{checked:true},vendorDirectionPayout:{checked:true}};
 const audits=[],errors=[],modals=[];
 const ctx=vm.createContext({window,Date,Map,Set,JSON,Error,BigInt,activeKey:'vendors',channelCurrentAccount:{dataScope:{scopeCode:'platform.all_tenants',tenantIds:[]}},canUseChannelAction:()=>allowed,channelRowInCurrentScope:()=>inScope,escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),openModal:(...args)=>modals.push(args),$:(id)=>inputs[id.slice(1)],setModalError:m=>errors.push(m),addChannelAudit:a=>{audits.push(a);return a;},finishChange(){},fundAccountsForVendor:()=>[],findRow:id=>window.HSProviderDemo.providers.find(p=>p.id===id),fieldName:k=>k,maybeTag:(k,v)=>String(v),selectedRow:null,channelAuditLog:[],vendorSourceEdit:null,renderTable(){},document:{querySelector(){return {focus(){}};}}});
 vm.runInContext(fs.readFileSync(new URL('../src/provider-model.js',import.meta.url),'utf8'),ctx);
 ctx.rows={vendors:window.HSProviderDemo.providers,types:[],products:[]};ctx.activeModalContext={kind:'vendor',rowId:'V-001'};
 for(const name of ['vendorAuthorizedTenants','openVendorTenants','openVendorCreate','saveVendor','vendorExportValue','openDetail','renderVendorSource','startVendorSourceInline','cancelVendorSourceInline','saveVendorSourceInline']){const a=source.indexOf('    function '+name+'('),b=source.indexOf('\n    function ',a+10);assert(a>0&&b>a);vm.runInContext(source.slice(a,b),ctx);}
 return {ctx,model:window.HSProviderDemo,inputs,audits,errors,modals,block:()=>{allowed=false;},scope:()=>{inScope=false;}};
}
test('通道商授权租户名单使用实时授权关系及业务方向，不依赖通道引用数',()=>{
 const f=fixture(),p=f.model.providers[0],tenant=f.model.tenants.at(-1);
 f.model.grants.splice(0,f.model.grants.length,{tenantId:tenant.id,providerId:p.id,status:'已授权',directions:['代收'],updatedAt:'2026-10-29 10:00'});
 const rows=f.ctx.vendorAuthorizedTenants(p);assert.equal(rows.length,1);assert.equal(rows[0].id,tenant.id);assert.deepEqual(Array.from(rows[0].directions),['代收']);assert.equal(f.ctx.vendorExportValue(p,'authorizedTenants'),1);
 rows[0].name='改写';assert.notEqual(f.model.tenants.at(-1).name,'改写');
 f.ctx.openVendorTenants(p);assert.match(f.modals[0][1],/授权租户名单/);assert.match(f.modals[0][1],new RegExp(tenant.id));
 f.model.grants[0].status='未授权';assert.equal(f.ctx.vendorAuthorizedTenants(p).length,0);f.ctx.openVendorTenants(p);assert.match(f.modals[1][1],/暂无授权租户/);
});
test('授权租户列表和导出人数限制账号范围，无授权查看权限不展示名单',()=>{
 const f=fixture(),p=f.model.providers[0],ids=f.ctx.vendorAuthorizedTenants(p).map(t=>t.id);assert(ids.length>1);
 f.ctx.channelCurrentAccount.dataScope={scopeCode:'platform.assigned_tenants',tenantIds:[ids[0]]};assert.equal(f.ctx.vendorAuthorizedTenants(p).length,1);assert.equal(f.ctx.vendorExportValue(p,'authorizedTenants'),1);assert.equal(f.ctx.vendorExportValue(p,'authorizedTenants',{scopeCode:'empty',tenantIds:[]}),0);
 f.scope();f.ctx.openVendorTenants(p);assert.equal(f.modals.length,0);f.block();assert.equal(f.ctx.vendorAuthorizedTenants(p).length,0);assert.equal(f.ctx.vendorExportValue(p,'authorizedTenants'),'—');f.ctx.openVendorTenants(p);assert.equal(f.modals.length,0);
});
test('对接来源作为可选备注保存与清空，转义展示且不改授权关系',()=>{
 const f=fixture(),p=f.model.providers[0],grants=JSON.stringify(f.model.grants);f.inputs.vendorIntegrationSource.value='  商务介绍 <img src=x>\n对接人：张三  ';f.ctx.saveVendor();assert.equal(p.integrationSource,'商务介绍 <img src=x>\n对接人：张三');assert.equal(f.audits.length,1);assert.match(f.audits[0].summary,/对接来源/);assert.equal(JSON.stringify(f.model.grants),grants);
 f.ctx.openVendorCreate(p);assert.match(f.modals[0][1],/&lt;img src=x&gt;/);assert(!f.modals[0][1].includes('<img src=x>'));assert.match(f.modals[0][1],/maxlength="200"/);f.ctx.openDetail(p.id);assert.match(f.modals[1][1],/&lt;img src=x&gt;/);assert(!f.modals[1][1].includes('<img src=x>'));
 f.inputs.vendorIntegrationSource.value='';f.ctx.saveVendor();assert.equal(p.integrationSource,'');
});
test('对接来源超长或保存时无权限、范围外均不写资料和成功审计',()=>{
 const f=fixture(),p=f.model.providers[0];p.integrationSource='原备注';f.inputs.vendorIntegrationSource.value='x'.repeat(201);f.ctx.saveVendor();assert.match(f.errors[0],/200/);assert.equal(p.integrationSource,'原备注');assert.equal(f.audits.length,0);
 f.inputs.vendorIntegrationSource.value='新备注';f.scope();f.ctx.saveVendor();assert.equal(p.integrationSource,'原备注');f.block();f.ctx.saveVendor();assert.equal(p.integrationSource,'原备注');assert.equal(f.audits.length,0);
});


test('授权名单读取页面查看权限，通道商编辑读取独立操作权限，不相互替代',()=>{
 const ctx=vm.createContext({platformChannelAuthorization:{pagePermissions:['platform.business_grant.view']},platformChannelActionPermissions:new Set(['platform.channel.vendor.manage'])});
 const a=source.indexOf('    function hasChannelPermission('),b=source.indexOf('    function canUseChannelAction(',a);vm.runInContext(source.slice(a,b),ctx);
 assert.equal(ctx.hasChannelPermission('platform.business_grant.view'),true);assert.equal(ctx.hasChannelPermission('platform.channel.vendor.manage'),true);
 ctx.platformChannelAuthorization.pagePermissions=[];assert.equal(ctx.hasChannelPermission('platform.business_grant.view'),false);ctx.platformChannelActionPermissions.delete('platform.channel.vendor.manage');assert.equal(ctx.hasChannelPermission('platform.channel.vendor.manage'),false);
});


test('双击来源可行内编辑并只改备注，取消无写入，保存幂等且保留转义',()=>{
 const f=fixture(),p=f.model.providers[0],before=JSON.stringify(f.model.grants);p.integrationSource='原来源';
 f.ctx.startVendorSourceInline(p);assert.match(f.ctx.renderVendorSource(p),/textarea/);assert.equal(f.ctx.vendorSourceEdit.value,'原来源');f.inputs.vendorSourceInline.value='取消的草稿';f.ctx.cancelVendorSourceInline(p.id);assert.equal(p.integrationSource,'原来源');assert.equal(f.audits.length,0);
 f.ctx.startVendorSourceInline(p);f.inputs.vendorSourceInline.value='  商务介绍 <b>文字</b>  ';f.ctx.saveVendorSourceInline(p.id);assert.equal(p.integrationSource,'商务介绍 <b>文字</b>');assert.match(f.ctx.renderVendorSource(p),/&lt;b&gt;文字&lt;\/b&gt;/);assert.equal(f.audits.length,1);f.ctx.saveVendorSourceInline(p.id);assert.equal(f.audits.length,1);assert.equal(p.name,'QuickPay');assert.equal(JSON.stringify(f.model.grants),before);
 f.ctx.startVendorSourceInline(p);f.inputs.vendorSourceInline.value='';f.ctx.saveVendorSourceInline(p.id);assert.equal(p.integrationSource,'');assert.match(f.ctx.renderVendorSource(p),/—/);
});
test('行内保存拒绝超长、资料变化、权限撤回和范围外，保留原备注与审计',()=>{
 for(const condition of ['length','stale','permission','scope']){
  const f=fixture(),p=f.model.providers[0];p.integrationSource='原值';f.ctx.startVendorSourceInline(p);f.inputs.vendorSourceInline.value=condition==='length'?'x'.repeat(201):'新值';
  if(condition==='stale')p.integrationSource='其他人修改';if(condition==='permission')f.block();if(condition==='scope')f.scope();f.ctx.saveVendorSourceInline(p.id);
  assert.equal(p.integrationSource,condition==='stale'?'其他人修改':'原值');assert.equal(f.audits.length,0);
 }
 const f=fixture();f.block();f.ctx.startVendorSourceInline(f.model.providers[0]);assert.equal(f.ctx.vendorSourceEdit,null);assert(!f.ctx.renderVendorSource(f.model.providers[0]).includes('data-vendor-source-edit'));
});
