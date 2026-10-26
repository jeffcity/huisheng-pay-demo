import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/system.html',import.meta.url),'utf8');
function fixture(){
 const security=[['办公网络','192.0.2.1','启用','2026-10-01 10:00:00'],['财务专线','192.0.2.2','停用','2026-10-02 10:00:00']];
 const accounts=[['admin@hs-pay','','',['超级管理员'],'正常']],roles=[['超级管理员','SUPER','','','','启用']],tenantRoleGrants={SUPER:{pages:['security'],actions:['sec_view_logins','sec_list_transfer',...['whitelist','blacklist'].flatMap(kind=>['add','edit','delete','toggle','unlock'].map(action=>'sec_'+kind+'_'+action))]}};
 const ctx=vm.createContext({security,accounts,roles,tenantRoleGrants,accountRoleNames:row=>row[3],URL,Set,Map,Date,JSON,Error,esc:value=>String(value),modalShell(){},toast(){},now:()=> '2026-10-26 11:00:00'});
 const ipStart=source.indexOf('function ipv4ToNumber('),ipEnd=source.indexOf('\n',ipStart);vm.runInContext(source.slice(ipStart,ipEnd),ctx);
 const start=source.indexOf('// Security whitelist management:'),end=source.indexOf("document.addEventListener('submit',event=>{",start);vm.runInContext(source.slice(start,end),ctx);
 return {run:code=>vm.runInContext(code,ctx),state:()=>JSON.stringify(vm.runInContext('security',ctx))};
}
test('白名单新增支持IPv4/IPv6并保持原默认停用，等价IPv6重复被阻止',()=>{
 const f=fixture();f.run("securityWhitelistUi.edit={name:'',snapshot:''}");f.run("saveSecurityWhitelist({ip:'2001:db8::1',remark:'测试IPv6'})");
 assert.equal(f.run('security[0][2]'),'停用');assert.equal(f.run('securityMetadata(security[0]).remark'),'测试IPv6');
 const before=f.state();f.run("securityWhitelistUi.edit={name:'',snapshot:''}");assert.throws(()=>f.run("saveSecurityWhitelist({ip:'2001:0db8:0:0:0:0:0:1',remark:''})"),/已存在/);assert.equal(f.state(),before);
 for(const ip of ['999.1.1.1','192.0.2.1/24','2001:zz::1','https://example.com'])assert.throws(()=>f.run(`saveSecurityWhitelist({ip:${JSON.stringify(ip)},remark:''})`),/有效/);
});
test('编辑回显状态和创建时间保留，非法备注或陈旧表单不部分保存',()=>{
 const f=fixture();f.run("securityWhitelistUi.edit={name:'办公网络',snapshot:JSON.stringify(security[0])}");f.run("saveSecurityWhitelist({ip:'192.0.2.3',remark:'新备注'})");
 assert.equal(f.run('security[0][2]'),'启用');assert.equal(f.run('securityMetadata(security[0]).created'),'2026-10-01 10:00:00');assert.equal(f.run('securityMetadata(security[0]).remark'),'新备注');
 assert.throws(()=>f.run("saveSecurityWhitelist({ip:'192.0.2.4',remark:''})"),/已变化/);assert.equal(f.run('security[0][1]'),'192.0.2.3');
 f.run("securityWhitelistUi.edit={name:'办公网络',snapshot:JSON.stringify(security[0])}");const before=f.state();assert.throws(()=>f.run("saveSecurityWhitelist({ip:'192.0.2.5',remark:'a'.repeat(201)})"),/200/);assert.equal(f.state(),before);
});
test('筛选组合使用IP、状态、备注及创建日期，导出与分页共用筛选结果',()=>{
 const f=fixture();f.run("securityWhitelistUi.filters={ip:'192.0.2.',enabled:'停用',remark:'财务',start:'2026-10-02',end:'2026-10-02'}");assert.equal(f.run('filteredSecurityWhitelist().length'),1);assert.equal(f.run('filteredSecurityWhitelist()[0][0]'),'财务专线');
 f.run("securityWhitelistUi.filters.start='2026-10-03'");assert.equal(f.run('filteredSecurityWhitelist().length'),0);
});
test('批量删除仅作用确认快照中的行，陈旧快照整批拒绝',()=>{
 const f=fixture();f.run("securityWhitelistUi.pending={kind:'delete',rows:security.map(row=>({name:row[0],snapshot:JSON.stringify(row)}))};security[1][2]='启用'");const before=f.state();assert.throws(()=>f.run('applySecurityWhitelistAction()'),/已变化/);assert.equal(f.state(),before);
 f.run("securityWhitelistUi.pending={kind:'delete',rows:[{name:security[0][0],snapshot:JSON.stringify(security[0])}]}");f.run('applySecurityWhitelistAction()');assert.equal(f.run('security.length'),1);assert.equal(f.run('security[0][0]'),'财务专线');
});
test('解除IP封锁不改变白名单启用状态',()=>{
 const f=fixture();f.run("securityMetadata(security[1]).locked=true;securityWhitelistUi.pending={kind:'unlock',rows:[{name:security[1][0],snapshot:JSON.stringify(security[1])}]}");f.run('applySecurityWhitelistAction()');assert.equal(f.run('securityMetadata(security[1]).locked'),false);assert.equal(f.run('security[1][2]'),'停用');
});

