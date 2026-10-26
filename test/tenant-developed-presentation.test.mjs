import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/legacy/sources/tenants.html', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../src/provider-model.js', import.meta.url), 'utf8');
function fixture() {
  const elements = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, {value: '', classList: {contains: () => false}}); return elements.get(id); };
  const window = {document: {}}; window.top = window;
  const profiles = []; const errors = []; const receipts = [];
  const state = {editingTenantId: '', editingBillingOnly: false, tenantSequence: 62};
  const context = vm.createContext({window, document: {getElementById: el}, Date, Map, Set, JSON, Error, tenants: profiles, appState: state,
    getPermissions: () => ({canEdit: true}), tenantInCurrentScope: () => true, canCreateTenant: () => true,
    showFormError: (id, text) => errors.push(text), ensureTenantAccessState() {}, platformNow: () => '2026-10-24 14:00:00',
    addTenantAudit: (tenant, action, result, reason) => ({action, reason}), setOperationReceipt: value => receipts.push(value),
    closeTenantModal() {}, applyFilters() {}, showToast() {}, openTenantCreatedResult() {}
  });
  vm.runInContext(provider, context);
  for (const [name, next] of [['isValidTenantDomain', 'currentTenantForAction'], ['allTenantDomains', 'domainActionButtons'], ['validCompleteIpv4', 'validApiIpRule'], ['validApiIpRule', 'openIpAction'], ['readTenantBillingForm', 'updateTenantBillingPreview'], ['saveTenantProfile', 'finishTenantAction']]) {
    const start = source.indexOf('    function ' + name + '('); const end = source.indexOf('    function ' + next + '(', start);
    assert(start > 0 && end > start, name); vm.runInContext(source.slice(start, end), context);
  }
  for (const [id, value] of Object.entries({tenantNameInput: '新租户测试', contactInput: '测试联系人', mobileInput: '+86 13800000000', expireInput: '2027-12-31', domainInput: 'https://tenant-new.example.com/', merchantDomainInput: '', initialLoginIpInput: '', tenantRemarkInput: '', tenantCollectionBillingMode: 'percentage', tenantCollectionBillingValue: '0.45', tenantPayoutBillingMode: 'perTransaction', tenantPayoutBillingValue: '2'})) el(id).value = value;
  return {el, profiles, errors, receipts, model: window.HSProviderDemo, save: () => vm.runInContext('saveTenantProfile()', context)};
}
test('开发展示表单允许不填初始IP，生成商户域名，仍仅保存月结费率', () => {
  const f = fixture(); const grants = JSON.stringify(f.model.grants); f.save();
  assert.deepEqual(f.errors, []); assert.equal(f.profiles.length, 1);
  const t = f.profiles[0]; assert.equal(t.domain, 'tenant-new.example.com'); assert.equal(t.merchantDomains[0].value, 'merchant.tenant-new.example.com');
  assert.equal(t.domains[0].status, '未启用'); assert.equal(t.loginIpRules.length, 0); assert.match(f.receipts[0].detail, /配置登录 IP/);
  assert.equal(f.model.tenantBilling(t.id).collection.value, '0.45'); assert.equal(f.model.tenantBilling(t.id).payout.value, '2'); assert.equal(JSON.stringify(f.model.grants), grants);
});
test('初始IP接受IPv4/CIDR且立即启用，格式错误或重复域名时不部分创建', () => {
  for (const ip of ['192.0.2.1', '192.0.2.0/24']) { const f = fixture(); f.el('initialLoginIpInput').value = ip; f.save(); assert.equal(f.errors.length, 0); assert.equal(f.profiles[0].loginIpRules[0].status, '启用'); }
  for (const [id, value] of [['initialLoginIpInput', '999.1.1.1'], ['initialLoginIpInput', '192.0.2.0/33'], ['domainInput', 'tenant.example.com/path'], ['merchantDomainInput', 'tenant-new.example.com']]) {
    const f = fixture(); f.el(id).value = value; const before = JSON.stringify(f.model.tenants); f.save(); assert.equal(f.errors.length, 1, value); assert.equal(f.profiles.length, 0, value); assert.equal(JSON.stringify(f.model.tenants), before, value);
  }
});

