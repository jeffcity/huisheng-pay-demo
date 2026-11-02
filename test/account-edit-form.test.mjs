import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../surfaces/tenant/public/legacy/sources/system.html',import.meta.url),'utf8');
const start=html.indexOf("document.addEventListener('submit',event=>{\n const form=event.target.closest('form[data-form=\"account\"]');");
assert(start>=0);
const handler=html.slice(start,html.indexOf('\nlet brandDraft=null;',start));
const helpers=['accountRoleNames','accountHasRole','setAccountRoles','sameRoleSet','tenantRoleMergedScope','tenantEffectiveScope'].map(name=>html.split('\n').find(line=>line.startsWith('function '+name+'('))).join('\n');
function fixture({login='finance01',status='正常',role='租户财务',otherAdmin=true}={}){
 const user=[login,'林婉','财务部',[role],status,'已绑定','1.2.3.4','昨日','admin','保持',5,7,'tenant.allowed_merchants',['M-A'],'原备注'];
 const users=[user];if(otherAdmin)users.push(['admin@hs-pay','管理员','管理部',['租户超级管理员'],'正常','已绑定','-','-','admin','-',1,1,'tenant.current',[]]);
 const roleRows=[['租户超级管理员','TENANT_SUPER_ADMIN','','','','启用','','tenant.current',[]],['租户财务','TENANT_FINANCE','','','','启用','','tenant.allowed_merchants',['M-A','M-B']],['租户运营','TENANT_OPS','','','','启用','','tenant.allowed_merchants',['M-B']],['停用角色','ROLE-OFF','','','','停用','','tenant.current',[]]];
 const errors=[],audits=[];let callback;
 const ctx=vm.createContext({accounts:users,roles:roleRows,tenantAccountEditContext:null,fd:form=>({...form.data}),showFormError(form,message){errors.push(message)},syncTenantRoleMemberCounts(){},audit(...args){audits.push(args)},render(){},closeModal(){},switchView(){},toast(){},document:{addEventListener(type,fn){callback=fn},getElementById(){return {focus(){}}}}});
 vm.runInContext(helpers+'\n'+handler,ctx);
 function save(data={},chosen=[role],editing=true){
  ctx.tenantAccountEditContext={row:user,snapshot:JSON.stringify(user)};
  const password={value:'Demo#Only'};
  const form={data:{login:user[0],name:'更新姓名',status:'启用',remark:'新备注',...data},querySelector(selector){return selector.includes('login')?{readOnly:editing}:password},querySelectorAll(){return chosen.map(value=>({value}))}};
  callback({target:{closest(){return form}},preventDefault(){},stopImmediatePropagation(){}});
  return {password,form};
 }
 return {ctx,user,users,errors,audits,save,submitStale(){ctx.tenantAccountEditContext={row:user,snapshot:JSON.stringify(user)};user[1]='并发更新';const form={data:{login:user[0],name:'不应写入',status:'禁用'},querySelector(){return {readOnly:true}}};callback({target:{closest(){return form}},preventDefault(){},stopImmediatePropagation(){}})}};
}
test('账户编辑只保存姓名角色状态备注，隐藏资料与范围不被覆盖',()=>{
 const f=fixture();f.save();assert.equal(f.errors.length,0);assert.equal(f.user[1],'更新姓名');assert.equal(f.user[2],'财务部');assert.equal(f.user[12],'tenant.allowed_merchants');assert.deepEqual(f.user[13],['M-A']);assert.equal(f.user[14],'新备注');assert.equal(f.user[5],'已绑定');assert.equal(f.user[9],'保持');assert.equal(f.user[10],5);assert.equal(f.user[11],7);f.save({remark:''});assert.equal(f.user[14],'');
});
test('禁用仅使旧会话失效一次，重新启用不恢复会话',()=>{
 const f=fixture();f.save({status:'禁用'});assert.equal(f.user[4],'停用');assert.equal(f.user[10],6);f.save({status:'禁用'});assert.equal(f.user[10],6);f.save({status:'启用'});assert.equal(f.user[4],'正常');assert.equal(f.user[10],6);
});
test('停用账号使用启用选项恢复正常，旧会话保持失效',()=>{
 const f=fixture({status:'停用'});f.save({status:'启用'});assert.equal(f.user[4],'正常');assert.equal(f.user[10],5);f.save({status:'禁用'});assert.equal(f.user[4],'停用');assert.equal(f.user[10],6);
});

test('空角色、未授权角色或无范围交集时不部分写入',()=>{
 for(const chosen of [[],['停用角色'],['不存在'],['租户运营']]){const f=fixture(),before=JSON.stringify(f.user);const attempt=f.save({status:'禁用'},chosen);assert.equal(attempt.password.value,'Demo#Only');assert(f.errors.length);assert.equal(JSON.stringify(f.user),before);assert.equal(f.audits.length,0)}
});
test('当前保护账号及最后一个可用超级管理员不得禁用或移除超级角色',()=>{
 const protectedUser=fixture({login:'admin@hs-pay',role:'租户超级管理员',otherAdmin:false}),before=JSON.stringify(protectedUser.user);protectedUser.save({status:'禁用'});assert(protectedUser.errors.length);assert.equal(JSON.stringify(protectedUser.user),before);
 for(const chosen of [['租户超级管理员'],['租户财务']]){const f=fixture({login:'lastAdmin',role:'租户超级管理员',otherAdmin:false}),original=JSON.stringify(f.user);f.save({status:'禁用'},chosen);assert(f.errors.length);assert.equal(JSON.stringify(f.user),original)}
});
test('原停用角色可保留，新增时不可绑定，旧窗口不能覆盖新数据',()=>{
 const f=fixture({role:'停用角色'});f.save();assert.equal(f.errors.length,0);assert.deepEqual(Array.from(f.user[3]),['停用角色']);
 const stale=fixture();stale.submitStale();assert(stale.errors.length);assert.equal(stale.user[1],'并发更新');assert.equal(stale.user[4],'正常');assert.equal(stale.audits.length,0);
});
test('新增四项不要求备注，重复账号不覆盖且不保存明文密码',()=>{
 const f=fixture(),original=JSON.stringify(f.user);f.save({password:'Demo#Only'},['租户财务'],false);assert(f.errors.length);assert.equal(JSON.stringify(f.user),original);
 const newUser=fixture();const submitted=newUser.save({login:'new-demo',password:'Demo#Only',remark:undefined},['租户财务'],false);assert.equal(submitted.password.value,'');assert.equal(newUser.errors.length,0);assert.equal(newUser.users[0][0],'new-demo');assert.equal(newUser.users[0][14],'');assert(!JSON.stringify(newUser.users).includes('Demo#Only'));assert(!JSON.stringify(newUser.audits).includes('Demo#Only'));
});

test('新增缺少角色时保留填写密码，不创建账号',()=>{
 const f=fixture(),count=f.users.length;const attempt=f.save({login:'new-demo',password:'Demo#Only'},[],false);assert(f.errors.length);assert.equal(attempt.password.value,'Demo#Only');assert.equal(f.users.length,count);assert.equal(f.audits.length,0);
});