test('IP登录保护解除后恢复原有白名单匹配，不改变其他启停规则',()=>{
 const f=fixture();
 const start=source.indexOf('function evaluateTenantWhitelistLogin('),end=source.indexOf('function renderTenantWhitelistDecision(',start);
 f.run(source.slice(start,end));f.run('securityMetadata(security[0]).locked=true');assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.1').code"),'LOGIN_LOCKED');
 f.run("securityWhitelistUi.pending={kind:'unlock',rows:[{name:security[0][0],snapshot:JSON.stringify(security[0])}]};applySecurityWhitelistAction()");assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.1').allowed"),true);assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.2').allowed"),false);
 f.run("security.forEach(row=>row[2]='停用')");assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.99').code"),'NO_ENABLED_RULE');
});

test('黑名单优先于白名单且不依赖白名单是否启用，停用黑名单后恢复原校验',()=>{
 const f=fixture();const start=source.indexOf('function evaluateTenantWhitelistLogin('),end=source.indexOf('function renderTenantWhitelistDecision(',start);f.run(source.slice(start,end));
 f.run("securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'192.0.2.1',remark:'拒绝登录'})");assert.equal(f.run('securityBlacklist[0][2]'),'停用');assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.1').allowed"),true);
 f.run("securityBlacklist[0][2]='启用'");assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.1').code"),'BLACKLIST_MATCH');
 f.run("security.forEach(row=>row[2]='停用')");assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.1').code"),'BLACKLIST_MATCH');assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.99').code"),'NO_ENABLED_RULE');
 f.run("securityBlacklist[0][2]='停用'");assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.1').allowed"),true);
});
test('黑名单与白名单可保存同一IP，等价IPv6在黑名单内不允许重复',()=>{
 const f=fixture();f.run("securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'2001:db8::a',remark:'黑名单'})");
 assert.throws(()=>f.run("saveSecurityWhitelist({ip:'2001:0db8:0:0:0:0:0:a',remark:''})"),/已存在/);
 f.run("securityWhitelistUi.edit={kind:'white',name:'',snapshot:''};saveSecurityWhitelist({ip:'2001:db8::a',remark:'白名单'})");assert.equal(f.run('securityBlacklist.length'),1);assert.equal(f.run('security.length'),3);
});
test('黑名单启停和删除仅修改目标名单，不改变白名单或现有会话',()=>{
 const f=fixture();f.run("const tenantExistingSession={sourceIp:'192.0.2.1',active:true};securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'192.0.2.1',remark:''})");const before=f.state();
 f.run("securityWhitelistUi.pending={kind:'toggle',listKind:'black',rows:securityBlacklist.map(row=>({name:row[0],snapshot:JSON.stringify(row)}))};applySecurityWhitelistAction()");assert.equal(f.run('securityBlacklist[0][2]'),'启用');assert.equal(f.state(),before);assert.equal(f.run('tenantExistingSession.active'),true);
 f.run("securityWhitelistUi.pending={kind:'delete',listKind:'black',rows:securityBlacklist.map(row=>({name:row[0],snapshot:JSON.stringify(row)}))};applySecurityWhitelistAction()");assert.equal(f.run('securityBlacklist.length'),0);assert.equal(f.state(),before);assert.equal(f.run('tenantExistingSession.active'),true);
});

