import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createOwnAccountSession} from '../src/own-account-session.js';
const initial={account:'me',baselinePassword:'DemoOld#2026',otp:'246810'};
const make=()=>createOwnAccountSession(initial,webcrypto);
const valid={oldPassword:initial.baselinePassword,newPassword:'DemoNew#2026',confirmPassword:'DemoNew#2026',otp:initial.otp};
test('修改密码只作用于当前账号，新密码生效且原密码失效',async()=>{
 const s=make();assert.deepEqual(await s.changePassword(valid),{ok:true});assert.equal(s.getAccount(),'me');assert(await s.verifyLogin('me',valid.newPassword,initial.baselinePassword));assert.equal(await s.verifyLogin('me',valid.oldPassword,initial.baselinePassword),false);assert(await s.verifyLogin('other',initial.baselinePassword,initial.baselinePassword));
});
test('四项必填、确认密码、原密码与Google验证码失败均不修改密码',async()=>{
 const cases=[...Object.keys(valid).map(field=>[{...valid,[field]:''},field]),[{...valid,newPassword:valid.oldPassword},'newPassword'],[{...valid,confirmPassword:'mismatch'},'confirmPassword'],[{...valid,oldPassword:'wrong'},'oldPassword'],[{...valid,otp:'123'},'otp'],[{...valid,otp:'000000'},'otp']];
 for(const [fields,field] of cases){const s=make(),result=await s.changePassword(fields);assert.equal(result.field,field);assert(await s.verifyLogin('me',initial.baselinePassword,initial.baselinePassword));assert.equal(await s.verifyLogin('me',valid.newPassword,initial.baselinePassword),false)}
});
test('平台和租户密码状态互不影响',async()=>{
 const tenant=make(),platform=make();await tenant.changePassword(valid);assert(await platform.verifyLogin('me',initial.baselinePassword,initial.baselinePassword));assert.equal(await platform.verifyLogin('me',valid.newPassword,initial.baselinePassword),false);
});
test('账号变化后不提交原账号的修改，不接受外传目标账号',async()=>{
 const s=make(),pending=s.changePassword({...valid,account:'victim'});s.setCurrent('another','Other#2026','135790');assert.equal((await pending).ok,undefined);assert(await s.verifyLogin('me',initial.baselinePassword,initial.baselinePassword));assert.equal(await s.verifyLogin('victim',valid.newPassword,'Victim#2026'),false);
});
test('关闭重开后的新会话不保留更改，也不向外返回密码或验证码',async()=>{
 const s=make();await s.changePassword(valid);assert(!JSON.stringify(s).includes(valid.newPassword));assert(await make().verifyLogin('me',initial.baselinePassword,initial.baselinePassword));assert.deepEqual(Object.keys(s).sort(),['changePassword','getAccount','setCurrent','verifyLogin'].sort());
});
