// Standalone demo only. Account, address and audit data are local to this browser.
(() => {
  const previewId = 'DEMO-ADDRESS';
  const prefix = 'huisheng.address.portal.v1.';
  const titles = { usdt: 'USDT 代收', beauty: '美人桥' };
  const sessions = new WeakMap();
  const key = id => {
    if (id !== previewId && !/^HS-TEN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(id)) throw Error('租户地址无效');
    return prefix + id;
  };
  const read = id => JSON.parse(localStorage.getItem(key(id)) || 'null');
  const beauty = id => id === previewId || JSON.parse(localStorage.getItem('huisheng.beauty.authorization.v1') || '{}')[id] === true;
  const granted = (s, biz) => biz === 'usdt' ? s.usdt : biz === 'beauty' && beauty(s.id);
  const now = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const initialTiers = () => [{lower:0,upper:100},{lower:100,upper:500},{lower:500,upper:null}];
  const empty = (id, name) => ({ id, name, usdt:false, accounts:[], addresses:[], requests:[], log:[], tiers:initialTiers() });
  const serial = (id, fn) => navigator.locks.request(key(id), fn);
  const save = s => localStorage.setItem(key(s.id), JSON.stringify(s));
  const log = (s, actor, event, biz = '', ref = '') => s.log.unshift({time:now(),actor,event,biz,ref});
  const pwd = () => crypto.randomUUID().replaceAll('-','').slice(0,16);
  async function digest(password, salt) {
    const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt + password));
    return Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function account(login, role) {
    const password = pwd(), salt = crypto.randomUUID();
    return { initial: {login,password}, record:{login,role,salt,hash:await digest(password,salt)} };
  }
  function seedReviewPreview(s) {
    const beautyAddress={id:'preview-beauty-main',biz:'beauty',name:'美人桥主收款地址',currency:'USDT',
      network:'TRC20',address:'DEMO-BEAUTY-001',sign:'主收款池',enabled:true};
    const reserve={id:'preview-usdt-reserve',biz:'usdt',name:'USDT 备用收款地址',currency:'USDT',
      network:'TRC20',address:'DEMO-USDT-RESERVE',pool:'普通池',layer:1,enabled:true};
    const submitted={actor:'demo_operator',before:null};
    const reviewed={reviewer:'demo_admin',addressId:beautyAddress.id,biz:beautyAddress.biz};
    s.addresses.push(beautyAddress);
    s.requests.push(
      {...submitted,id:'preview-review-pending',addressId:reserve.id,biz:reserve.biz,after:reserve,
        time:'2026-11-26 10:15:00',status:'待审核'},
      {...submitted,...reviewed,id:'preview-review-rejected',before:beautyAddress,
        after:{...beautyAddress,sign:'备用收款池'},time:'2026-11-25 15:20:00',status:'已驳回',
        reviewedAt:'2026-11-25 15:42:00',reason:'申请中的地址池标识与商户确认的主收款池不一致。'},
      {...submitted,...reviewed,id:'preview-review-approved',after:beautyAddress,
        time:'2026-11-24 09:10:00',status:'已通过',reviewedAt:'2026-11-24 09:35:00',reason:'已核对收款地址与公链网络。'}
    );
    s.reviewPreviewReady=true;
  }
  // Fixed source for this offline prototype. The deployed service must supply the connection IP.
  const sourceIp = '203.0.113.24';
  const defaultPolicy = () => ({enabled:false, rules:[]});
  function ipv4Value(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4 || parts.some(p => !/^(0|[1-9]\d{0,2})$/.test(p) || Number(p)>255)) return null;
    return parts.reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
  }
  function parseNetwork(rule) {
    const [ip, bits, ...extra] = rule.split('/');
    const value = ipv4Value(ip);
    if (extra.length || value === null || (bits !== undefined && !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits))) {
      throw Error('无效的 IPv4 地址或 CIDR 网段：' + rule);
    }
    const prefix = bits === undefined ? 32 : Number(bits);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32-prefix)) >>> 0;
    return {mask, network:(value & mask) >>> 0};
  }
  function permitsIp(policy) {
    return !policy?.enabled || policy.rules.some(rule => {
      const {mask,network} = parseNetwork(rule);
      return ((ipv4Value(sourceIp) & mask) >>> 0) === network;
    });
  }
  function setIpRules(s,enabled,rules) {
    rules.forEach(parseNetwork);
    const policy={enabled,rules};
    if (!permitsIp(policy)) throw Error('启用白名单时，请保留当前登录来源 IP 或其所在网段');
    s.ipPolicy=policy;
  }
  const builtins = [
    {name:'管理员', submit:true, review:true}, {name:'操作员', submit:true, review:false},
    {name:'审核员', submit:false, review:true}
  ];
  const menuDefinitions = [
    ['usdt','USDT 代收地址',{add:'新增地址',edit:'申请变更',export:'导出地址'}],
    ['beauty','美人桥地址',{add:'新增地址',edit:'申请变更',export:'导出地址'}],
    ['levels','金额层级与目标池',{save:'保存层级'}],
    ['review','地址审核',{decide:'审核申请'}],
    ['accounts','账号管理',{add:'新增账号',edit:'编辑账号',delete:'删除账号'},true],
    ['roles','角色管理',{add:'新增角色',edit:'编辑角色',delete:'删除角色'},true],
    ['menus','菜单管理',{edit:'编辑配置'},true],
    ['ip','登录 IP 白名单',{edit:'编辑白名单',editRule:'编辑规则',deleteRule:'删除规则'},true],
    ['audit','操作日志',{}]
  ];
  function menus(s) {
    return menuDefinitions.map(([id,label,buttons,adminOnly=false],index)=>({
      id,label:s.menuSettings?.[id]?.label || label,buttons,adminOnly,
      system:['accounts','roles','menus','ip','audit'].includes(id),order:s.menuSettings?.[id]?.order ?? (index+1)*10
    })).sort((a,b)=>a.order-b.order);
  }
  function availableKeys(s,admin) {
    return menus(s).filter(m=>admin || !m.adminOnly).flatMap(m=>[m.id,...Object.keys(m.buttons).map(k=>m.id+'.'+k)]);
  }
  function roleList(s) {
    const stored=s.customRoles || [];
    const defaults=builtins.filter(r=>!stored.some(x=>x.name===r.name) && !s.deletedRoles?.includes(r.name));
    return [...defaults,...stored].map(r=>{
      const admin=r.name==='管理员';
      const grants=admin?availableKeys(s,true):r.grants || [
        'usdt','beauty','levels','review','audit',
        ...(r.submit?['usdt.add','usdt.edit','beauty.add','beauty.edit']:[]),...(r.review?['review.decide']:[])
      ];
      return {...r,grants,submit:grants.some(k=>/^(usdt|beauty)\.(add|edit)$/.test(k)),review:grants.includes('review.decide')};
    });
  }
  function authorize(token, s, permission, biz) {
    const session = sessions.get(token);
    const user = s?.accounts.find(a=>a.login===session?.login && s.id===session.id && a.salt===session.salt);
    if (!user || !Object.keys(titles).some(b=>granted(s,b))) throw Error('请重新登录地址后台');
    if (!permitsIp(s.ipPolicy)) {
      sessions.delete(token);
      throw Error('登录来源 IP 未获该租户地址后台放行');
    }
    const role = roleList(s).find(r=>r.name===user.role);
    if (!role || (permission && !(permission==='admin' ? role.name==='管理员' : role.grants.includes(permission)))) throw Error('当前账号没有此项权限');
    if (biz && !granted(s,biz)) throw Error('该业务尚未开通或已停用');
    return user;
  }
  function change(token, permission, biz, fn) {
    const session = sessions.get(token);
    if (!session) throw Error('请重新登录地址后台');
    return serial(session.id, async () => {
      const s = read(session.id), user = authorize(token,s,permission,biz);
      const result = await fn(s,user);
      save(s);
      return result;
    });
  }
  window.HSAddressPortal = {
    titles,
    info(id) {
      const s = read(id);
      return {name:s?.name,usdt:!!s?.usdt,login:s?.accounts[0]?.login,beauty:beauty(id)};
    },
    url(id) { key(id); const url=new URL(location.href); url.hash=''; url.search=''; url.searchParams.set('addressTenant',id); return url.href; },
    configure(id, name, biz, enabled) {
      return serial(id, async () => {
        const s = read(id) || empty(id,name);
        s.name=name;
        if (biz==='usdt') s.usdt=enabled;
        let initial;
        if (enabled && !s.accounts.length) {
          const a=await account('addr_'+id.slice(7).toLowerCase(),'管理员');
          s.accounts.push(a.record); initial=a.initial;
        }
        save(s);
        return initial;
      });
    },
    async openPreview() {
      await serial(previewId, async () => {
        const existing=read(previewId);
        if (existing?.accountPreviewReady && existing.ipPolicy && existing.reviewPreviewReady) return;
        const s = existing || empty(previewId,'地址后台演示租户');
        if (!existing) {
        s.usdt = true;
        s.accounts.push({login:'demo_admin',role:'管理员'});
        s.addresses.push({id:'preview-usdt',biz:'usdt',name:'USDT 收款示例',network:'TRC20',
          address:'DEMO-USDT-001',currency:'USDT',pool:'普通池',layer:1,enabled:true});
        }
        if (!s.accountPreviewReady && !s.accounts.some(a=>a.login==='demo_operator') && roleList(s).some(r=>r.name==='操作员')) {
          s.accounts.push((await account('demo_operator','操作员')).record);
        }
        s.ipPolicy ??= {enabled:false,rules:[sourceIp,'198.51.100.0/24']};
        if (!s.reviewPreviewReady) seedReviewPreview(s);
        s.accountPreviewReady=true;
        save(s);
      });
      const token = {};
      sessions.set(token,{id:previewId,login:'demo_admin'}); authorize(token,read(previewId));
      return {tenant:previewId,token};
    },
    async login(id, login, password) {
      const s=read(id), a=s?.accounts.find(u=>u.login===login);
      if (!a || await digest(password,a.salt)!==a.hash) throw Error('账号或密码错误');
      const token={}; sessions.set(token,{id,login,salt:a.salt}); authorize(token,read(id)); return token;
    },
    logout(token) { sessions.delete(token); },
    view(token) {
      const s=read(sessions.get(token)?.id), user=authorize(token,s);
      const businesses=Object.keys(titles).filter(b=>granted(s,b));
      const visible=r=>businesses.includes(r.biz);
      const roles = roleList(s);
      const isAdmin = user.role === '管理员';
      const grants=roles.find(r=>r.name===user.role).grants;
      return {name:s.name,login:user.login,role:user.role,permissions:{...roles.find(r=>r.name===user.role)},businesses,walletMenu:{id:'wallets',label:'钱包地址管理',order:10,...s.menuSettings?.wallets},menus:menus(s).filter(m=>isAdmin || grants.includes(m.id)),tiers:grants.some(k=>['usdt','levels'].includes(k))?s.tiers:[],
        roles:isAdmin ? roles.map(r=>({...r,builtin:builtins.some(b=>b.name===r.name),members:s.accounts.filter(a=>a.role===r.name).length})) : [],
        ipPolicy:isAdmin ? {...(s.ipPolicy || defaultPolicy()),sourceIp} : null,
        addresses:s.addresses.filter(a=>visible(a) && (grants.includes(a.biz) || (a.biz==='usdt' && grants.includes('levels')))), requests:grants.includes('review')?s.requests.filter(visible):[],
        log:grants.includes('audit')?s.log.filter(r=>!r.biz||visible(r)):[], accounts:user.role==='管理员'?s.accounts.map(({login,role,displayName})=>({login,role,displayName})):[]};
    },
    addAccount(token,login,role) {
      return change(token,'admin',null,async(s,user)=>{
        if (!/^[a-zA-Z0-9_-]{3,32}$/.test(login)) throw Error('请输入 3 至 32 位字母、数字、下划线或短横线作为账号');
        if(role==='管理员'||!roleList(s).some(r=>r.name===role)) throw Error('请选择有效的角色');
        if(s.accounts.some(a=>a.login===login)) throw Error('该账号已存在');
        const a=await account(login,role); s.accounts.push(a.record); log(s,user.login,'创建'+role,'',login); return a.initial;
      });
    },
    setAccountRole(token, login, role) {
      return this.updateAccount(token,login,{role});
    },
    updateAccount(token,login,{role,displayName}) {
      return change(token,'admin',null,(s,user)=>{
        const target=s.accounts.find(a=>a.login===login);
        if (!target) throw Error('账号已被删除，请刷新列表');
        if ((role==='管理员') !== (target.role==='管理员') || !roleList(s).some(r=>r.name===role)) throw Error('该角色不可分配');
        const name=(displayName ?? target.displayName ?? '').trim();
        if (name.length>32) throw Error('账号名称最多 32 个字符');
        if (name===(target.displayName || '') && role===target.role) return;
        const changes=[];
        if (name!==(target.displayName || '')) changes.push('名称 '+(target.displayName || '—')+' → '+(name || '—'));
        if (role!==target.role) changes.push('角色 '+target.role+' → '+role);
        target.displayName=name;
        target.role=role;
        log(s,user.login,'编辑账号 · '+changes.join('、'),'',login);
      });
    },
    deleteAccount(token,login) {
      return change(token,'admin',null,(s,user)=>{
        const target=s.accounts.find(a=>a.login===login);
        if (!target) throw Error('账号已被删除，请刷新列表');
        if (target.role==='管理员' || target.login===user.login) throw Error('管理员账号受保护');
        s.accounts=s.accounts.filter(a=>a!==target);
        log(s,user.login,'删除账号','',login);
      });
    },
    saveRole(token,name,rights,editing) {
      return change(token,'admin',null,(s,user)=>{
        name = String(name).trim();
        if (!name || name.length>32 || name==='管理员') throw Error('请输入有效的角色名称');
        const roles = s.customRoles || (s.customRoles=[]);
        const current = roleList(s).find(r=>r.name===name);
        if (!!current!==editing) throw Error(current?'角色名称已存在':'角色不存在');
        const role = {name,submit:rights.submit===true,review:rights.review===true};
        if (rights.grants) {
          const keys=availableKeys(s,false);
          if (!Array.isArray(rights.grants) || rights.grants.some(k=>!keys.includes(k) || !rights.grants.includes(k.split('.')[0]))) throw Error('请核对页面及按钮权限');
          role.grants=[...new Set(rights.grants)];
        }
        const index=roles.findIndex(r=>r.name===name);
        if (index<0) roles.push(role); else roles[index]=role;
        log(s,user.login,(editing?'编辑':'新增')+'角色','',name);
      });
    },
    deleteRole(token,name) {
      return change(token,'admin',null,(s,user)=>{
        if (name==='管理员' || !roleList(s).some(r=>r.name===name)) throw Error('该角色无法删除');
        if (s.accounts.some(a=>a.role===name)) throw Error('该角色已分配账号，请先调整这些账号的角色');
        s.customRoles=(s.customRoles || []).filter(r=>r.name!==name);
        if (builtins.some(r=>r.name===name)) s.deletedRoles=[...new Set([...(s.deletedRoles || []),name])];
        log(s,user.login,'删除角色','',name);
      });
    },
    saveMenu(token,id,label,order) {
      return change(token,'admin',null,(s,user)=>{
        label=label.trim();
        if ((id!=='wallets' && !menus(s).some(m=>m.id===id)) || !label || label.length>32 || !Number.isInteger(order) || order<0 || order>999) throw Error('请填写菜单名称和 0 至 999 的排序值');
        (s.menuSettings ||= {})[id]={label,order};
        log(s,user.login,'编辑菜单','',id+' · '+label);
      });
    },
    saveIpPolicy(token,enabled,entries) {
      return change(token,'admin',null,(s,user)=>{
        const rules = [...new Set(entries.map(v=>v.trim()).filter(Boolean))];
        setIpRules(s,enabled===true,rules);
        log(s,user.login,(enabled?'启用':'停用')+'登录 IP 白名单','',rules.join('、') || '无规则');
      });
    },
    changeIpRule(token,current,replacement) {
      const deleting=replacement===null;
      return change(token,deleting?'ip.deleteRule':'ip.editRule',null,(s,user)=>{
        const policy=s.ipPolicy || defaultPolicy();
        const rules=[...policy.rules];
        const index=rules.indexOf(current);
        if (index<0) throw Error('这条规则已变更，请刷新列表');
        if (deleting) rules.splice(index,1);
        else {
          const next=replacement.trim();
          if (next===current) return;
          if (rules.includes(next)) throw Error('这条白名单规则已存在');
          rules[index]=next;
        }
        setIpRules(s,policy.enabled,rules);
        log(s,user.login,deleting?'删除登录 IP 规则':'编辑登录 IP 规则','',deleting?current:current+' → '+rules[index]);
      });
    },
    submit(token,biz,values,addressId) {
      return change(token,biz+(addressId?'.edit':'.add'),biz,(s,user)=>{
        const before=addressId && s.addresses.find(a=>a.id===addressId && a.biz===biz);
        if(addressId && !before) throw Error('未找到该业务地址');
        if(before && s.requests.some(r=>r.addressId===addressId&&r.status==='待审核')) throw Error('已有变更正在审核');
        const {name,network,address,pool,layer,sign,currency}=values;
        if(!name || !address || /\s/.test(address) || !['TRC20','ERC20','TRON','BTC'].includes(network)) throw Error('请填写名称、公链网络和完整地址');
        if(biz==='usdt' && (currency!=='USDT'||!['TRC20','ERC20'].includes(network)||!['普通池','白名单池'].includes(pool)||!s.tiers[layer-1])) throw Error('请核对公链网络、池类型和金额层级');
        if(biz==='beauty' && (!sign || !({USDT:['TRC20','ERC20'],TRX:['TRON'],BTC:['BTC']}[currency]||[]).includes(network))) throw Error('请核对币种、公链网络和地址池标识');
        if(s.addresses.some(a=>a.id!==addressId&&a.network===network&&a.address===address) || s.requests.some(r=>r.status==='待审核'&&r.after.network===network&&r.after.address===address)) throw Error('该地址已经存在或正在审核');
        const enabled=before ? values.enabled!==false : true;
        const after={id:addressId||crypto.randomUUID(),biz,name,network,address,currency,enabled,...(biz==='usdt'?{pool,layer}:{sign})};
        const req={id:crypto.randomUUID(),addressId:after.id,biz,before:before||null,after,actor:user.login,time:now(),status:'待审核'};
        s.requests.unshift(req); log(s,user.login,before?'申请变更地址':'申请新增地址',biz,name);
      });
    },
    decide(token,id,approved,reason) {
      return change(token,'review.decide',null,(s,user)=>{
        const r=s.requests.find(r=>r.id===id);
        if(!r||!granted(s,r.biz)||r.status!=='待审核') throw Error('申请状态或业务授权已变化');
        if(r.actor===user.login) throw Error('申请人不能审核自己的申请');
        if(!approved&&!reason.trim()) throw Error('请填写驳回原因');
        if(approved) {
          s.addresses=s.addresses.filter(a=>a.id!==r.addressId);
          s.addresses.push(r.after);
        }
        Object.assign(r,{status:approved?'已通过':'已驳回',reviewer:user.login,reviewedAt:now(),reason:reason.trim()});
        log(s,user.login,r.status+' · '+(r.before?'变更地址':'新增地址'),r.biz,r.after.name);
      });
    },
    saveTiers(token,tiers) {
      return change(token,'levels.save','usdt',(s,user)=>{
        if(!tiers.length||tiers.some((t,i)=>!Number.isFinite(t.lower)||t.lower!==(i?tiers[i-1].upper:0)||(t.upper===null?i!==tiers.length-1:!Number.isFinite(t.upper)||t.upper<=t.lower))) throw Error('金额区间须从零开始且连续');
        if([...s.addresses,...s.requests.filter(r=>r.status==='待审核').map(r=>r.after)].some(a=>a.biz==='usdt'&&a.layer>tiers.length)) throw Error('被地址使用的金额层级不能删除');
        s.tiers=tiers; log(s,user.login,'保存金额层级','usdt');
      });
    }
  };
})();