test('白名单转入黑名单会移除来源并启用新黑名单，继承备注且不影响其他记录',()=>{
 for(const enabled of [true,false]){
  const f=fixture();f.run("security[0][2]="+(enabled?"'启用'":"'停用'"));const other=f.run('JSON.stringify(security[1])');f.run("openSecurityWhitelistAction('transfer',['办公网络']);applySecurityWhitelistAction()");
  assert.equal(f.run('security.length'),1);assert.equal(f.run('JSON.stringify(security[0])'),other);assert.equal(f.run('securityBlacklist.length'),1);assert.equal(f.run('securityBlacklist[0][1]'),'192.0.2.1');assert.equal(f.run('securityBlacklist[0][2]'),'启用');assert.equal(f.run('securityMetadata(securityBlacklist[0]).remark'),'办公网络');
 }
});
test('目标黑名单已存在时复用ID和备注，不新增重复记录',()=>{
 const f=fixture();f.run("securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'192.0.2.1',remark:'已有黑名单备注'})");const id=f.run('securityMetadata(securityBlacklist[0]).id'),created=f.run('securityMetadata(securityBlacklist[0]).created');
 f.run("openSecurityWhitelistAction('transfer',['办公网络']);applySecurityWhitelistAction()");assert.equal(f.run('securityBlacklist.length'),1);assert.equal(f.run('securityMetadata(securityBlacklist[0]).id'),id);assert.equal(f.run('securityMetadata(securityBlacklist[0]).created'),created);assert.equal(f.run('securityMetadata(securityBlacklist[0]).remark'),'已有黑名单备注');assert.equal(f.run('securityBlacklist[0][2]'),'启用');
});
test('转入确认取消不修改名单，来源或目标变化时不部分转入',()=>{
 const unchanged=f=>f.run('JSON.stringify({white:security,black:securityBlacklist,meta:[...securityWhitelistUi.meta]})');
 const cancel=fixture(),before=unchanged(cancel);cancel.run("openSecurityWhitelistAction('transfer',['办公网络'])");assert.equal(unchanged(cancel),before);
 for(const conflict of ['source','remark','target','newTarget']){
  const f=fixture();if(conflict==='target')f.run("securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'192.0.2.1',remark:''})");f.run("openSecurityWhitelistAction('transfer',['办公网络'])");
  if(conflict==='source')f.run("security[0][1]='192.0.2.9'");if(conflict==='remark')f.run("securityMetadata(security[0]).remark='变化后的备注'");if(conflict==='target')f.run("securityBlacklist[0][2]='启用'");if(conflict==='newTarget')f.run("securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'192.0.2.1',remark:''})");
  const state=unchanged(f);assert.throws(()=>f.run('applySecurityWhitelistAction()'),/已变化/);assert.equal(unchanged(f),state,conflict);
 }
});
test('转入后命中黑名单拒绝新登录，现有会话保持不变',()=>{
 const f=fixture();const start=source.indexOf('function evaluateTenantWhitelistLogin('),end=source.indexOf('function renderTenantWhitelistDecision(',start);f.run(source.slice(start,end));f.run("const tenantExistingSession={sourceIp:'192.0.2.1',active:true};openSecurityWhitelistAction('transfer',['办公网络']);applySecurityWhitelistAction()");assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.1').code"),'BLACKLIST_MATCH');assert.equal(f.run('tenantExistingSession.active'),true);
});

