// Read-only review fixtures. This model never changes wallets, orders or provider configuration.
(() => {
  const common = [['id','序号'],['channel','通道名称']];
  const tail = [['type','类型'],['currency','币种'],['before','原金额'],['change','变动金额'],['after','变动后金额'],['at','变动时间'],['remark','备注']];
  const configs = {
    'channel-pay-change': {title:'代收通道流水记录',direction:'collect',currencies:['CNY'],types:['后台调整','代收','结算','下发','活动赠送','其他'],columns:[...common,['platformOrder','平台订单号'],['merchantOrder','商户订单号'],...tail]},
    'channel-payout-change': {title:'代付通道流水记录',direction:'payout',currencies:['CNY'],types:['代付退回','后台调整','代付','结算','订单冲销'],columns:[...common,['provider','通道商名称'],['platformOrder','平台订单号'],['merchantNo','商户号'],...tail]}
  };
  const channels = {collect:[['COL-QP','QuickPay 快捷代收','QuickPay'],['COL-FC','FastCollect 银联代收','FastCollect'],['COL-USDT','USDT-TRC通道','BridgePay']],payout:[['OUT-QP','QuickPay 银行卡代付','QuickPay'],['OUT-BP','BridgePay CNY 代付','BridgePay'],['OUT-USDT','CloudMoney USDT 代付','FastCollect']]};
  const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => (cents/100).toFixed(2);
  const signedMoney = cents => (cents>0?'+':'')+money(cents);
  function fixtures(route,tenantId) {
    const config=configs[route];if(!config||tenantId!=='HS-TEN-001')return [];
    const result=[];
    ['CNY','USDT'].forEach((currency,currencyIndex)=>{
      const count=currency==='CNY'?67:14;
      for(let i=0;i<count;i++) {
        const channel=channels[config.direction][currency==='USDT'?2:i%2];
        const type=config.types[i%config.types.length], zero=i===0, negative=['结算','下发','代付退回','订单冲销'].includes(type);
        const delta=zero?0:(negative?-1:1)*(10000+(i%8)*2503+currencyIndex*701);
        const before=500000+i*15203+currencyIndex*20300;
        const day=21-Math.floor(i/8),hour=18-i%8;
        const at=`2026-10-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:26:${String(59-i%60).padStart(2,'0')}`;
        const hasOrder=['代收','代付','代付退回','订单冲销'].includes(type);
        const platformOrder=hasOrder?`HS${config.direction==='collect'?'C':'P'}202610${String(100000+i+currencyIndex*1000)}`:'-';
        const merchantOrder=hasOrder?`ORD${config.direction==='collect'?'IN':'OUT'}202610${String(200000+i+currencyIndex*1000)}`:'-';
        const remark=type==='代收'?`代收订单成功${money(Math.abs(delta))}，手续费：0.00`:type==='代付'?`商户代付成功加金额${money(delta)}，手续费：0.03`:type;
        result.push(Object.freeze({tenantId,direction:config.direction,id:count-i,channelId:channel[0],channel:config.direction==='payout'&&i%5===1?'-':channel[1],provider:channel[2],platformOrder,merchantOrder,merchantNo:hasOrder?['MCH-2031','MCH-1188','MCH-3096'][i%3]:'-',type,currency,before:money(before),change:signedMoney(delta),after:money(before+delta),at,remark}));
      }
    });
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
    const platform=String(filters.platformOrder||'').trim().toLowerCase(),merchant=String(filters.merchantOrder||'').trim().toLowerCase();
    return rows.filter(r=>r.tenantId===tenantId&&r.direction===config.direction&&r.currency===filters.currency&&(!platform||r.platformOrder.toLowerCase().includes(platform))&&(!merchant||r.merchantOrder.toLowerCase().includes(merchant))&&(!filters.type||r.type===filters.type)&&(!filters.channel||r.channelId===filters.channel)&&(!start||r.at>=start)&&(!end||r.at<=end)).sort((a,b)=>b.at.localeCompare(a.at)||b.id-a.id);
  }
  function paginate(rows,page=1,size=10) {
    const perPage=[10,20,50,100].includes(Number(size))?Number(size):10,pages=Math.max(1,Math.ceil(rows.length/perPage));
    const current=Math.max(1,Math.min(pages,Math.trunc(Number(page))||1));
    return {page:current,pages,total:rows.length,rows:rows.slice((current-1)*perPage,current*perPage)};
  }
  const csvCell=value=>{let v=String(value??'');if(/^[\s]*[=+@-]/.test(v)&&!(/^[+-]?\d+(?:\.\d+)?$/.test(v)||v==='-'))v="'"+v;return '"'+v.replaceAll('"','""')+'"'};
  function csv(rows,route,tenantId) {
    const config=configs[route];if(!config)throw new Error('未知流水页面');
    const scoped=rows.filter(r=>r.tenantId===tenantId&&r.direction===config.direction);
    return '\uFEFF'+[config.columns.map(([,label])=>csvCell(label)).join(','),...scoped.map(row=>config.columns.map(([key])=>csvCell(key==='at'?row[key].replaceAll('-','/'):row[key])).join(','))].join('\r\n');
  }
  window.HSChannelRecords=Object.freeze({configs,channels,fixtures,query,paginate,csv,normalizeTime,escapeHtml});
})();
