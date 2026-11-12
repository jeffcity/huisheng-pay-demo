// Local prototype only: object notification groups, shared by backend forms and bot binding examples.
(() => {
  const model=window.HSProviderDemo;
  const copy=rows=>rows.map(row=>({...row}));
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const valid=chatId=>typeof chatId==='string' && /^-[1-9]\d{0,18}$/.test(chatId) && BigInt(chatId)>=-9223372036854775808n;
  function validate(rows) {
    const result=[],seen=new Set();
    for(const row of rows){const chatId=String(row.chatId??'').trim();if(!chatId)continue;if(!valid(chatId))throw new Error('请填写有效的群 Chat ID，例如 -1002003004001。');if(seen.has(chatId))throw new Error('这个群已经添加，请勿重复。');seen.add(chatId);result.push({...row,chatId});}
    return result;
  }
  function read(object,kind) {
    if(Array.isArray(object?.notificationGroups))return copy(object.notificationGroups);
    const legacy=kind==='merchant'?object?.editProfile?.notifyGroup:object?.tgGroup;
    return [...new Set(String(legacy||'').split(/[\s,;，；]+/).filter(Boolean))].map(chatId=>({chatId,source:'manual'}));
  }
  function members(tenantId,kind,direction) {
    const data=model.tenantData(tenantId);
    if(kind==='merchant')return (window.HSMerchantProfiles?.forTenant(tenantId)||data.merchantProfiles||[]).filter(row=>!row.deletedAt&&(!direction||row.capabilities?.includes(direction==='collect'?'法币代收':'法币代付')));
    return data.channels.filter(row=>!row.deletedAt&&(!direction||row.direction===(direction==='collect'?'代收':'代付')));
  }
  function check(tenantId,kind,object,snapshot) {
    if(model.tenantId!==tenantId||!members(tenantId,kind).includes(object)||snapshot!==undefined&&JSON.stringify(read(object,kind))!==snapshot)throw new Error('租户、对象或通知群已变化，请重新打开。');
  }
  function write(object,kind,rows) {
    object.notificationGroups=copy(rows);
    const legacy=rows.map(row=>row.chatId).join('\n');
    if(kind==='merchant'){object.editProfile||={};object.editProfile.notifyGroup=legacy;}else object.tgGroup=legacy;
  }
  function replace(tenantId,kind,object,rows,snapshot) {
    check(tenantId,kind,object,snapshot);const next=validate(rows);write(object,kind,next);return copy(next);
  }
  function bind({tenantId,business,operatorId,chatId,command}) {
    if(model.tenantId!==tenantId||!['collect','payout'].includes(business))throw new Error('租户或业务方向已变化。');
    if(!valid(chatId))throw new Error('请填写当前群的有效 Chat ID。');
    const match=/^\/(关联|解绑)(商户|通道)=(.+)$/.exec(command.trim());
    if(!match)throw new Error('本地示例只支持 /关联商户、/关联通道、/解绑商户、/解绑通道。');
    const [,action,label,rawName]=match,name=rawName.trim(),kind=label==='商户'?'merchant':'channel';
    const operator=(model.tenantData(tenantId).tgOperators||[]).find(row=>row.id===operatorId);
    const permission=(action==='关联'?'绑定':'解绑')+label;
    if(!operator?.on||!operator.businesses?.includes(business)||!operator.permissions?.[business]?.includes(permission))throw new Error('该 TG 操作员没有本业务的'+permission+'权限。');
    const matches=members(tenantId,kind,business).filter(row=>row.name===name);
    if(matches.length!==1)throw new Error(matches.length?'有重名对象，请先核对名称，未绑定。':'当前租户的本业务中找不到这个'+label+'。');
    const object=matches[0];check(tenantId,kind,object);
    if(kind==='channel'&&!model.canConfigureChannel(tenantId,object.providerId,object.direction))throw new Error('这个通道的业务授权已失效。');
    const rows=read(object,kind),exists=rows.some(row=>row.chatId===chatId);
    if(action==='关联'&&exists)return {changed:false,message:'这个群已经绑定，无需重复添加。'};
    if(action==='解绑'&&!exists)return {changed:false,message:'这个群未绑定该'+label+'，其他群保持不变。'};
    const next=action==='关联'?[...rows,{chatId,source:business,boundAt:model.now()}]:rows.filter(row=>row.chatId!==chatId);
    write(object,kind,next);model.log(action+label+'通知群',object.id,tenantId);
    return {changed:true,message:(action==='关联'?'已绑定':'已解绑')+'「'+name+'」的当前群 '+chatId+'，后台通知群列表已同步。'};
  }
  function mount(container,initial) {
    const original=copy(initial);
    function add(row={chatId:'',source:'manual'}) {
      const line=document.createElement('div');line.className='tg-group-row';
      line.innerHTML=`<input class="input control" aria-label="通知群 Chat ID" placeholder="例如 -1002003004001" value="${escape(row.chatId)}" inputmode="text" autocomplete="off"><span class="tg-group-source">${row.source==='collect'?'代收机器人':row.source==='payout'?'代付机器人':'后台添加'}</span><button type="button" class="btn" aria-label="移除通知群">移除</button>`;
      line.querySelector('button').onclick=()=>line.remove();container.querySelector('.tg-group-rows').appendChild(line);
    }
    container.classList.add('tg-group-editor');
    container.innerHTML='<div class="tg-group-rows"></div><button type="button" class="btn tg-group-add">＋ 添加群</button><small>可添加多个群；机器人关联后的 Chat ID 也会显示在这里。</small>';
    (initial.length?initial:[{chatId:'',source:'manual'}]).forEach(add);
    container.querySelector('.tg-group-add').onclick=()=>{add();container.querySelector('.tg-group-row:last-child input').focus();};
    return {read(){return validate([...container.querySelectorAll('.tg-group-row input')].map(input=>{const chatId=input.value.trim();return {...(original.find(row=>row.chatId===chatId)||{source:'manual'}),chatId};}));}};
  }
  window.HSNotificationGroups={valid,validate,read,members,replace,bind,mount};
  if(!document.getElementById('tg-group-editor-style')){
    const style=document.createElement('style');style.id='tg-group-editor-style';style.textContent='.tg-group-editor{min-width:0;display:grid;gap:8px}.tg-group-rows{display:grid;gap:8px}.tg-group-row{display:flex;align-items:center;gap:8px;min-width:0}.tg-group-row input{min-width:0;flex:1;width:0}.tg-group-source{font-size:11px;color:var(--muted,var(--text-3,#637782));white-space:nowrap}.tg-group-row .btn{flex:none;padding:6px 10px}.tg-group-add{justify-self:start}.tg-group-editor small{font-size:12px;line-height:1.6;color:var(--muted,var(--text-3,#637782))}@media(max-width:480px){.tg-group-row{flex-wrap:wrap}.tg-group-row input{flex-basis:70%}.tg-group-source{order:3}}';document.head.appendChild(style);
  }
})();
