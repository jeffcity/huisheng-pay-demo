// In-memory review state only. No Telegram requests or persistent credential storage.
(() => {
  const names=['汇盛通知 A','汇盛资金审核','汇盛风控','测试机器人'];
  const now=()=>new Date().toLocaleString('sv-SE',{timeZone:'Asia/Taipei'});
  function createState(tenantId,configs=[]) {
    const bots=tenantId==='HS-TEN-001'?names.map((name,i)=>({id:`${tenantId}-NOTIFY-${i+1}`,tenantId,name,token:`90000000${i+1}:demo_notification_token_${i+1}`,on:true,remark:['日常通知','资金审核通知','风控通知',''][i],createdAt:`2026-10-21 09:0${i}:00`,merchantIds:[]})):[];
    return {tenantId,bots,sequence:bots.length,configs:configs.map(c=>({...c,robotId:bots.find(b=>b.name===c.robot)?.id||''}))};
  }
  function guard(state,tenantId,currentTenant) {if(!tenantId||state.tenantId!==tenantId||currentTenant!==tenantId)throw new Error('当前租户已切换，请重新进入通知中心')}
  function find(state,id){return state.bots.find(b=>b.id===id&&b.tenantId===state.tenantId)}
  function save(state,tenantId,currentTenant,id,input) {
    guard(state,tenantId,currentTenant);const old=id?find(state,id):null;if(id&&!old)throw new Error('机器人记录已变化，请重新打开');
    const name=String(input.name||'').trim(),token=String(input.token||'').trim(),remark=String(input.remark||'').trim();
    if(!name||name.length>30)throw new Error('名称为1至30个字符');
    if(!/^\d+:[A-Za-z0-9_-]+$/.test(token))throw new Error('请输入正确格式的Token');
    if(remark.length>200)throw new Error('备注不能超过200个字符');
    if(typeof input.on!=='boolean')throw new Error('请选择状态');
    const row={id:old?.id||`${tenantId}-NOTIFY-${++state.sequence}`,tenantId,name,token,remark,on:input.on,createdAt:old?.createdAt||now(),merchantIds:old?.merchantIds||[]};
    if(old)Object.assign(old,row);else state.bots.unshift(row);
    state.configs.forEach(c=>{if(c.robotId===row.id)c.robot=row.name});return row;
  }
  function toggle(state,tenantId,currentTenant,id){guard(state,tenantId,currentTenant);const row=find(state,id);if(!row)throw new Error('机器人记录已变化');row.on=!row.on;return row}
  function remove(state,tenantId,currentTenant,id){guard(state,tenantId,currentTenant);const row=find(state,id);if(!row)throw new Error('机器人记录已变化');if(row.merchantIds?.length)throw new Error('已绑定商户，无法删除');state.bots.splice(state.bots.indexOf(row),1)}
  function list(state,keyword='',page=1,size=10){const matches=state.bots.filter(b=>b.tenantId===state.tenantId&&b.name.toLowerCase().includes(String(keyword).trim().toLowerCase()));const per=[10,20,50].includes(Number(size))?Number(size):10,pages=Math.max(1,Math.ceil(matches.length/per)),current=Math.max(1,Math.min(pages,Math.trunc(Number(page))||1));return {total:matches.length,page:current,pages,rows:matches.slice((current-1)*per,current*per)}}
  const masked=token=>String(token).length>10?String(token).slice(0,6)+'******'+String(token).slice(-4):'******';
  const label=(state,config)=>find(state,config.robotId)?.name||config.robot||'—';
  function test(state,tenantId,currentTenant,id,group){guard(state,tenantId,currentTenant);const row=find(state,id);if(!row)throw new Error('机器人记录已变化');if(!/^-?\d+$/.test(String(group).trim()))throw new Error('请输入正确的测试群ID');return {robotId:row.id,group:String(group).trim(),simulated:true}}
  window.HSNotificationBots=Object.freeze({createState,guard,find,save,toggle,remove,list,masked,label,test,now});
})();
