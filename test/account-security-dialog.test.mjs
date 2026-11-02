import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/system.html',import.meta.url),'utf8');
const start=html.indexOf("document.addEventListener('submit',event=>{\n const form=event.target.closest('form[data-form=\"confirm\"]');");
assert(start>=0);
const script=html.slice(start,html.indexOf('</script>',start));
const helpers=['accountActionMatch','accountRoleNames','accountHasRole'].map(name=>html.split('\n').find(line=>line.startsWith('function '+name+'('))).join('\n');
function fixture(action='重置 2FA',{id='finance01',status='正常',superAdmin=false,otherAdmin=true}={}){
 const row=[id,'用户','财务部',[superAdmin?'租户超级管理员':'租户财务'],status,'已绑定','-','-','admin','原密码状态',4,7,'tenant.current',[]],accounts=[row];
 if(otherAdmin)accounts.push(['admin@hs-pay','管理员','管理部',['租户超级管理员'],'正常','已绑定']);
 const errors=[],audits=[],results=[],otp={value:'123456'};let callback;
 const form={data:{title:action+' '+id,reason:'测试操作原因',operatorOtp:'123456'},matches(){return true},querySelector(selector){if(selector==='[name="operatorOtp"]')return action==='重置 2FA'?otp:null;if(selector==='[data-error]')return {};return null}};
 const ctx=vm.createContext({accounts,tenantAccountActionContext:{title:form.data.title,row,form,snapshot:JSON.stringify(row)},tenantSystemModalReturnFocus:null,fd:f=>({...f.data}),showFormError(f,message){errors.push(message)},audit(...args){audits.push(args)},render(){},accountActionFocus(){return null},closeModal(){},switchView(){},toast(){},showTenantSecretResult(...args){results.push(args)},document:{addEventListener(t,fn){callback=fn}}});
 vm.runInContext(helpers+'\n'+script,ctx);
 const submit=(data={},target=form)=>{Object.assign(target.data,data);let stopped=false;callback({target:{closest(){return target}},preventDefault(){},stopImmediatePropagation(){stopped=true}});return stopped};
 return {row,accounts,form,ctx,errors,audits,results,otp,submit};
}
test('2FA原因长度或验证码无效时不写账号与审计并清除验证码',()=>{
 for(const data of [{reason:'太短'},{reason:'字'.repeat(201)},{operatorOtp:'000000'},{operatorOtp:'12345'},{operatorOtp:'abc123'}]){const f=fixture(),before=JSON.stringify(f.row);f.submit(data);assert(f.errors.length);assert.equal(JSON.stringify(f.row),before);assert.equal(f.audits.length,0);assert.equal(f.otp.value,'')}
});
test('2FA成功只重置绑定及旧会话，不改变账号角色范围且验证码不进日志',()=>{
 const f=fixture();f.submit();assert.equal(f.errors.length,0);assert.equal(f.row[4],'正常');assert.equal(f.row[5],'待重新绑定');assert.equal(f.row[10],5);assert.equal(f.row[11],7);assert.deepEqual(f.row[3],['租户财务']);assert.equal(f.row[12],'tenant.current');assert(!JSON.stringify(f.audits).includes('123456'));assert.equal(f.otp.value,'');f.submit();assert.equal(f.row[10],5);
});
test('五种动作保持正常停用状态和会话语义',()=>{
 for(const [action,state,next,session] of [['停用账号','正常','停用',5],['启用账号','停用','正常',4],['强制下线','正常','正常',5],['重置密码','正常','正常',5],['重置 2FA','正常','正常',5]]){const f=fixture(action,{status:state});f.submit();assert.equal(f.errors.length,0,action);assert.equal(f.row[4],next,action);assert.equal(f.row[10],session,action);if(action==='重置密码'){assert.equal(f.row[9],'首次改密');assert.equal(f.results.length,1)}}
});
test('篡改为旧非账号动作时仍阻止传播，不落入通用确认',()=>{
 const f=fixture(),before=JSON.stringify(f.row);assert(f.submit({title:'停用菜单 商户管理'}));assert.equal(f.otp.value,'');assert(f.errors.length);assert.equal(JSON.stringify(f.row),before);assert.equal(f.audits.length,0);
});
test('陈旧账号、复制表单或已取消上下文不能确认',()=>{
 const stale=fixture();stale.row[1]='外部修改';stale.submit();assert(stale.errors.length);assert.equal(stale.row[10],4);
 const clone=fixture(),fake={...clone.form,data:{...clone.form.data}};clone.submit({},fake);assert(clone.errors.length);assert.equal(clone.row[10],4);
 const cancelled=fixture();cancelled.ctx.tenantAccountActionContext=null;cancelled.submit();assert(cancelled.errors.length);assert.equal(cancelled.row[10],4);
});
test('当前账号与最后可用超级管理员保护在任何写入之前',()=>{
 for(const options of [{id:'admin@hs-pay',superAdmin:true,otherAdmin:false},{id:'lastAdmin',superAdmin:true,otherAdmin:false}])for(const action of ['停用账号']){const f=fixture(action,options),before=JSON.stringify(f.row);f.submit();assert(f.errors.length);assert.equal(JSON.stringify(f.row),before);assert.equal(f.audits.length,0)}
});
test('用户操作原因在审计列表中作为纯文本渲染',()=>{
 const payload='<img src=x onerror=alert(1)>',f=fixture();f.submit({reason:payload});assert.equal(f.errors.length,0);assert(f.audits[0][3].includes(payload));
 const renderLine=html.split('\n').find(line=>line.startsWith(" document.getElementById('auditRows').innerHTML="));
 const escLine=html.split('\n').find(line=>line.startsWith('function esc(')),tagLine=html.split('\n').find(line=>line.startsWith('function tagStatus('));
 const target={innerHTML:''};const c=vm.createContext({document:{getElementById(){return target}},tenantSystemPublicAudits:()=>[['A1','账户','finance01','重置2FA',f.audits[0][3],'admin','-','成功','今天']]});
 vm.runInContext(escLine+'\n'+tagLine+'\n'+renderLine,c);assert(!target.innerHTML.includes('<img'));assert(target.innerHTML.includes('&lt;img'));
});

test('旧锁定和解锁动作拒绝提交，不改变状态或会话',()=>{
 for(const action of ['锁定账号','解锁账号']){const f=fixture(action),before=JSON.stringify(f.row);assert(f.submit());assert(f.errors.length);assert.equal(JSON.stringify(f.row),before);assert.equal(f.audits.length,0)}
});
