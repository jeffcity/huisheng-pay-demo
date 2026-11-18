import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('surfaces/tenant/public/legacy/sources/notifications.html');
function fixture(){
 const fields=new Map(),byId=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',classList:{add(){}}});return fields.get(id)};
 const window={};vm.runInNewContext(read('surfaces/tenant/src/notification-bot-model.js'),{window,Date,Set});
 const model=window.HSNotificationBots,state=model.createState('HS-TEN-001'),configs=[];
 const context=vm.createContext({window,notificationModel:model,notificationState:state,configData:configs,editingConfigIndex:null,settlementMessageTemplate:'',notificationContextValid:()=>true,clearConfigErrors(){},byId,renderConfigs(){},closeConfigModal(){},toast(){}});
 const a=source.indexOf('    const merchantAlertTypes='),b=source.indexOf('    const sample =',a);vm.runInContext(source.slice(a,b),context);
 const c=source.indexOf('    function submitConfigModal()'),d=source.indexOf('    function openConfirm(',c);vm.runInContext(source.slice(c,d),context);
 byId('modalType').value='商户代收余额不足';byId('modalGroup').value='-999999';byId('modalRobot').value='HS-TEN-001-QUERY-collect';byId('modalTemplate').value='商户：${merchantName} 业务：${business} 剩余：${remainingPrepaid}';
 return {model,state,configs,byId,context,save:()=>vm.runInContext('submitConfigModal()',context)};
}
test('两模板无需固定机器人和群ID，保存忽略篡改值且保留商户发送来源',()=>{
 for(const type of ['商户代收余额不足','商户代付余额不足'])for(const id of ['', 'HS-TEN-001-QUERY-collect','HS-TEN-018-QUERY-collect','HS-TEN-001-NOTIFY-1']){
  const f=fixture();f.byId('modalType').value=type;f.byId('modalRobot').value=id;f.save();assert.equal(f.configs.length,1);assert.equal(f.configs[0].group,'');assert.equal(f.configs[0].audience,'merchant');assert.equal(f.configs[0].robotId,'');assert.equal(f.configs[0].robot,'使用商户配置');assert.equal(f.state.bots.length,4);
 }
});
test('非法变量不保存；旧类型仍拒绝跨租户机器人',()=>{
 const f=fixture();f.byId('modalTemplate').value='${notAllowed}';f.save();assert.equal(f.configs.length,0);assert.match(f.byId('modalTemplateError').textContent,/未定义变量/);
 f.byId('modalType').value='通知配置变更';f.byId('modalTemplate').value='${configType}';f.byId('modalRobot').value='HS-TEN-018-QUERY-collect';f.save();assert.equal(f.configs.length,0);assert.match(f.byId('modalRobotError').textContent,/当前租户/);
});
test('两模板各一条，编辑清除旧固定机器人且不影响另一业务；旧类型保留群和机器人',()=>{
 const f=fixture();f.save();f.save();assert.equal(f.configs.length,1);assert.match(f.byId('modalTypeError').textContent,/已配置/);
 f.byId('modalType').value='商户代付余额不足';f.save();assert.equal(f.configs.length,2);
 f.configs[1].robotId='HS-TEN-001-QUERY-payout';f.configs[1].robot='代付查单机器人';
 vm.runInContext('editingConfigIndex=1',f.context);f.byId('modalType').value='商户代收余额不足';f.byId('modalRobot').value='HS-TEN-001-QUERY-payout';f.save();assert.equal(f.configs[1].robotId,'');assert.equal(f.configs[1].robot,'使用商户配置');assert.equal(f.configs[0].type,'商户代付余额不足');
 vm.runInContext('editingConfigIndex=null',f.context);f.byId('modalType').value='通知配置变更';f.byId('modalTemplate').value='${configType}';f.byId('modalGroup').value='-100123';f.byId('modalRobot').value=f.state.bots[0].id;f.save();assert.equal(f.configs[0].group,'-100123');assert.equal(f.configs[0].robotId,f.state.bots[0].id);
});

test('代收代付预警设置独立，既有共用设置在编辑时保留到两项',()=>{
 const merchantSource=read('surfaces/tenant/public/legacy/sources/merchants.html');
 const a=merchantSource.indexOf('    function merchantBalanceAlerts('),b=merchantSource.indexOf('    function merchantEditProfile(',a);
 const normalize=vm.runInNewContext(merchantSource.slice(a,b)+';merchantBalanceAlerts');
 const plain=value=>JSON.parse(JSON.stringify(value));
 assert.deepEqual(plain(normalize()),{collect:{enabled:false,threshold:''},payout:{enabled:false,threshold:''}});
 assert.deepEqual(plain(normalize({enabled:true,threshold:'5000'})),{collect:{enabled:true,threshold:'5000'},payout:{enabled:true,threshold:'5000'}});
 const original={collect:{enabled:false,threshold:'10000'},payout:{enabled:true,threshold:'2000'}};
 const draft=normalize(original);draft.collect.threshold='15000';assert.equal(draft.payout.threshold,'2000');assert.equal(original.collect.threshold,'10000');
});
