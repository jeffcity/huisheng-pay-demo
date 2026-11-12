import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/merchants.html',import.meta.url),'utf8');
const names=['merchantEditProfile','merchantEditIpValid','merchantMoreDecimal','expandIpv6','merchantEditIpIdentity','openMerchantEdit'];
const code=names.map(name=>{const a=source.indexOf(`    function ${name}(`),b=source.indexOf('\n    function ',a+1);return source.slice(a,b);}).join('\n');
function fixture(){
 const els=new Map();const el=id=>{if(!els.has(id))els.set(id,{value:'',checked:false,disabled:false,hidden:false,textContent:'',innerHTML:'',focus(){},addEventListener(){}});return els.get(id);};
 const item={id:'MCH-DEMO',name:'演示商户',status:'正常',email:'demo@example.test',capabilities:['法币代收','法币代付'],loginWhitelist:'192.0.2.10',whitelist:'198.51.100.8',wallets:[['CNY','代付钱包','100','0','100']],logs:[],collectConfig:{status:'开启'},payoutConfig:{status:'暂停'},type:'主商户',parentMerchantId:'OLD'};
 const original=JSON.stringify(item),errors=[];let valid=true,saved=0;
 const api=vm.createContext({window:{HSProviderDemo:{tenantId:'T'},HSNotificationGroups:{read:row=>row.notificationGroups||[],mount:()=>({read:()=>[]}),replace:(tid,kind,row,groups)=>{row.notificationGroups=groups;}}},currentTenantOperator:{google2fa:'123456'},merchantProfileTenantId:'T',merchantProfileTenantData:{},merchants:[item],merchantCapabilityOptions:['法币代收','法币代付'],JSON,BigInt,
 document:{getElementById:el,querySelector(selector){if(selector.includes('moreEditStatus'))return {value:'正常'};},querySelectorAll(selector){if(selector.includes('reminder-type'))return [];return [];}},
 escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 merchantMoreAllowed:(row,snapshot)=>valid&&row===item&&(!snapshot||JSON.stringify(row)===snapshot),merchantEditBots:()=>[],merchantWhitelist:row=>row.whitelist,
 merchantMoreDialog(row,title,html,footer){el('html').innerHTML=html;el('footer').innerHTML=footer;el('moreEditTierEditor').hidden=true;},bindMerchantIpEditors(){},
 renderMerchantIpEditor:()=>'',whitelistEntries:value=>value.split(/[,\n]/).filter(Boolean),merchantIpInputValue:id=>el(id).value,
 clearInlineError(){errors.length=0;},showInlineError(message){errors.push(message);return false;},
 verifyMerchantMfa(id){const ok=el(id).value==='123456';el(id).value='';if(!ok)errors.push('2FA');return ok;},finishMerchantMore(){saved++;}
 });
 vm.runInContext(code,api);api.openMerchantEdit(item);
 el('moreEditName').value=item.name;el('moreEditCap0').checked=true;el('moreEditCap1').checked=true;
 el('moreEditEmail').value=item.email;el('moreEditLoginIp').value=item.loginWhitelist;el('moreEditApiIp').value=item.whitelist;
 el('moreEditDeposit').value='0';
 return {api,item,original,el,errors,revoke(){valid=false;},get saved(){return saved;},submit(){el('merchantEditForm').onsubmit({preventDefault(){}});}};
}
test('独立修改表单含线上五区并移除USDT，与原详情和新增入口分开',()=>{const f=fixture(),html=f.el('html').innerHTML;for(const title of ['基础资料','业务能力','接入信息','运营配置','Telegram 通知配置'])assert(html.includes(title));assert.match(source,/if\(action === "edit"\)return openMerchantEdit\(item\)/);assert.equal(JSON.stringify(f.item),f.original,'打开表单不改模型');assert.doesNotMatch(html,/USDT|TRC20|ERC20|moreEditAddTier|moreEditReminder/);assert.equal((html.match(/role="tab"/g)||[]).length,5);assert.equal((html.match(/role="tabpanel"/g)||[]).length,5);});
test('修改草稿深拷贝，IP支持IPv4、IPv6和CIDR，包括线上私网配置',()=>{const f=fixture();f.item.editProfile={tiers:[{people:['demo_user']}],reminder:{on:false}};const draft=f.api.merchantEditProfile(f.item);draft.tiers[0].people.push('another');assert.equal(f.item.editProfile.tiers[0].people.length,1);for(const ip of ['192.168.1.1','198.51.100.0/24','2001:db8::1','2001:db8::/64'])assert(f.api.merchantEditIpValid(ip),ip);for(const ip of ['999.1.1.1','1.1.1.1/33','2001::/129','::gg','1.1.1.1/2/3'])assert.equal(f.api.merchantEditIpValid(ip),false,ip);});
test('错误IP、重复IP、错误2FA、过期上下文都不得部分保存',()=>{for(const scenario of ['ip','separators','apiSeparators','duplicate','mfa','stale','capability']){const f=fixture();f.el('moreEditName').value='修改后';f.el('moreEditMfa').value='123456';if(scenario==='ip')f.el('moreEditApiIp').value='999.1.1.1';if(scenario==='separators')f.el('moreEditLoginIp').value=',,,';if(scenario==='apiSeparators')f.el('moreEditApiIp').value=',,,';if(scenario==='duplicate')f.el('moreEditLoginIp').value='192.0.2.1\n192.0.2.1/32';if(scenario==='mfa')f.el('moreEditMfa').value='000000';if(scenario==='stale')f.revoke();if(scenario==='capability'){f.el('moreEditCap0').checked=false;f.el('moreEditCap1').checked=false;}f.submit();assert(f.errors.length,scenario);assert.equal(JSON.stringify(f.item),f.original,scenario);assert.equal(f.saved,0);}});
test('保存其他资料不改存量USDT配置、钱包或历史关系',()=>{const f=fixture();f.item.editProfile={usdtAddress:'legacy-address',protocol:'TRC20',tiers:[{start:'0',group:'-100000001',people:['legacy_user'],required:1}],reminder:{on:true,payout:'100'}};const usdt=JSON.stringify(f.item.editProfile);f.api.openMerchantEdit(f.item);f.el('moreEditMfa').value='123456';f.el('moreEditName').value='已修改';const wallet=JSON.stringify(f.item.wallets);f.submit();assert.equal(f.saved,1);assert.equal(f.item.name,'已修改');for(const key of ['usdtAddress','protocol','tiers','reminder'])assert.equal(JSON.stringify(f.item.editProfile[key]),JSON.stringify(JSON.parse(usdt)[key]));assert.equal(f.item.type,'主商户');assert.equal(f.item.parentMerchantId,'OLD');assert.equal(JSON.stringify(f.item.wallets),wallet);assert.equal(f.el('moreEditMfa').value,'');assert(!JSON.stringify(f.item).includes('123456'));});
test('能力增减同步方向状态，未变化的暂停状态不覆盖',()=>{const f=fixture();f.el('moreEditMfa').value='123456';f.el('moreEditCap0').checked=false;f.submit();assert.equal(f.item.collectConfig.status,'未开通');assert.equal(f.item.payoutConfig.status,'暂停');f.api.openMerchantEdit(f.item);f.el('moreEditCap0').checked=true;f.el('moreEditMfa').value='123456';f.submit();assert.equal(f.item.collectConfig.status,'开启');});

test('验证码固定在底部且关联同一表单，保存文案简化',()=>{const f=fixture();assert.doesNotMatch(f.el('html').innerHTML,/id="moreEditMfa"/);assert.match(f.el('footer').innerHTML,/id="moreEditMfa" form="merchantEditForm"/);assert.match(f.el('footer').innerHTML,/id="moreEditSave">保存<\/button>/);});
