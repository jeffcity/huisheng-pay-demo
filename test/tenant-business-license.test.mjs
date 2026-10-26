import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const modelSource=fs.readFileSync(new URL('../src/provider-model.js',import.meta.url),'utf8');
const tenantSource=fs.readFileSync(new URL('../public/legacy/sources/tenants.html',import.meta.url),'utf8');
function fixture(){
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:true});return elements.get(id);};
 const window={document:{}};window.top=window;const profile={id:'HS-TEN-001',name:'汇盛东南亚',contact:'Lin',phone:'+63 917 208 8891',expire:'2027-01-31',remark:'',domain:'tenant-001.hs-pay.com',status:'正常'};
 const permissions={canEdit:true,canBusinessAuth:true};const errors=[],receipts=[];let inScope=true;
 const ctx=vm.createContext({window,Date,Map,Set,JSON,Error,document:{getElementById:el},tenants:[profile],appState:{editingTenantId:profile.id},getPermissions:()=>permissions,tenantInCurrentScope:()=>inScope,canCreateTenant:()=>false,showFormError:(id,text)=>errors.push(text),ensureTenantAccessState(){},addTenantAudit(){return {};},setOperationReceipt(){},closeTenantModal(){},applyFilters(){},showToast(){},platformNow:()=>'2026-10-24 12:00:00',tenantBillingSummary:tenant=>'saved '+tenant.id,finishTenantAction:(tenant,receipt)=>receipts.push(receipt)});
 vm.runInContext(modelSource,ctx);const billingStart=tenantSource.indexOf('    function readTenantBillingForm()'),billingEnd=tenantSource.indexOf('    function updateTenantBillingPreview()',billingStart);vm.runInContext(tenantSource.slice(billingStart,billingEnd),ctx);const start=tenantSource.indexOf('    function saveTenantProfile()'),end=tenantSource.indexOf('    function finishTenantAction',start);assert(start>0&&end>start);vm.runInContext(tenantSource.slice(start,end),ctx);
 for(const [id,value] of Object.entries({tenantCollectionBillingMode:'percentage',tenantCollectionBillingValue:'',tenantPayoutBillingMode:'percentage',tenantPayoutBillingValue:'',tenantNameInput:profile.name,contactInput:profile.contact,mobileInput:profile.phone,expireInput:profile.expire,tenantRemarkInput:'',domainPrefixInput:'tenant-001',initialLoginIpInput:'192.0.2.1'}))el(id).value=value;
 return {el,profile,permissions,errors,receipts,model:window.HSProviderDemo,billingOnly(){ctx.appState.editingBillingOnly=true;},setScope(value){inScope=value;},save(){vm.runInContext('saveTenantProfile()',ctx);}};
}
test('租户编辑资料不再修改通道商授权业务',()=>{
 const f=fixture();f.model.grantFor('HS-TEN-001','V-001').directions=['代收'];const before=JSON.stringify(f.model.grants);
 f.el('tenantNameInput').value='修改租户名称';f.save();assert.equal(f.errors.length,0);assert.equal(f.profile.name,'修改租户名称');assert.equal(JSON.stringify(f.model.grants),before);
 assert.equal(f.model.canConfigureChannel('HS-TEN-001','V-001','代付'),false);
});
test('租户资料校验失败不改变通道商授权',()=>{
 const f=fixture(),before=JSON.stringify(f.model.grants);f.el('mobileInput').value='1';f.save();assert.equal(f.errors.length,1);assert.equal(JSON.stringify(f.model.grants),before);
});

test('租户编辑分别保存百分比及单笔服务费，不改变通道商授权或其他租户',()=>{
 const f=fixture(),before=JSON.stringify(f.model.grants),other=JSON.stringify(f.model.tenantBilling('HS-TEN-017'));f.el('tenantCollectionBillingValue').value='0.45';f.el('tenantPayoutBillingMode').value='perTransaction';f.el('tenantPayoutBillingValue').value='2.00';f.save();assert.equal(f.errors.length,0);
 assert.equal(f.model.tenantBilling('HS-TEN-001').collection.value,'0.45');assert.equal(f.model.tenantBilling('HS-TEN-001').payout.mode,'perTransaction');assert.equal(JSON.stringify(f.model.grants),before);assert.equal(JSON.stringify(f.model.tenantBilling('HS-TEN-017')),other);
});
test('收费值或资料无效、无编辑权限时，资料及两种服务费均不部分保存',()=>{
 const f=fixture(),original=f.profile.name;f.el('tenantCollectionBillingValue').value='0.45';f.el('tenantPayoutBillingValue').value='101';f.el('tenantNameInput').value='不可部分修改';f.save();assert.equal(f.profile.name,original);assert.equal(f.model.tenantBilling('HS-TEN-001').collection.value,'');
 f.el('tenantPayoutBillingValue').value='0.15';f.el('mobileInput').value='1';f.save();assert.equal(f.model.tenantBilling('HS-TEN-001').collection.value,'');
 f.el('mobileInput').value=f.profile.phone;f.permissions.canEdit=false;f.save();assert.equal(f.profile.name,original);assert.equal(f.model.tenantBilling('HS-TEN-001').collection.value,'');
});

test('详情设置费率只保存收费，资料和授权不变，隐藏资料不参与校验',()=>{
 const f=fixture(),profile=JSON.stringify(f.profile),grants=JSON.stringify(f.model.grants),other=JSON.stringify(f.model.tenantBilling('HS-TEN-017'));f.billingOnly();f.model.tenants.splice(f.model.tenants.findIndex(item=>item.id===f.profile.id),1);f.el('tenantNameInput').value='不能改资料';f.el('mobileInput').value='';f.el('tenantCollectionBillingValue').value='0.45';f.el('tenantPayoutBillingMode').value='perTransaction';f.el('tenantPayoutBillingValue').value='2.00';f.save();
 assert.equal(f.errors.length,0);assert.equal(JSON.stringify(f.profile),profile);assert.equal(JSON.stringify(f.model.grants),grants);assert.equal(JSON.stringify(f.model.tenantBilling('HS-TEN-017')),other);assert.equal(f.model.tenantBilling(f.profile.id).collection.value,'0.45');assert.equal(f.model.tenantBilling(f.profile.id).payout.value,'2.00');assert.equal(f.receipts[0].action,'设置租户费率');
});
test('详情设置费率拒绝无权限、范围外、关闭租户或非法值，均不部分保存',()=>{
 for(const kind of ['permission','scope','closed','invalid']){const f=fixture();f.billingOnly();f.el('tenantCollectionBillingValue').value='0.45';f.el('tenantPayoutBillingValue').value='0.2';if(kind==='permission')f.permissions.canEdit=false;if(kind==='scope')f.setScope(false);if(kind==='closed')f.profile.status='关闭';if(kind==='invalid')f.el('tenantPayoutBillingValue').value='101';const before=JSON.stringify(f.model.tenantBilling(f.profile.id));f.save();assert.equal(f.errors.length,1,kind);assert.equal(JSON.stringify(f.model.tenantBilling(f.profile.id)),before,kind);assert.equal(f.receipts.length,0,kind);}
});
