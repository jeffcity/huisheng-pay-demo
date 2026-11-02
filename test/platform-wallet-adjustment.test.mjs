import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/legacy/sources/tenants.html',import.meta.url),'utf8');
function fixture(auth=null){
 const window={document:{}};window.top=window;
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false});return elements.get(id);};
 const errors=[],audits=[];let permission=true,scope=true;
 const tenant={id:'HS-TEN-001',name:'汇盛东南亚',status:'正常'};
 const state={currentRole:'平台超管',walletAdjustment:{tenantId:tenant.id,requestId:'adjust-platform-001',expectedRevision:4}};
 const context=vm.createContext({window,Date,Map,Set,JSON,Error,BigInt,document:{getElementById:el},tenants:[tenant],appState:state,platformTenantAuthorization:auth,
 getPermissions:()=>({canAdjustWallet:permission}),tenantInCurrentScope:t=>Boolean(t&&scope),showFormError:(id,msg)=>errors.push(msg),addTenantAudit:(...args)=>audits.push(args),showToast(){},renderDetailSections(){},activateDetailTab(){},closeWalletAdjustment(){state.walletAdjustment=null;}});
 for(const name of ['provider-model','settlement-model','tenant-fee-wallet-model'])vm.runInContext(fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),context);
 for(const [start,next] of [['walletOperator','renderTenantWallet'],['walletAdjustmentInput','previewWalletAdjustment'],['submitWalletAdjustment','sectionTitle']]) {const a=source.indexOf('    function '+start+'('),b=source.indexOf('    function '+next+'(',a);assert(a>0&&b>a);vm.runInContext(source.slice(a,b),context);}
 el('walletAdjustDirection').value='increase';el('walletAdjustAmount').value='10.00';el('walletAdjustReason').value='测试到账';
 return {window,el,errors,audits,tenant,state,permission:v=>{permission=v;},scope:v=>{scope=v;},submit:()=>vm.runInContext('submitWalletAdjustment()',context)};
}
test('平台调整提交复验权限、范围和关闭状态，拒绝时无余额及审计变化',()=>{
 for(const kind of ['permission','scope','closed']){const f=fixture();if(kind==='permission')f.permission(false);if(kind==='scope')f.scope(false);if(kind==='closed')f.tenant.status='关闭';const before=f.window.HSFeeWallets.wallet(f.tenant.id).balance;f.submit();assert.equal(f.errors.length,1,kind);assert.equal(f.audits.length,0,kind);assert.equal(f.window.HSFeeWallets.wallet(f.tenant.id).balance,before,kind);}
});
test('平台调整一次提交写一笔钱包流水和审计，重复点击不再执行',()=>{
 const f=fixture();f.el('walletAdjustOperator').value='伪造操作人';f.submit();f.submit();assert.deepEqual(f.errors,[]);assert.equal(f.audits.length,1);assert.equal(f.window.HSFeeWallets.wallet(f.tenant.id).balance,'946.94688');const e=f.window.HSFeeWallets.ledger(f.tenant.id).find(e=>e.type==='人工调增');assert.equal(e.operator,'Jeff / 平台超管');assert.equal(e.reason,'测试到账');assert(f.audits[0][3].includes(e.id));
});

test('已登录平台账号调整记录使用认证账号，不用通用角色名代替',()=>{const f=fixture({account:'finance.real.demo'});f.submit();assert.equal(f.errors.length,0);assert.equal(f.window.HSFeeWallets.ledger(f.tenant.id)[0].operator,'finance.real.demo');});
