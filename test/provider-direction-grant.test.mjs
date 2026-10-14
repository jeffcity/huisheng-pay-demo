import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const modelSource=fs.readFileSync(new URL('../src/provider-model.js',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../public/legacy/sources/business.html',import.meta.url),'utf8');
function fixture(auth){
 const elements=new Map(),selection=[],directions=[];const el=s=>{if(!elements.has(s))elements.set(s,{value:'',hidden:false,innerHTML:'',textContent:'',classList:{add(){},remove(){},contains(){return false;}},setAttribute(){},addEventListener(){},focus(){}});return elements.get(s);};
 const window={document:{},HSPlatformAuthRouteGuard:{getAuthorizationContext:()=>auth}};window.top=window;
 const ctx=vm.createContext({window,Date,Map,Set,JSON,Error,setTimeout(){},document:{querySelector:el,querySelectorAll:s=>s==='[name="grantProvider"]:checked'?selection:s==='[name="grantDirection"]:checked'?directions:[],addEventListener(){}}});vm.runInContext(modelSource,ctx);
 let script=source.slice(source.lastIndexOf('<script>')+8,source.lastIndexOf('</script>'));script=script.replace('})();', 'window.grantTest={open,save,choices};})();');vm.runInContext(script,ctx);
 el('#grantTenant').value='HS-TEN-001';el('#grantReason').value='调整业务授权';el('#grantStatus').value='已授权';
 return {model:window.HSProviderDemo,api:window.grantTest,el,selection,directions,choose(providerId,dirs){selection.push({value:providerId});directions.push(...dirs.map(value=>({value,dataset:{provider:providerId}})));}};
}
test('平台编辑单个通道商方向并保留其他授权，弹窗回显该授权的业务',()=>{
 const f=fixture(),g=f.model.grantFor('HS-TEN-001','V-001'),other=JSON.stringify(f.model.grantFor('HS-TEN-001','V-003'));f.api.open(g.id);f.choose('V-001',['代收']);f.api.save();assert.deepEqual(Array.from(g.directions),['代收']);assert.equal(JSON.stringify(f.model.grantFor('HS-TEN-001','V-003')),other);
 f.api.open(g.id);assert.match(f.el('#providerChoices').innerHTML,/aria-label="QuickPay 授权代收" checked/);assert.match(f.el('#providerChoices').innerHTML,/aria-label="QuickPay 授权代付"  /);
});
test('新增多个通道商授权时逐个保存所选方向，任一无效整批不保存',()=>{
 const f=fixture();for(let i=f.model.grants.length-1;i>=0;i--)if(f.model.grants[i].tenantId==='HS-TEN-046'&&['V-001','V-004'].includes(f.model.grants[i].providerId))f.model.grants.splice(i,1);f.el('#grantTenant').value='HS-TEN-046';f.choose('V-001',['代收']);f.choose('V-004',['代收']);const before=JSON.stringify(f.model.grants);f.api.save();assert.equal(JSON.stringify(f.model.grants),before);assert.equal(f.el('#formError').hidden,false);
 f.directions.at(-1).value='代付';f.api.save();assert.deepEqual(Array.from(f.model.grantFor('HS-TEN-046','V-001').directions),['代收']);assert.deepEqual(Array.from(f.model.grantFor('HS-TEN-046','V-004').directions),['代付']);
});
test('编辑不可替换租户或通道商，缺方向不得扩大授权',()=>{
 const f=fixture(),g=f.model.grantFor('HS-TEN-001','V-001');f.api.open(g.id);const before=JSON.stringify(f.model.grants);f.choose('V-003',['代付']);f.api.save();assert.equal(JSON.stringify(f.model.grants),before);
 f.selection[0].value='V-001';f.directions.length=0;f.api.save();assert.equal(JSON.stringify(f.model.grants),before);
 f.directions.push({value:'代收',dataset:{provider:'V-001'}});f.el('#grantTenant').value='HS-TEN-017';f.api.save();assert.equal(JSON.stringify(f.model.grants),before);
});
test('授权管理权限和租户范围在保存时再次校验',()=>{
 for(const auth of [{actionPermissions:[],dataScope:{}},{actionPermissions:['platform.business_grant.manage'],dataScope:{scopeCode:'platform.assigned_tenants',tenantIds:['HS-TEN-017']}}]){
  const f=fixture(auth),before=JSON.stringify(f.model.grants);f.choose('V-001',['代收']);f.api.save();assert.equal(JSON.stringify(f.model.grants),before);
 }
});
