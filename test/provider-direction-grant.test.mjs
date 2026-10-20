import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const modelSource=fs.readFileSync(new URL('../src/provider-model.js',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../public/legacy/sources/business.html',import.meta.url),'utf8');
function fixture(auth){
 const elements=new Map(),el=s=>{if(!elements.has(s))elements.set(s,{value:'',hidden:false,disabled:false,innerHTML:'',textContent:'',classList:{add(){},remove(){},contains(){return false;}},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},addEventListener(){},focus(){}});return elements.get(s);};
 const window={document:{},HSPlatformAuthRouteGuard:{getAuthorizationContext:()=>auth}};window.top=window;
 const ctx=vm.createContext({window,Date,Map,Set,JSON,Error,setTimeout(){},document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}}});vm.runInContext(modelSource,ctx);
 let script=source.slice(source.lastIndexOf('<script>')+8,source.lastIndexOf('</script>'));script=script.replace('})();','window.grantTest={loadTenant,setDirection,review,save,close,rows,pending,transition};})();');vm.runInContext(script,ctx);
 return {model:window.HSProviderDemo,api:window.grantTest,el,confirm(){el('#grantReason').value='调整租户业务授权';el('#grantMfa').value='123456';window.grantTest.save();}};
}
test('先选择租户才展示全部已接入通道商，按名称编号与已保存状态筛选',()=>{
 const f=fixture();assert.equal(f.api.rows().length,0);assert.equal(f.el('#grantWorkspace').hidden,true);
 f.api.loadTenant('HS-TEN-001');assert.equal(f.api.rows().length,f.model.providers.filter(p=>p.adapterStatus==='已接入').length);
 f.el('#keyword').value='V-001';assert.equal(f.api.rows().length,1);assert.equal(f.api.rows()[0].id,'V-001');
 f.el('#keyword').value='quickpay';assert.equal(f.api.rows()[0].id,'V-001');f.el('#keyword').value='does-not-exist';assert.equal(f.api.rows().length,0);
});
test('跨筛选保留多项草稿，统一保存只修改所选租户和所改通道商',()=>{
 const f=fixture();f.api.loadTenant('HS-TEN-001');const other=JSON.stringify(f.model.grants.filter(g=>g.tenantId!=='HS-TEN-001'||!['V-001','V-003'].includes(g.providerId)));
 f.api.setDirection('V-001','代付',false);f.el('#keyword').value='Bridge';f.api.setDirection('V-003','代收',false);assert.equal(f.api.pending().length,2);
 f.api.review();f.confirm();assert.deepEqual(Array.from(f.model.grantDirections('HS-TEN-001','V-001')),['代收']);assert.deepEqual(Array.from(f.model.grantDirections('HS-TEN-001','V-003')),['代付']);assert.equal(JSON.stringify(f.model.grants.filter(g=>g.tenantId!=='HS-TEN-001'||!['V-001','V-003'].includes(g.providerId))),other);assert.equal(f.api.pending().length,0);
});
test('不支持的业务不可操作，取消所有方向后保留记录且撤销有效授权',()=>{
 const f=fixture();f.api.loadTenant('HS-TEN-001');assert.equal(f.api.setDirection('V-004','代收',true),false);
 f.api.setDirection('V-001','代收',false);f.api.setDirection('V-001','代付',false);f.api.review();f.confirm();assert.equal(f.model.grantFor('HS-TEN-001','V-001').status,'已停用');assert.equal(f.model.grantDirections('HS-TEN-001','V-001').length,0);
});
test('统一授权可创建未授权通道商记录，筛选按已保存状态工作',()=>{
 const f=fixture();f.model.grants.splice(f.model.grants.findIndex(g=>g.tenantId==='HS-TEN-001'&&g.providerId==='V-001'),1);f.api.loadTenant('HS-TEN-001');f.el('#grantFilter').value='unauthorized';assert(f.api.rows().some(p=>p.id==='V-001'));
 f.api.setDirection('V-001','代收',true);assert(f.api.rows().some(p=>p.id==='V-001'),'草稿不使当前筛选行消失');f.api.review();f.confirm();assert.deepEqual(Array.from(f.model.grantDirections('HS-TEN-001','V-001')),['代收']);
});
test('任一授权或通道商接入范围变化时整批拒绝保存',()=>{
 for(const mutate of [f=>f.model.grantFor('HS-TEN-001','V-003').reason='外部变更',f=>f.model.providers.find(p=>p.id==='V-003').directions=['代收'],f=>f.model.providers.find(p=>p.id==='V-003').adapterStatus='未接入']){
  const f=fixture();f.api.loadTenant('HS-TEN-001');f.api.setDirection('V-001','代付',false);f.api.setDirection('V-003','代付',false);f.api.review();mutate(f);const before=JSON.stringify(f.model.grants);f.confirm();assert.equal(JSON.stringify(f.model.grants),before);assert.match(f.el('#formError').textContent,/已变化/);
 }
});
test('提交时重新检查租户、数据范围与管理权限',()=>{
 for(const kind of ['tenant','scope','permission']){const auth={actionPermissions:['platform.business_grant.manage'],dataScope:{scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-001']}};const f=fixture(auth);f.api.loadTenant('HS-TEN-001');f.api.setDirection('V-001','代付',false);f.api.review();if(kind==='tenant')f.el('#tenantFilter').value='HS-TEN-017';if(kind==='scope')auth.dataScope.tenantIds=[];if(kind==='permission')auth.actionPermissions=[];const before=JSON.stringify(f.model.grants);f.confirm();assert.equal(JSON.stringify(f.model.grants),before);assert.match(f.el('#formError').textContent,/已变化/);}
});
test('原因及MFA错误整批不保存，取消和成功提交均清空验证码',()=>{
 for(const otp of ['','12345','abcdef','1234567','000000']){const f=fixture();f.api.loadTenant('HS-TEN-001');f.api.setDirection('V-001','代付',false);f.api.review();const before=JSON.stringify(f.model.grants);f.el('#grantReason').value='授权调整';f.el('#grantMfa').value=otp;f.api.save();assert.equal(JSON.stringify(f.model.grants),before);assert.equal(f.el('#grantMfa')['aria-invalid'],'true');assert.equal(f.el('#grantMfa').value,'');}
 const f=fixture();f.api.loadTenant('HS-TEN-001');f.api.setDirection('V-001','代付',false);f.api.review();f.el('#grantMfa').value='123456';f.api.save();assert.match(f.el('#formError').textContent,/原因/);f.api.close();assert.equal(f.el('#grantMfa').value,'');assert.equal(f.api.pending().length,1);f.api.review();f.confirm();assert.equal(f.el('#grantMfa').value,'');assert.equal(JSON.stringify(f.model.grants).includes('123456'),false);
});
test('切换租户先保护未保存草稿，取消继续编辑，确认装载新租户',()=>{
 const f=fixture();f.api.loadTenant('HS-TEN-001');f.api.setDirection('V-001','代付',false);f.el('#tenantFilter').value='HS-TEN-017';f.api.transition('HS-TEN-017');assert.equal(f.el('#tenantFilter').value,'HS-TEN-001');assert.match(f.el('#modalTitle').textContent,/切换租户/);f.api.close();assert.equal(f.api.pending().length,1);f.api.loadTenant('HS-TEN-017');assert.equal(f.api.pending().length,0);assert.equal(f.el('#tenantFilter').value,'HS-TEN-017');assert.equal(f.model.grantDirections('HS-TEN-001','V-001').length,2);
});
