// Fixed, read-only review data; production statistics must use the migrated LanSheng definitions.
(() => {
  const date = ['date','日期'], serial = ['id','序号'];
  const channel = [serial,date,['merchantId','商户号'],['merchant','商户名称'],['channel','通道名称'],['amount','成交金额'],['total','总单量'],['rate','成交率'],['serviceFee','服务费'],['profit','利润'],['remark','备注']];
  const balances = [['walletStart','初期余额'],['walletEnd','末期余额'],['walletDetail','余额明细']];
  const prepaid = [['prepayStart','初期预付'],['prepayEnd','末期预付'],['prepayDetail','预付明细']];
  const merchantCollect = [serial,date,['merchant','商户名称'],['amount','成交金额'],['total','总单量'],['success','成功数'],['rate','成交率'],['merchantServiceFee','商户服务费'],['channelServiceFee','通道服务费'],...balances,...prepaid];
  const merchantPayout = [serial,date,['merchant','商户名称'],['orderAmount','订单总金额'],['amount','成交金额'],['notAmount','未成交金额'],['total','总单量'],['success','成功数'],['notPaid','未支付'],['rate','成交率'],['merchantServiceFee','商户服务费'],...balances,...prepaid];
  const agent = [serial,date,['agentId','代理编号'],['agent','代理名称'],['walletStart','初期余额(CNY)'],['walletEnd','末期余额(CNY)'],['walletDetail','余额变动明细(CNY)']];
  const platform = [date,['amount','成交额'],['total','总单数'],['success','成功数'],['merchantServiceFee','商户服务费'],['channelServiceFee','通道服务费'],['profit','平台利润'],['platformServiceFee','平台服务费'],['merchantBalance','商户总余额'],['merchantPrepay','商户总预付'],['channelBalance','通道总余额']];
  const configs = {
    'payout-channel-daily': {title:'代付通道日终统计',kind:'channel',direction:'payout',columns:channel},
    'collect-channel-daily': {title:'代收通道日终统计',kind:'channel',direction:'collect',columns:channel},
    'merchant-collect-daily': {title:'商户代收日终统计',kind:'merchant',direction:'collect',columns:merchantCollect},
    'merchant-payout-daily': {title:'商户代付日终统计',kind:'merchant',direction:'payout',columns:merchantPayout},
    'agent-collect-daily': {title:'代理代收日终统计',kind:'agent',direction:'collect',columns:agent},
    'platform-collect-daily': {title:'平台代收日终统计',kind:'platform',direction:'collect',columns:[...platform,['channelPrepay','通道总预付'],['agentBalance','代理总余额']]},
    'platform-payout-daily': {title:'平台代付日终统计',kind:'platform',direction:'payout',columns:[...platform,['agentBalance','代理总余额']]}
  };
  const merchants=[['MCH-2031','星河游戏'],['MCH-1188','东盛电商'],['MCH-4116','百胜聚合']];
  const agents=[['AGT-1001','华东合作代理'],['AGT-1002','华南合作代理']];
  const channels={collect:[['COL-QP','QuickPay 快捷代收'],['COL-FC','FastCollect 银联代收']],payout:[['OUT-QP','QuickPay 银行卡代付'],['OUT-BP','BridgePay CNY 代付']]};
  const demoToday='2026-10-26';
  const moneyFields=new Set(['amount','orderAmount','notAmount','serviceFee','profit','merchantServiceFee','channelServiceFee','platformServiceFee','walletStart','walletEnd','walletDetail','prepayStart','prepayEnd','prepayDetail','merchantBalance','merchantPrepay','channelBalance','channelPrepay','agentBalance']);
  const countFields=new Set(['total','success','notPaid']);
  const sumFields=new Set(['amount','orderAmount','notAmount','total','success','notPaid','serviceFee','profit','merchantServiceFee','channelServiceFee','platformServiceFee']);
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function entities(route) {
    const c=configs[route]; if(!c)return [];
    return c.kind==='merchant'?merchants:c.kind==='agent'?agents:c.kind==='channel'?channels[c.direction]:[];
  }
  function fixtures(route,tenantId) {
    const c=configs[route];if(!c||tenantId!=='HS-TEN-001')return Object.freeze([]);
    const rows=[],options=entities(route),count=c.kind==='platform'?1:options.length;
    for(let day=0;day<24;day++)for(let n=0;n<count;n++) {
      const when=new Date(demoToday+'T00:00:00Z');when.setUTCDate(when.getUTCDate()-day);
      const zero=day===0&&n===0,total=zero?0:110+day*3+n*27,success=zero?0:total-5-n;
      const amount=zero?0:success*(c.direction==='payout'?42850:28600),notAmount=(total-success)*22400;
      const identity=options[n]||['',''];
      const row={route,tenantId,currency:'CNY',id:24*count-day*count-n,key:route+':'+day+':'+n,date:when.toISOString().slice(0,10),entityId:identity[0],merchantId:merchants[n%merchants.length][0],merchant:merchants[n%merchants.length][1],channel:channels[c.direction][n%2][1],agentId:agents[n%2][0],agent:agents[n%2][1],amount,orderAmount:amount+notAmount,notAmount,total,success,notPaid:total-success,rate:total?(success/total*100).toFixed(2)+'%':'—',
        serviceFee:zero?0:16840+n*2500+day*320,
        profit:zero?0:(day%5===1?-1280:9450)+n*350,
        merchantServiceFee:zero?0:32460+n*1540,channelServiceFee:zero?0:18240+n*750,
        platformServiceFee:zero?0:5600+n*125,
        walletStart:zero?0:93688000+n*24786000+day*940000,walletEnd:zero?0:97073400+n*24980200+day*87200,
        walletDetail:zero?0:[12500,-24000,0][n%3],prepayStart:zero?0:1584200+n*623400,prepayEnd:zero?0:1600540+n*598540,prepayDetail:zero?0:[16340,-24860,0][n%3],
        merchantBalance:zero?0:234850000+day*82000,merchantPrepay:zero?0:328400000+day*12500,channelBalance:zero?0:135200000+day*85000,channelPrepay:zero?0:168000000+day*32000,agentBalance:zero?0:7820000+day*3500,remark:day===0?'期初样例':''};
      // Keep the display-only sample movements consistent with their opening/closing snapshots.
      row.walletDetail=row.walletEnd-row.walletStart;row.prepayDetail=row.prepayEnd-row.prepayStart;
      if(c.kind==='merchant') {row.merchantId=identity[0];row.merchant=identity[1];}
      if(c.kind==='agent') {row.agentId=identity[0];row.agent=identity[1];}
      rows.push(Object.freeze(row));
    }
    return Object.freeze(rows);
  }
  function validDate(value) {
    if(!value)return '';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('请输入有效日期');
    const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
    if(date.toISOString().slice(0,10)!==value)throw new Error('请输入有效日期');return value;
  }
  function query(rows,route,tenantId,filters={}) {
    if(!configs[route]||!tenantId||(filters.currency||'CNY')!=='CNY')return [];
    const start=validDate(filters.start),end=validDate(filters.end);
    if(start&&end&&start>end)throw new Error('开始日期不能晚于结束日期');
    return rows.filter(r=>r.tenantId===tenantId&&r.route===route&&r.currency==='CNY'&&(!filters.entity||r.entityId===filters.entity)&&(!start||r.date>=start)&&(!end||r.date<=end)).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  }
  function totals(rows,route,tenantId) {
    const scoped=query(rows,route,tenantId),result={};
    for(const key of sumFields) result[key]=scoped.reduce((sum,r)=>sum+(r[key]||0),0);
    result.rate=result.total?(result.success/result.total*100).toFixed(2)+'%':'—';return result;
  }
  function presetRange(preset) {
    if(preset==='all')return {start:'',end:''};
    const date=new Date(demoToday+'T00:00:00Z');let end=demoToday;
    if(preset==='yesterday'){date.setUTCDate(date.getUTCDate()-1);end=date.toISOString().slice(0,10)}
    else if(preset==='week')date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
    else if(preset==='month')date.setUTCDate(1);
    else if(preset!=='today')return {start:'',end:''};
    return {start:date.toISOString().slice(0,10),end};
  }
  const csvCell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)&&!(/^[+-]?\d+(?:\.\d+)?$/.test(text)||text==='—'))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};
  function csv(rows,route,tenantId) {
    const c=configs[route];if(!c)throw new Error('未知报表');
    const scoped=query(rows,route,tenantId),sum=totals(scoped,route,tenantId);
    const value=(r,key)=>moneyFields.has(key)?(r[key]/100).toFixed(2):r[key];
    const result=[c.columns.map(([,name])=>name),...scoped.map(r=>c.columns.map(([key])=>value(r,key)))];
    if(scoped.length)result.push(c.columns.map(([key],i)=>i===0?'合计':sumFields.has(key)?value(sum,key):key==='rate'?sum.rate:''));
    return '\uFEFF'+result.map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  window.HSDailyReports=Object.freeze({configs,entities,fixtures,query,totals,presetRange,demoToday,moneyFields,countFields,sumFields,csv,escapeHtml});
})();
