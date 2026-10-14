import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const modelSource=fs.readFileSync(new URL('../src/provider-model.js',import.meta.url),'utf8');
const tenantSource=fs.readFileSync(new URL('../public/legacy/sources/tenants.html',import.meta.url),'utf8');
function fixture(){
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:true});return elements.get(id);};
 const window={document:{}};window.top=window;const profile={id:'HS-TEN-001',name:'汇盛东南亚',contact:'Lin',phone:'+63 917 208 8891',expire:'2027-01-31',remark:'',domain:'tenant-001.hs-pay.com',status:'正常'};
 const permissions={canEdit:true,canBusinessAuth:true};const errors=[];
 const ctx=vm.createContext({window,Date,Map,Set,JSON,Error,document:{getElementById:el},tenants:[profile],appState:{editingTenantId:profile.id},getPermissions:()=>permissions,tenantInCurrentScope:()=>true,canCreateTenant:()=>false,showFormError:(id,text)=>errors.push(text),ensureTenantAccessState(){},addTenantAudit(){return {};},setOperationReceipt(){},closeTenantModal(){},applyFilters(){},showToast(){}});
 vm.runInContext(modelSource,ctx);const billingStart=tenantSource.indexOf('    function readTenantBillingForm()'),billingEnd=tenantSource.indexOf('    function updateTenantBillingPreview()',billingStart);vm.runInContext(tenantSource.slice(billingStart,billingEnd),ctx);const start=tenantSource.indexOf('    function saveTenantProfile()'),end=tenantSource.indexOf('    function finishTenantAction',start);assert(start>0&&end>start);vm.runInContext(tenantSource.slice(start,end),ctx);
 for(const [id,value] of Object.entries({tenantCollectionBillingMode:'percentage',tenantCollectionBillingValue:'',tenantPayoutBillingMode:'percentage',tenantPayoutBillingValue:'',tenantNameInput:profile.name,contactInput:profile.contact,mobileInput:profile.phone,expireInput:profile.expire,tenantRemarkInput:'',domainPrefixInput:'tenant-001',initialLoginIpInput:'192.0.2.1'}))el(id).value=value;
 return {el,profile,permissions,errors,model:window.HSProviderDemo,save(){vm.runInContext('saveTenantProfile()',ctx);}};
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
