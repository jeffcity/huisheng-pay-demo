(() => {
  const api=window.top.HSAddressPortal;
  const dedicatedTenant=new URL(window.top.location.href).searchParams.get('addressTenant');
  let tenant=dedicatedTenant;
  const root=document.querySelector('#app'), dialog=document.querySelector('#dialog');
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const option=(v,label=v)=>'<option value="'+esc(v)+'">'+esc(label)+'</option>';
  const select=(name,values)=>'<select name="'+name+'">'+values.map(v=>option(v)).join('')+'</select>';
  const field=(label,control)=>'<label>'+label+control+'</label>';
  const input=(name,value='',extra='')=>'<input name="'+name+'" value="'+esc(value)+'" required '+extra+'>';
  const button=(action,label,id='')=>'<button type="button" data-action="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';
  const brand='<div class="brand"><span class="mark">HS</span><b>地址管理后台</b></div>';
  const table=(heads,rows,empty)=>'<div class="table"><table><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(c=>'<tr>'+c.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join(''):'<tr><td class="empty" colspan="'+heads.length+'">'+empty+'</td></tr>')+'</tbody></table></div>';
  const allowed=key=>v.permissions.grants.includes(key);
  const owners=()=>v.businesses.filter(biz=>allowed(biz));
  const ownerOptions=list=>list.map(biz=>option(biz,api.titles[biz])).join('');
  const navigation=()=>[v.walletMenu,...v.menus.filter(m=>!Object.hasOwn(api.titles,m.id))].sort((a,b)=>a.order-b.order);
  const menuLabel=id=>esc(navigation().find(m=>m.id===id)?.label || '');
  let token=null, page='', v, query='',network='',owner='';
  let systemMenuOpen=false;
  function loginScreen(message=''){
    systemMenuOpen=false;
    if(token)api.logout(token);
    token=null; dialog.close(); page=''; query=''; network=''; owner='';
    tenant=dedicatedTenant;
    const info=tenant ? api.info(tenant) : null;
    if(info && (!info.login||(!info.usdt&&!info.beauty))){
      root.innerHTML='<div class="login"><div class="panel">'+brand+'<p>该租户尚未开通地址管理后台。</p></div></div>';return;
    }
    root.innerHTML='<div class="login"><form id="login">'+brand+'<h1>'+esc(info?.name || '租户登录')+'</h1>'+(dedicatedTenant ? '' : field('租户编号',input('tenantId','HS-TEN-001')))+field('地址后台账号',input('login','','autocomplete="username"'))+field('密码',input('password','','type="password" autocomplete="current-password"'))+'<p role="alert" class="error">'+esc(message)+'</p><button class="primary">登录</button>'+(dedicatedTenant ? '' : '<button id="preview" type="button">进入演示后台</button>')+'</form></div>';
    const previewButton=root.querySelector('#preview');
    if(previewButton) previewButton.onclick=async()=>{
      previewButton.disabled=true;
      try {
        const preview=await api.openPreview();
        tenant=preview.tenant;token=preview.token;render();
      } catch(err){root.querySelector('.error').textContent=err.message;previewButton.disabled=false;}
    };
    root.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const f=e.currentTarget;
      try{
        tenant=dedicatedTenant || f.elements.tenantId.value.trim();
        if(!/^HS-TEN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(tenant)) throw Error('请输入有效的租户编号');
        token=await api.login(tenant,f.elements.login.value.trim(),f.elements.password.value);render();}
      catch(err){f.querySelector('.error').textContent=err.message;}
    };
  }
  function modal(title,body,onSubmit,label='确认'){
    dialog.innerHTML='<form><h2>'+title+'</h2>'+body+'<p role="alert" class="error"></p><footer><button type="button" data-dismiss>关闭</button>'+(onSubmit?'<button class="primary">'+label+'</button>':'')+'</footer></form>';
    if(!dialog.open)dialog.showModal();
    dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const f=e.currentTarget, submit=f.querySelector('.primary');if(!onSubmit||submit.disabled)return;
      submit.disabled=true;
      try{const result=await onSubmit(new FormData(f));dialog.close();render();if(result?.password)modal('账号已创建',field('登录账号',input('login',result.login,'readonly'))+field('初始密码',input('password',result.password,'readonly')));}
      catch(err){f.querySelector('.error').textContent=err.message;}
      finally{submit.disabled=false;}
    };
  }
  const allocation=a=>a.biz==='usdt'?a.pool+' · L'+a.layer:a.sign;
  function filteredAddresses(){
    return v.addresses.filter(a=>owners().includes(a.biz) && (!owner || a.biz===owner) && (!network||a.network===network) && (!query||[a.name,a.address,allocation(a)].some(x=>x.toLowerCase().includes(query.toLowerCase()))));
  }
  function addresses(){
    const data=filteredAddresses();
    return '<div class="filters"><select id="owner" aria-label="地址归属">'+option('','全部归属')+ownerOptions(owners())+'</select><input id="query" aria-label="名称或收款地址" placeholder="名称或收款地址" value="'+esc(query)+'"><select id="network" aria-label="公链网络">'+option('','全部网络')+((owner==='beauty'||(!owner&&owners().includes('beauty')))?['TRC20','ERC20','TRON','BTC']:['TRC20','ERC20']).map(n=>option(n)).join('')+'</select>'+button('search','查询')+button('reset','重置')+'</div>'+
      table(['地址归属','名称','收款地址','币种 / 网络','地址池配置','状态','操作'],data.map(a=>[esc(api.titles[a.biz]),esc(a.name),'<code>'+esc(a.address)+'</code>',esc(a.currency+' / '+a.network),esc(allocation(a)),a.enabled===false?'已停用':'启用',!allowed(a.biz+'.edit')?'—':button('edit','申请变更',a.id)]),'暂无生效地址');
  }
  function compare(r){
    const a=r.after, b=r.before;
    const fields=[['名称','name'],['币种','currency'],['公链网络','network'],['收款地址','address'],['状态','enabled'],...(r.biz==='usdt'?[['池类型','pool'],['金额层级','layer']]:[['地址池标识','sign']])];
    return '<div class="compare"><strong>字段</strong><strong>变更前</strong><strong>申请值</strong>'+fields.map(([title,k])=>'<b>'+title+'</b><span>'+esc(k==='enabled'&&b?(b.enabled===false?'停用':'启用'):(b?.[k]??'—'))+'</span><span>'+esc(k==='enabled'?(a.enabled===false?'停用':'启用'):a[k])+'</span>').join('')+'</div>';
  }
  const canReview=r=>r.status==='待审核' && allowed('review.decide') && r.actor!==v.login;
  function reviews(){
    return table(['业务 / 地址','申请类型','申请人 / 时间（UTC+8）','状态','操作'],v.requests.map(r=>[
      esc(api.titles[r.biz])+'<br>'+esc(r.after.name),r.before?'变更':'新增',esc(r.actor)+'<br>'+esc(r.time),
      '<span class="badge">'+esc(r.status)+'</span>',
      '<div class="actions">'+button('review-detail','详情',r.id)+(canReview(r)?button('review','审核',r.id):'')+'</div>'
    ]),'暂无地址申请');
  }
  function addressForm(id){
    const old=v.addresses.find(a=>a.id===id);
    const choices=old?[old.biz]:owners().filter(biz=>allowed(biz+'.add'));
    if(!choices.length)return;
    const body=field('地址归属','<select name="biz" '+(old?'disabled':'')+'>'+ownerOptions(choices)+'</select>')+
      field('名称',input('name',old?.name,'maxlength="80"'))+field('币种','<select name="currency"></select>')+
      field('公链网络','<select name="network"></select>')+field('收款地址',input('address',old?.address,'maxlength="180"'))+
      '<div class="address-pool-fields"></div>';
    modal(old?'申请变更地址':'申请新增地址',body+(old?field('地址状态',select('enabled',['启用','停用'])):''),async data=>{
      const biz=old?.biz || data.get('biz');
      const values=Object.fromEntries(data);for(const k in values)values[k]=values[k].trim();
      if(biz==='usdt')values.layer=Number(values.layer);
      values.enabled=values.enabled!=='停用';
      await api.submit(token,biz,values,id);if(allowed('review'))page='review';
    },'提交审核');
    const f=dialog.querySelector('form').elements;
    f.biz.value=old?.biz || (choices.includes(owner)?owner:choices[0]);
    const syncNetwork=()=>{f.network.innerHTML=({USDT:['TRC20','ERC20'],TRX:['TRON'],BTC:['BTC']}[f.currency.value]).map(n=>option(n)).join('');};
    const syncOwner=()=>{
      const usdt=f.biz.value==='usdt';
      f.currency.innerHTML=(usdt?['USDT']:['USDT','TRX','BTC']).map(n=>option(n)).join('');
      dialog.querySelector('.address-pool-fields').innerHTML=usdt?
        field('池类型',select('pool',['普通池','白名单池']))+field('金额层级','<select name="layer">'+v.tiers.map((t,i)=>option(i+1,'L'+(i+1)+' · '+t.lower+' ≤ 金额'+(t.upper===null?'':' < '+t.upper))).join('')+'</select>'):
        field('地址池标识',input('sign',old?.sign,'maxlength="80"'));
      syncNetwork();
    };
    f.biz.onchange=syncOwner;f.currency.onchange=syncNetwork;syncOwner();
    if(old){
      f.enabled.value=old.enabled===false?'停用':'启用';f.currency.value=old.currency;syncNetwork();f.network.value=old.network;
      if(old.biz==='usdt'){f.pool.value=old.pool;f.layer.value=old.layer;}
    }
  }
  function reviewForm(id,editing){
    const r=v.requests.find(r=>r.id===id);
    if(!r || (editing && !canReview(r)))return;
    const info='<p>'+esc(api.titles[r.biz])+' · '+(r.before?'变更地址':'新增地址')+' · '+esc(r.status)+'</p>';
    const submitted='<li><strong>提交申请</strong><div>申请人 '+esc(r.actor)+' · '+esc(r.time)+'</div></li>';
    const decision=r.status==='待审核'?'':'<li><strong>'+esc(r.status)+'</strong><div>审核人 '+esc(r.reviewer || '—')+
      ' · '+esc(r.reviewedAt || '—')+'</div><div>审核意见　'+esc(r.reason || '—')+'</div></li>';
    const history='<section class="review-history"><h3>操作记录（UTC+8）</h3><ol>'+submitted+decision+'</ol></section>';
    const controls=editing?field('审核结果',select('decision',['通过','驳回']))+field('审核意见（驳回必填）','<textarea name="reason" rows="3"></textarea>'):'';
    modal(editing?'审核地址申请':'地址申请详情',info+compare(r)+history+controls,
      editing?data=>api.decide(token,id,data.get('decision')==='通过',data.get('reason')):null,'提交审核结果');
  }
  function render(){
    try{v=api.view(token);}catch(err){loginScreen(err.message);return;}
    if(owner && !owners().includes(owner))owner='';
    const visibleMenus=navigation().filter(m=>m.id==='wallets'?owners().length>0:
      allowed(m.id) && (m.id!=='levels' || v.businesses.includes('usdt')));
    const businessPages=visibleMenus.filter(m=>!m.system).map(m=>m.id);
    const systemPages=visibleMenus.filter(m=>m.system).map(m=>m.id);
    if(![...businessPages,...systemPages].includes(page)) {
      page=businessPages[0] || systemPages[0] || '';
      if(systemPages.includes(page))systemMenuOpen=true;
    }
    const navItem=k=>'<button data-page="'+k+'" '+(page===k?'aria-current="page"':'')+'>'+menuLabel(k)+'</button>';
    const systemGroup='<div class="system-nav"><button type="button" data-action="toggle-system" aria-controls="systemNavItems" aria-expanded="'+systemMenuOpen+'">系统管理</button>'+
      '<div id="systemNavItems" role="group" aria-label="系统管理" '+(systemMenuOpen?'':'hidden')+'>'+systemPages.map(navItem).join('')+'</div></div>';
    const nav=businessPages.map(navItem).join('')+(systemPages.length?systemGroup:'');
    let body='', action='';
    if(page==='wallets'){
      body=addresses();
      if(owners().some(biz=>allowed(biz+'.add')))action=button('add','新增地址');
      if(owners().some(biz=>(!owner||owner===biz)&&allowed(biz+'.export')))action+=button('export','导出地址');
    }
    if(page==='levels')body='<iframe class="levels" title="USDT 金额层级与目标池"></iframe>';
    if(page==='review')body=reviews();
    if(page==='accounts'){action=button('account','新增账号');body=table(['登录账号','账号名称','角色','操作'],v.accounts.map(a=>[esc(a.login),esc(a.displayName || '—'),esc(a.role),'<div class="actions">'+button('edit-account','编辑',a.login)+(a.role==='管理员'?'':button('delete-account','删除',a.login))+'</div>']),'暂无账号');}
    if(page==='roles'){
      action=button('new-role','新增角色');
      body=table(['角色','页面权限','按钮权限','账号数','操作'],v.roles.map(r=>[
        esc(r.name),new Set(r.grants.filter(k=>!k.includes('.')).map(k=>Object.hasOwn(api.titles,k)?'wallets':k)).size+' 个页面',r.grants.filter(k=>k.includes('.')).length+' 个按钮',r.members,
        r.name==='管理员'?button('view-role','查看权限',r.name):'<div class="actions">'+button('edit-role','编辑',r.name)+button('delete-role','删除',r.name)+'</div>'
      ]),'暂无角色');
    }
    if(page==='menus'){
      body=table(['所属导航','菜单名称 / 标识','按钮权限标识','排序','操作'],navigation().map(m=>[
        m.system?'系统管理':'一级导航',esc(m.label)+'<br><code>'+esc(m.id)+'</code>',
        (m.id==='wallets'?v.menus.filter(n=>Object.hasOwn(api.titles,n.id)):[m]).flatMap(n=>Object.entries(n.buttons).map(([key,label])=>esc(label)+' <code>'+esc(n.id+'.'+key)+'</code>')).join('<br>') || '—',
        m.order,button('edit-menu','编辑',m.id)
      ]),'暂无菜单');
    }
    if(page==='ip'){
      action=button('ip-settings','编辑白名单');
      body='<p class="policy-info"><strong>'+ (v.ipPolicy.enabled?'已启用':'未启用') +'</strong> · 当前来源 IP（演示） <code>'+esc(v.ipPolicy.sourceIp)+'</code></p>'+
        table(['允许登录的 IPv4 地址 / CIDR 网段','操作'],v.ipPolicy.rules.map(rule=>[
          '<code>'+esc(rule)+'</code>',
          '<div class="actions">'+button('edit-ip-rule','编辑',rule)+button('delete-ip-rule','删除',rule)+'</div>'
        ]),'尚未配置允许的 IP');
    }
    if(page==='audit')body=table(['时间（UTC+8）','操作人','操作','业务','对象'],v.log.map(l=>[l.time,esc(l.actor),esc(l.event),api.titles[l.biz]||'—',esc(l.ref)]),'暂无操作记录');
    root.innerHTML='<div class="shell"><aside>'+brand+'<nav>'+nav+'</nav></aside><main><header class="bar"><b>'+esc(v.name)+'</b><div class="actions"><span>'+esc(v.login)+' · '+esc(v.role)+'</span>'+button('logout','退出登录')+'</div></header><section class="panel"><div class="head"><h1>'+(page?menuLabel(page):'暂无可访问页面')+'</h1>'+action+'</div>'+body+'</section></main></div>';
    if(page==='wallets'){
      const ownerSelect=root.querySelector('#owner');
      ownerSelect.value=owner;
      ownerSelect.onchange=()=>{owner=ownerSelect.value;network='';query=root.querySelector('#query').value.trim();render();};
      root.querySelector('#network').value=network;
    }
    if(page==='levels'){
      const frame=root.querySelector('iframe');
      frame.contentWindow.addressLevels={
        tiers:v.tiers,addresses:v.addresses.filter(a=>a.biz==='usdt'),editable:allowed('levels.save'),
        save:tiers=>api.saveTiers(token,tiers)
      };
      const doc=frame.contentDocument;doc.open();doc.write(JSON.parse(document.querySelector('#address-documents').textContent)['amount-level']);doc.close();
    }
  }
  root.onclick=e=>{
    const b=e.target.closest('button');if(!b||!token)return;
    if(b.dataset.action==='toggle-system'){
      systemMenuOpen=!systemMenuOpen;
      b.setAttribute('aria-expanded',String(systemMenuOpen));
      root.querySelector('#systemNavItems').hidden=!systemMenuOpen;
      return;
    }
    if(b.dataset.page){page=b.dataset.page;query='';network='';owner='';render();return;}
    if(b.dataset.action==='logout'){loginScreen();return;}
    if(['add','edit'].includes(b.dataset.action))addressForm(b.dataset.id);
    if(b.dataset.action==='export'){
      v=api.view(token);
      if(page!=='wallets'||!owners().some(biz=>allowed(biz+'.export')))return;
      const rows=[['地址归属','名称','币种','公链网络','收款地址','池配置','状态'],...filteredAddresses().filter(a=>allowed(a.biz+'.export')).map(a=>[api.titles[a.biz],a.name,a.currency,a.network,a.address,allocation(a),a.enabled===false?'停用':'启用'])];
      const csv=rows.map(row=>row.map(value=>{
        const text=String(value).replace(/^[=+@\-\t\r]/,ch=>"'"+ch);
        return '"'+text.replaceAll('"','""')+'"';
      }).join(',')).join('\r\n');
      const link=document.createElement('a');
      link.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
      link.download=tenant+'-'+page+'-地址.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    }
    if(b.dataset.action==='review-detail' || b.dataset.action==='review')reviewForm(b.dataset.id,b.dataset.action==='review');
    if(['search','reset'].includes(b.dataset.action)){const search=b.dataset.action==='search';if(!search)owner='';query=search?root.querySelector('#query').value.trim():'';network=search?root.querySelector('#network').value:'';render();}
    const assignable=v.roles.filter(r=>r.name!=='管理员').map(r=>r.name);
    if(b.dataset.action==='account')modal('新增地址后台账号',field('登录账号',input('login','','maxlength="32"'))+field('角色',select('role',assignable)),data=>api.addAccount(token,data.get('login').trim(),data.get('role')),'创建账号');
    if(b.dataset.action==='edit-account'){
      const account=v.accounts.find(a=>a.login===b.dataset.id);
      const fixedRole=account.role==='管理员';
      const roleControl=select('role',fixedRole?[account.role]:assignable);
      modal('编辑账号',field('登录账号',input('login',account.login,'readonly'))+
        field('账号名称','<input name="displayName" maxlength="32" value="'+esc(account.displayName)+'">')+
        field('角色',roleControl),data=>api.updateAccount(token,account.login,{displayName:data.get('displayName'),role:fixedRole?account.role:data.get('role')}),'保存');
      const roleSelect=dialog.querySelector('select[name=role]');
      roleSelect.value=account.role;
      roleSelect.disabled=fixedRole;
    }
    if(b.dataset.action==='delete-account'){
      const login=b.dataset.id;
      modal('删除账号','<p>确认删除 <strong>'+esc(login)+'</strong>？该账号将失去地址后台访问权限，历史操作记录会保留。</p>',
        ()=>api.deleteAccount(token,login),'确认删除');
    }
    if(['new-role','edit-role','view-role'].includes(b.dataset.action)){
      const role=v.roles.find(r=>r.name===b.dataset.id);
      const readonly=b.dataset.action==='view-role';
      const check=(key,label,disabled)=>'<label class="grant"><input type="checkbox" name="grant" value="'+esc(key)+'" '+
        (role?.grants.includes(key)?'checked ':'')+(disabled?'disabled':'')+'>'+esc(label)+'</label>';
      const matrix=v.menus.filter(m=>readonly || !m.adminOnly).map(m=>'<div class="grant-row">'+check(m.id,Object.hasOwn(api.titles,m.id)?v.walletMenu.label+' · '+api.titles[m.id]:m.label,readonly)+
        '<div class="grant-buttons">'+Object.entries(m.buttons).map(([key,label])=>check(m.id+'.'+key,label,readonly || !role?.grants.includes(m.id))).join('')+'</div></div>').join('');
      modal(readonly?'查看权限':role?'编辑角色':'新增角色',field('角色名称',input('name',role?.name,'maxlength="32" '+(role?'readonly':'')))+
        '<fieldset class="grants"><legend>页面与按钮权限</legend><div class="grant-row grant-head"><b>可访问页面</b><b>可用按钮</b></div>'+matrix+'</fieldset>',
        readonly?null:data=>api.saveRole(token,data.get('name'),{grants:data.getAll('grant')},!!role),'保存');
      dialog.querySelectorAll('.grant-row > label input').forEach(box=>box.onchange=()=>{
        box.closest('.grant-row').querySelectorAll('.grant-buttons input').forEach(child=>{
          child.disabled=!box.checked;if(!box.checked)child.checked=false;
        });
      });
    }
    if(b.dataset.action==='delete-role'){
      const role=v.roles.find(r=>r.name===b.dataset.id);
      if(role.members)modal('角色使用中','<p>请先为使用「'+esc(role.name)+'」的 '+role.members+' 个账号分配其他角色，再删除。</p>');
      else modal('删除角色','<p>确认删除「'+esc(role.name)+'」？</p>',()=>api.deleteRole(token,role.name),'确认删除');
    }
    if(b.dataset.action==='edit-menu'){
      const m=navigation().find(item=>item.id===b.dataset.id);
      modal('编辑菜单',field('页面标识',input('key',m.id,'readonly'))+field('菜单名称',input('label',m.label,'maxlength="32"'))+
        field('导航排序',input('order',m.order,'type="number" min="0" max="999"')),
        data=>api.saveMenu(token,m.id,data.get('label'),Number(data.get('order'))),'保存');
    }
    if(b.dataset.action==='edit-ip-rule'){
      const current=b.dataset.id;
      modal('编辑白名单规则',field('IPv4 地址或 CIDR 网段',input('rule',current)),
        data=>api.changeIpRule(token,current,data.get('rule')),'保存');
    }
    if(b.dataset.action==='delete-ip-rule'){
      const current=b.dataset.id;
      modal('删除白名单规则','<p>确认删除 <code>'+esc(current)+'</code>？</p>',
        ()=>api.changeIpRule(token,current,null),'确认删除');
    }
    if(b.dataset.action==='ip-settings'){
      modal('编辑登录 IP 白名单',field('白名单状态',select('enabled',['未启用','已启用']))+
        field('允许的 IPv4 地址或 CIDR 网段（每行一条）','<textarea name="rules" rows="5" placeholder="203.0.113.24">'+esc(v.ipPolicy.rules.join('\n'))+'</textarea>')+
        '<p class="muted">当前来源 IP（演示） '+esc(v.ipPolicy.sourceIp)+'。启用后，本租户地址后台的所有账号共用此规则。</p>',
        data=>api.saveIpPolicy(token,data.get('enabled')==='已启用',data.get('rules').split(/\r?\n/)),'保存');
      dialog.querySelector('[name=enabled]').value=v.ipPolicy.enabled?'已启用':'未启用';
    }
  };
  window.top.addEventListener('storage',e=>{
    if(token && (e.key===null||e.key==='huisheng.address.portal.v1.'+tenant||e.key==='huisheng.beauty.authorization.v1')){
      dialog.close();render();
    }
  });
  loginScreen();
})();