test('黑名单转入白名单会移除黑名单并启用新白名单，恢复白名单准入',()=>{
 const f=fixture();f.run("securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'192.0.2.3',remark:'转回备注'});securityBlacklist[0][2]='启用';securityWhitelistUi.kind='black'");
 const start=source.indexOf('function evaluateTenantWhitelistLogin('),end=source.indexOf('function renderTenantWhitelistDecision(',start);f.run(source.slice(start,end));assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.3').code"),'BLACKLIST_MATCH');
 f.run("openSecurityWhitelistAction('transfer',[securityBlacklist[0][0]]);applySecurityWhitelistAction()");assert.equal(f.run('securityBlacklist.length'),0);assert.equal(f.run('security.length'),3);assert.equal(f.run("security.find(row=>row[1]==='192.0.2.3')[2]"),'启用');assert.equal(f.run("securityMetadata(security.find(row=>row[1]==='192.0.2.3')).remark"),'转回备注');assert.equal(f.run("evaluateTenantWhitelistLogin('192.0.2.3').code"),'EXACT_ENABLED_MATCH');
});
test('转入已有白名单保留目标ID/备注/创建时间和登录保护，不创建重复记录',()=>{
 const f=fixture();f.run("securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'192.0.2.1',remark:'黑名单备注'});securityMetadata(security[0]).locked=true;securityWhitelistUi.kind='black'");const id=f.run('securityMetadata(security[0]).id'),created=f.run('securityMetadata(security[0]).created');
 f.run("openSecurityWhitelistAction('transfer',[securityBlacklist[0][0]]);applySecurityWhitelistAction()");assert.equal(f.run('security.length'),2);assert.equal(f.run('securityBlacklist.length'),0);assert.equal(f.run('securityMetadata(security[0]).id'),id);assert.equal(f.run('securityMetadata(security[0]).created'),created);assert.equal(f.run('securityMetadata(security[0]).remark'),'办公网络');assert.equal(f.run('securityMetadata(security[0]).locked'),true);
});
test('反向转入取消或目标白名单变化时保留两份名单，不改变已有会话',()=>{
 const f=fixture();f.run("const tenantExistingSession={active:true};securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};saveSecurityWhitelist({ip:'192.0.2.1',remark:''});securityWhitelistUi.kind='black'");const capture=()=>f.run('JSON.stringify({white:security,black:securityBlacklist})');const before=capture();f.run("openSecurityWhitelistAction('transfer',[securityBlacklist[0][0]])");assert.equal(capture(),before);
 f.run("security[0][2]='停用'");const changed=capture();assert.throws(()=>f.run('applySecurityWhitelistAction()'),/已变化/);assert.equal(capture(),changed);assert.equal(f.run('tenantExistingSession.active'),true);
});

test('名单提交复验操作权限，失效时两份名单不部分修改',()=>{
 for(const action of ['transfer','delete','toggle']){
  const f=fixture();f.run("openSecurityWhitelistAction('"+action+"',['办公网络']);tenantRoleGrants.SUPER.actions=[]");const before=f.run('JSON.stringify({white:security,black:securityBlacklist})');
  assert.throws(()=>f.run('applySecurityWhitelistAction()'),/权限/);assert.equal(f.run('JSON.stringify({white:security,black:securityBlacklist})'),before);
 }
 const f=fixture();f.run("securityWhitelistUi.edit={kind:'black',name:'',snapshot:''};accounts[0][4]='停用'");assert.throws(()=>f.run("saveSecurityWhitelist({ip:'192.0.2.3',remark:''})"),/权限/);assert.equal(f.run('securityBlacklist.length'),0);
});
