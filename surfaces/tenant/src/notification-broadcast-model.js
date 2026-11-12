// Configuration and permission-check demonstration only. This module never sends Telegram messages.
(() => {
  const model=window.HSProviderDemo;
  const businessValid=value=>['collect','payout'].includes(value);
  const defaults=()=>({enabled:false,chatId:'',version:0});
  function read(tenantId,business){
    if(!businessValid(business))throw new Error('请选择代收或代付机器人。');
    const value=model.tenantData(tenantId).broadcastConfigs?.[business];
    return value?{...value}:defaults();
  }
  function validate(value){
    if(typeof value.enabled!=='boolean')throw new Error('请选择是否开启群发消息。');
    const chatId=String(value.chatId??'').trim();
    if(value.enabled&&!chatId)throw new Error('开启群发前，请填写群发指令群 Chat ID。');
    if(chatId&&!window.HSNotificationGroups.valid(chatId))throw new Error('请填写有效的群 Chat ID，例如 -1002003004001。');
    return {enabled:value.enabled,chatId};
  }
  function save(tenantId,business,value,expectedVersion){
    if(model.tenantId!==tenantId)throw new Error('租户已切换，请重新打开机器人配置。');
    const current=read(tenantId,business),next=validate(value);
    if(current.version!==expectedVersion)throw new Error('群发设置已变化，请重新打开后再保存。');
    const data=model.tenantData(tenantId);data.broadcastConfigs||={};
    data.broadcastConfigs[business]={...next,version:current.version+1};
    model.log('保存'+(business==='collect'?'代收':'代付')+'机器人群发设置',business,tenantId);
    return {...data.broadcastConfigs[business]};
  }
  function parse(command){
    const text=String(command??'').trim();
    if(!/^(通知商户|通知通道)/.test(text))return null;
    const match=/^(通知商户|通知通道)(?:=(.+))?$/.exec(text);
    if(!match)throw new Error('指令格式错误，请检查后重新发送。');
    const names=match[2]?.split(/[,，]/).map(name=>name.trim());
    if(names?.some(name=>!name))throw new Error('请填写要通知的商户或通道名称。');
    return {type:match[1]==='通知商户'?'merchant':'channel',names:names?[...new Set(names)]:null};
  }
  async function check({tenantId,business,chatId,userId,isBot,replyMessageId,command},getLiveMember){
    let target;try{target=parse(command);}catch(error){return {handled:true,allowed:false,message:error.message};}
    if(!target)return {handled:false,allowed:false,message:'这不是群发指令，按原有指令规则处理。'};
    const deny=message=>({handled:true,allowed:false,message});
    if(model.tenantId!==tenantId||!businessValid(business))return deny('租户或机器人配置已变化，请重新操作。');
    const config=read(tenantId,business);
    if(!config.enabled)return deny('此机器人的群发消息功能未开启。');
    if(!config.chatId||chatId!==config.chatId)return deny('当前群不是已配置的群发指令群，不能群发。');
    if(isBot!==false||!userId)return deny('请由群主或管理员本人发起群发。');
    if(!replyMessageId)return deny('请引用需要发送的通知消息后，再输入群发指令。');
    let member;try{member=await getLiveMember(chatId,userId);}catch(_){return deny('管理员身份验证失败，请稍后重试。');}
    if(!member)return deny('管理员身份验证失败，请稍后重试。');
    if(!['creator','administrator'].includes(member.status))return deny('您当前不是该群的群主或管理员，不能群发。');
    const latest=read(tenantId,business);
    if(model.tenantId!==tenantId||latest.version!==config.version||!latest.enabled||latest.chatId!==chatId)return deny('群发设置已变化，本次操作未执行。');
    return {handled:true,allowed:true,target,message:'群和管理员权限验证通过，可以继续核对通知对象。'};
  }
  window.HSNotificationBroadcast={read,validate,save,parse,check};
})();