function unbanFixture() {
  const tenant = {id:'HS-TEN-001',status:'正常',admin:'demo_admin',adminLocked:true,loginFailedAttempts:6,loginBanUntil:'2099-01-01T00:00:00Z',twoFaStatus:'已绑定',loginIpRules:[{value:'192.0.2.1',status:'启用'}]};
  const elements = new Map([['confirmReason',{value:'核实管理员本人请求解禁'}],['confirmOperator2fa',{value:'123456'}]]);
  const receipts=[]; const errors=[]; const notices=[]; let canSecurity=true; let inScope=true;
  const context=vm.createContext({tenant,appState:{currentConfirm:'解禁'},Date,
    document:{getElementById:id=>elements.get(id)},currentTenantForAction:()=>tenant,
    getPermissions:()=>({canSecurity}),tenantInCurrentScope:()=>inScope,
    finishTenantAction:(record,receipt)=>receipts.push(receipt),showFormError:(id,text)=>errors.push(text),closeConfirm(){},showToast:(title,text)=>notices.push({title,text})});
  for(const [name,next] of [['isAdminLoginBanned','renderAuthorizedChannelRows'],['applyTenantConfirm','bindEvents']]) {
    const start=source.indexOf('    function '+name+'(');const end=source.indexOf('    function '+next+'(',start);
    assert(start>0&&end>start);vm.runInContext(source.slice(start,end),context);
  }
  return {tenant,receipts,errors,notices,el:id=>elements.get(id),permission:value=>{canSecurity=value;},scope:value=>{inScope=value;},apply:()=>vm.runInContext('applyTenantConfirm()',context)};
}
test('管理员解禁清空临时封禁及失败计数，保留租户停用、2FA和IP配置，审计不含验证码',()=>{
  const f=unbanFixture();f.tenant.status='停用';const ip=JSON.stringify(f.tenant.loginIpRules);f.apply();
  assert.equal(f.errors.length,0);assert.equal(f.tenant.adminLocked,false);assert.equal(f.tenant.loginBanUntil,'');assert.equal(f.tenant.loginFailedAttempts,0);
  assert.equal(f.tenant.status,'停用');assert.equal(f.tenant.twoFaStatus,'已绑定');assert.equal(JSON.stringify(f.tenant.loginIpRules),ip);
  assert.equal(f.receipts[0].action,'解禁');assert.doesNotMatch(JSON.stringify(f.receipts),/123456/);
});
test('解禁原因、验证码格式、权限或租户范围无效时保留原状态',()=>{
  for(const kind of ['reason','otp','permission','scope','closed']) {
    const f=unbanFixture();if(kind==='reason')f.el('confirmReason').value='';if(kind==='otp')f.el('confirmOperator2fa').value='12';if(kind==='permission')f.permission(false);if(kind==='scope')f.scope(false);if(kind==='closed')f.tenant.status='关闭';
    const before=JSON.stringify(f.tenant);f.apply();assert.equal(JSON.stringify(f.tenant),before,kind);assert.equal(f.receipts.length,0,kind);assert.equal(f.errors.length,1,kind);
  }
});
test('正常或已到期账号提示无需解禁，不写成功审计',()=>{
  for(const expired of [false,true]) {const f=unbanFixture();if(expired)f.tenant.loginBanUntil='2000-01-01T00:00:00Z';else {f.tenant.adminLocked=false;f.tenant.loginBanUntil='';}const before=JSON.stringify(f.tenant);f.apply();assert.equal(JSON.stringify(f.tenant),before);assert.equal(f.receipts.length,0);assert.equal(f.notices[0].title,'无需解禁');}
});
test('业务页仅保留已授权通道商列表，安全入口使用解禁名称',()=>{
  const start=source.indexOf('    function renderTenantBusiness(');const end=source.indexOf('    function isAdminLoginBanned',start);const business=source.slice(start,end);
  assert.match(business,/已授权通道商列表/);assert.doesNotMatch(business,/业务开通|去业务开通|授权通道商<\/th>/);
  assert.match(source,/data-confirm="解禁"/);assert.doesNotMatch(source,/data-confirm="解锁登录"/);
});
