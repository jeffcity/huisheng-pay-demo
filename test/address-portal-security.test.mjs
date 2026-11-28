import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../src/address-portal.js',import.meta.url),'utf8');
function browser(storage, ip) {
  const window = {};
  vm.runInNewContext(source.replace("const sourceIp = '203.0.113.24'", "const sourceIp = " + JSON.stringify(ip)), {
    window, crypto:webcrypto, TextEncoder, navigator:{locks:{request:(_key,fn)=>fn()}},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}
  });
  return window.HSAddressPortal;
}
test('地址后台共用 IP 策略按租户隔离，并在登录及后续操作时生效', async()=>{
  const storage=new Map(), office=browser(storage,'203.0.113.24'), remote=browser(storage,'192.0.2.9');
  const tenant='HS-TEN-101', other='HS-TEN-102';
  const admin=await office.configure(tenant,'测试租户','usdt',true);
  const adminToken=await office.login(tenant,admin.login,admin.password);
  const oldSession=await remote.login(tenant,admin.login,admin.password);
  const account=await office.addAccount(adminToken,'review01','审核员');
  const remoteReviewer=await remote.login(tenant,account.login,account.password);
  await assert.rejects(office.saveIpPolicy(adminToken,true,['203.0.113.24/24/1']),/无效/);
  await assert.rejects(office.saveIpPolicy(adminToken,true,['192.0.2.0/24']),/当前登录来源/);
  await office.saveIpPolicy(adminToken,true,['203.0.113.0/24']);
  await assert.rejects(remote.addAccount(oldSession,'worker2','操作员'),/来源 IP/);
  assert.throws(()=>remote.view(remoteReviewer),/来源 IP/);
  await assert.rejects(remote.login(tenant,account.login,account.password),/来源 IP/);
  const reviewer=await office.login(tenant,account.login,account.password);
  await assert.rejects(office.saveIpPolicy(reviewer,false,[]),/没有此项权限/);
  assert.equal(office.view(reviewer).ipPolicy,null);
  const otherAdmin=await remote.configure(other,'另一租户','usdt',true);
  assert.ok(await remote.login(other,otherAdmin.login,otherAdmin.password));
  await office.saveIpPolicy(adminToken,false,[]);
  assert.ok(await remote.login(tenant,account.login,account.password));
});
test('自定义角色权限变更对现有账号生效，管理员角色受保护',async()=>{
  const api=browser(new Map(),'203.0.113.24');
  const tenant='HS-TEN-103', admin=await api.configure(tenant,'角色测试','usdt',true);
  const token=await api.login(tenant,admin.login,admin.password);
  await api.saveRole(token,'查看员',{},false);
  const acc=await api.addAccount(token,'observer','查看员'), viewer=await api.login(tenant,acc.login,acc.password);
  assert.equal(api.view(viewer).roles.length,0);
  await assert.rejects(api.submit(viewer,'usdt',{}),/没有此项权限/);
  await api.saveRole(token,'查看员',{submit:true},true);
  assert.equal(api.view(viewer).permissions.submit,true);
  await api.setAccountRole(token,acc.login,'审核员');
  assert.equal(api.view(viewer).permissions.review,true);
  assert.equal(api.view(viewer).permissions.submit,false);
  await assert.rejects(api.setAccountRole(token,admin.login,'审核员'),/不可分配/);
  await assert.rejects(api.saveRole(viewer,'其他',{},false),/没有此项权限/);
});

test('页面和按钮授权即时生效，账号删除后同名新账号不会恢复旧会话',async()=>{
  const api=browser(new Map(),'203.0.113.24'), tenant='HS-TEN-104';
  const admin=await api.configure(tenant,'权限测试','usdt',true);
  const token=await api.login(tenant,admin.login,admin.password);
  await api.saveRole(token,'录入员',{grants:['usdt','usdt.add']},false);
  const a=await api.addAccount(token,'operator1','录入员');
  const session=await api.login(tenant,a.login,a.password);
  assert.deepEqual(Array.from(api.view(session).menus,m=>m.id),['usdt']);
  await assert.rejects(api.saveRole(token,'录入员',{grants:['usdt.edit']},true),/页面及按钮/);
  await assert.rejects(api.submit(session,'usdt',{},'existing'),/没有此项权限/);
  await assert.rejects(api.deleteRole(token,'录入员'),/已分配/);
  await api.updateAccount(token,a.login,{role:'录入员',displayName:'夜班'});
  assert.equal(api.view(token).accounts.find(x=>x.login===a.login).displayName,'夜班');
  await api.saveMenu(token,'usdt','收款地址',3);
  assert.equal(api.view(session).menus[0].label,'收款地址');
  await api.saveRole(token,'录入员',{grants:['audit']},true);
  await assert.rejects(api.submit(session,'usdt',{}),/没有此项权限/);
  await assert.rejects(api.deleteAccount(session,a.login),/没有此项权限/);
  await assert.rejects(api.deleteAccount(token,admin.login),/受保护/);
  await api.deleteAccount(token,a.login);
  assert.throws(()=>api.view(session),/重新登录/);
  await api.addAccount(token,a.login,'审核员');
  assert.throws(()=>api.view(session),/重新登录/);
  await api.deleteRole(token,'录入员');
  await api.deleteRole(token,'操作员');
  assert.ok(!api.view(token).roles.some(r=>['录入员','操作员'].includes(r.name)));
  assert.ok(api.view(token).log.some(l=>l.ref===a.login && l.event==='删除账号'));
});
