// Read-only review fixtures. This model never changes wallets, orders or provider configuration.
(() => {
  const common = [['id','序号'],['channel','通道名称']];
  const tail = [['type','类型'],['currency','币种'],['before','原金额'],['change','变动金额'],['after','变动后金额'],['at','变动时间'],['remark','备注']];
  const configs = {
    'channel-pay-change': {title:'通道代收流水记录',kind:'channel',direction:'collect',currencies:['CNY'],types:['后台调整','代收','结算','下发','活动赠送','其他'],columns:[...common,['platformOrder','平台订单号'],['merchantOrder','商户订单号'],...tail]},
    'channel-payout-change': {title:'通道代付流水记录',kind:'channel',direction:'payout',currencies:['CNY'],types:['代付退回','后台调整','代付','结算','订单冲销'],columns:[...common,['provider','通道商名称'],['platformOrder','平台订单号'],['merchantNo','商户号'],...tail]},
    'channel-collect-prepay-change': {title:'通道代收预付记录',kind:'channel',direction:'collect',fundField:'cnyPrepaid',prepayReport:true,tenantOnly:true,currencies:['CNY'],types:['后台调整'],sourceHint:'这里记的是「代收通道管理」里每条通道的「预付」。增加或减少这笔预付，都会留下一条记录；余额和剩余预付的变化不记在这里。',columns:[['id','序号'],['channel','通道名称'],['entityId','通道编号'],...tail]},
    'channel-payout-receipt-change': {title:'通道代付预收记录',kind:'provider',direction:'payout',fundField:'totalPrepaid',prepayReport:true,tenantOnly:true,currencies:['CNY'],types:['后台调整'],sourceHint:'这里记的是「已授权通道商 → 代付」里的「总预付」。按通道商记录这笔钱的增减，不是单条代付通道的余额，也不是剩余预付。',columns:[['id','序号'],['provider','通道商名称'],['entityId','通道商编号'],...tail]},
    'merchant-collect-change': {title:'商户代收流水记录',kind:'merchant',direction:'collect',currencies:['CNY'],types:['后台调整','代收','结算','活动赠送','其他','订单冲正','下发'],columns:[['id','序号'],['merchant','商户名称'],['platformOrder','平台订单号'],['merchantOrder','商户订单号'],['type','类型'],['counterMerchant','对方商户'],['counterAccount','对方账户'],...tail.slice(1),['operation','操作']]},
    'merchant-payout-change': {title:'商户代付流水记录',kind:'merchant',direction:'payout',currencies:['CNY'],types:['后台调整','代付','结算','订单冲销'],columns:[['id','序号'],['merchant','商户名称'],['platformOrder','平台订单号'],['merchantOrder','商户订单号'],['type','类型'],['counterMerchant','对方商户'],['counterAccount','对方账户'],...tail.slice(1),['operation','操作']]},
    'merchant-payout-prepay-change': {title:'商户代付预付记录',kind:'merchant',direction:'payout',currencies:['CNY'],types:['后台调整','结算','订单冲销'],columns:[['id','序号'],['merchant','商户名称'],['platformOrder','平台订单号'],['merchantOrder','商户订单号'],...tail]},
    'merchant-collect-prepay-change': {title:'商户代收预付记录',kind:'merchant',direction:'collect',currencies:['CNY'],types:['后台调整','结算'],columns:[['id','序号'],['merchant','商户名称'],['platformOrder','平台订单号'],['merchantOrder','商户订单号'],...tail]},
  };
  const channels = {collect:[['COL-QP','QuickPay 快捷代收','QuickPay'],['COL-FC','FastCollect 银联代收','FastCollect']],payout:[['OUT-QP','QuickPay 银行卡代付','QuickPay'],['OUT-BP','BridgePay CNY 代付','BridgePay']]};
  // Only the two new reports use the exact identities and prepaid fields of the source pages.
  const prepayEntities = {
    collect:[['CH-FIAT-IN-001','QuickPay CNY 收银台','QuickPay',420000],['CH-FIAT-IN-018','FastCollect CNY 代收','FastCollect',18000],['CH-FIAT-IN-021','BridgePay 聚合代收','BridgePay',36500],['CH-FIAT-IN-027','CloudMoney 多类型代收','FastCollect',235000]],
    payout:[['V-001','QuickPay','QuickPay',0],['V-002','FastCollect','FastCollect',0],['V-003','BridgePay','BridgePay',0],['V-004','PayoutX','PayoutX',0]]
  };
  const merchants=[['MCH-2031','星河游戏'],['MCH-1188','东盛电商'],['MCH-4116','百胜聚合']];
  const agents=[['AGT-1001','华东合作代理'],['AGT-1002','华南合作代理']];
  const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => (cents/100).toFixed(2);
  const signedMoney = cents => (cents>0?'+':'')+money(cents);
  function entities(route) {
    const config=configs[route];if(!config)return [];
    if(config.prepayReport)return prepayEntities[config.direction];
    return config.kind==='channel'?channels[config.direction]:config.kind==='agent'?agents:merchants;
  }
  function fixtures(route,tenantId) {
    const config=configs[route];if(!config||tenantId!=='HS-TEN-001')return Object.freeze([]);
    if(config.prepayReport)return prepayFixtures(route,tenantId);
    const result=[],choices=entities(route),count=67;
    for(let i=0;i<count;i++) {
      const identity=choices[i%choices.length],merchant=merchants[i%merchants.length];
      const type=config.types[i%config.types.length],zero=i===0;
      const negative=['结算','下发','代付退回','订单冲销','订单冲正'].includes(type);
      const delta=zero?0:(negative?-1:1)*(10000+(i%8)*2503),before=500000+i*15203;
      const day=26-Math.floor(i/8),hour=18-i%8;
      const at=`2026-10-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:26:${String(59-i%60).padStart(2,'0')}`;
      const hasOrder=['代收','代付','代付退回','订单冲销','订单冲正','订单收入'].includes(type);
      const platformOrder=hasOrder?`HS${config.direction==='collect'?'C':config.direction==='payout'?'P':'A'}202610${String(100000+i)}`:'-';
      const merchantOrder=hasOrder?`ORD${config.direction==='collect'?'IN':config.direction==='payout'?'OUT':'AGT'}202610${String(200000+i)}`:'-';
      const remark=type==='代收'?`代收订单成功${money(Math.abs(delta))}，手续费：0.00`:type==='代付'?`商户代付成功加金额${money(delta)}，手续费：0.03`:type;
      result.push(Object.freeze({route,tenantId,direction:config.direction,id:count-i,entityId:identity[0],channelId:config.kind==='channel'?identity[0]:'',channel:config.kind==='channel'?(config.direction==='payout'&&i%5===1?'-':identity[1]):'-',provider:config.kind==='channel'?identity[2]:'-',merchantId:merchant[0],merchant:merchant[1],agentId:config.kind==='agent'?identity[0]:'',agent:config.kind==='agent'?identity[1]:'-',platformOrder,merchantOrder,merchantNo:hasOrder?merchant[0]:'-',type,currency:'CNY',counterMerchant:'-',counterAccount:'-',operation:'-',before:money(before),change:signedMoney(delta),after:money(before+delta),at,remark}));
    }
    return Object.freeze(result);
  }
  // Independent read-only history samples: each entity has a continuous chain ending at
  // its source page's initial CNY prepaid value. No order, balance or remaining-prepaid events.
  function prepayFixtures(route,tenantId) {
    const config=configs[route],result=[];
    const steps=[5000000,-2000000,1000000,-4000000];
    for(const [index,identity] of entities(route).entries()) {
      let before=Math.round(identity[3]*100);
      steps.forEach((delta,step)=>{
        const after=before+delta;
        result.push(Object.freeze({route,tenantId,direction:config.direction,fundField:config.fundField,id:step*4+index+1,entityId:identity[0],channel:config.kind==='channel'?identity[1]:'-',provider:config.kind==='provider'?identity[1]:identity[2],platformOrder:'-',merchantOrder:'-',type:'后台调整',currency:'CNY',before:money(before),change:signedMoney(delta),after:money(after),at:`2026-11-${String(11+step).padStart(2,'0')} 10:${String(index*5).padStart(2,'0')}:00`,remark:delta>0?'后台增加'+(config.kind==='provider'?'总预付':'预付'):'后台减少'+(config.kind==='provider'?'总预付':'预付')}));
        before=after;
      });
    }
    return Object.freeze(result);
  }
  function normalizeTime(value,end=false) {
    const v=String(value||'').trim().replaceAll('/','-').replace('T',' ');
    if(!v)return '';
    if(!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?$/.test(v))throw new Error('请输入正确的变更时间');
    const date=v.slice(0,10),[year,month,day]=date.split('-').map(Number),check=new Date(Date.UTC(year,month-1,day));
    if(check.toISOString().slice(0,10)!==date)throw new Error('请输入有效日期');
    const time=v.length===10?(end?'23:59:59':'00:00:00'):v.slice(11).padEnd(8,':00');
    const [h,m,s]=time.split(':').map(Number);if(h>23||m>59||s>59)throw new Error('请输入有效时间');
    return date+' '+time;
  }
  function query(rows,route,tenantId,filters={}) {
    const config=configs[route];if(!config||!tenantId||!config.currencies.includes(filters.currency))return [];
    const start=normalizeTime(filters.start),end=normalizeTime(filters.end,true);
    if(start&&end&&start>end)throw new Error('变更起始时间不能晚于结束时间');
    const platform=String(filters.platformOrder||'').trim().toLowerCase(),merchant=String(filters.merchantOrder||'').trim().toLowerCase(),entity=String(filters.entity??filters.channel??'');
    return rows.filter(r=>r.tenantId===tenantId&&r.route===route&&r.direction===config.direction&&r.currency===filters.currency&&(!platform||r.platformOrder.toLowerCase().includes(platform))&&(!merchant||r.merchantOrder.toLowerCase().includes(merchant))&&(!filters.type||r.type===filters.type)&&(!entity||r.entityId===entity)&&(!start||r.at>=start)&&(!end||r.at<=end)).sort((a,b)=>b.at.localeCompare(a.at)||b.id-a.id);
  }
  function paginate(rows,page=1,size=10) {
    const perPage=[10,20,50,100].includes(Number(size))?Number(size):10,pages=Math.max(1,Math.ceil(rows.length/perPage));
    const current=Math.max(1,Math.min(pages,Math.trunc(Number(page))||1));
    return {page:current,pages,total:rows.length,rows:rows.slice((current-1)*perPage,current*perPage)};
  }
  const csvCell=value=>{let v=String(value??'');if(/^[\s]*[=+@-]/.test(v)&&!(/^[+-]?\d+(?:\.\d+)?$/.test(v)||v==='-'))v="'"+v;return '"'+v.replaceAll('"','""')+'"'};
  function csv(rows,route,tenantId) {
    const config=configs[route];if(!config)throw new Error('未知流水页面');
    const scoped=rows.filter(r=>r.tenantId===tenantId&&r.route===route&&r.direction===config.direction&&r.currency==='CNY');
    return '\uFEFF'+[config.columns.map(([,label])=>csvCell(label)).join(','),...scoped.map(row=>config.columns.map(([key])=>csvCell(key==='at'?row[key].replaceAll('-','/'):row[key])).join(','))].join('\r\n');
  }
  window.HSChannelRecords=Object.freeze({configs,channels,entities,fixtures,query,paginate,csv,normalizeTime,escapeHtml});
})();
