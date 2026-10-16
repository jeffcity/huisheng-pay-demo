const hsSettlementSeeds={"tenants":[{"id":"HS-TEN-001","name":"汇盛东南亚"},{"id":"HS-TEN-018","name":"北辰支付"},{"id":"HS-TEN-029","name":"蓝盛拆分租户"},{"id":"HS-TEN-044","name":"海岚通道业务"},{"id":"HS-TEN-061","name":"银湾结算"}],"orders":[{"id":"HS-C-260717-000941","tenantId":"HS-TEN-001","direction":"代收","status":"成功","amount":"8600.00","completedAt":"2026-07-17 14:33:20"},{"id":"HS-C-260717-000982","tenantId":"HS-TEN-001","direction":"代收","status":"异常待处理","amount":"12800.00","completedAt":"2026-07-17 15:42:18"},{"id":"HS-C-260717-000862","tenantId":"HS-TEN-001","direction":"代收","status":"异常待处理","amount":"21000.00","completedAt":"2026-07-17 13:14:26"},{"id":"RF-20260717-00628","tenantId":"HS-TEN-001","direction":"代收退款","status":"处理中","amount":"2000.00","completedAt":"2026-07-17 15:58:16"},{"id":"HS-C-260717-000902","tenantId":"HS-TEN-001","direction":"代收","status":"成功","amount":"4520.00","completedAt":"2026-07-17 15:51:40"},{"id":"HS-P-260717-002134","tenantId":"HS-TEN-001","direction":"代付","status":"失败","amount":"8000.00","completedAt":"2026-07-17 15:42:08"},{"id":"HS-P-260717-000219","tenantId":"HS-TEN-001","direction":"代付","status":"已取消","amount":"5000.00","completedAt":"2026-07-17 15:16:32"},{"id":"HS-P-260717-000220","tenantId":"HS-TEN-001","direction":"代付","status":"异常待处理","amount":"7200.00","completedAt":"2026-07-17 16:06:00"},{"id":"HS-P-260717-000221","tenantId":"HS-TEN-001","direction":"代付","status":"异常待处理","amount":"6400.00","completedAt":"2026-07-17 16:12:00"},{"id":"HS-P-260717-000336","tenantId":"HS-TEN-001","direction":"代付","status":"处理中","amount":"32500.00","completedAt":"2026-07-17 14:27:11"},{"id":"HS-P-260717-000298","tenantId":"HS-TEN-001","direction":"代付","status":"成功","amount":"9800.00","completedAt":"2026-07-17 12:43:18"},{"id":"HS-P-260717-000251","tenantId":"HS-TEN-001","direction":"代付","status":"异常待处理","amount":"42000.00","completedAt":"2026-07-17 10:26:48"},{"id":"HS-P-260715-000172","tenantId":"HS-TEN-001","direction":"代付","status":"成功","amount":"49950.00","completedAt":"2026-07-15 10:28:42"}]};
(() => {
  let owner=window;try{if(window.top.document)owner=window.top;}catch{}
  if(!owner.__HSTenantSettlements){
    const clone=value=>JSON.parse(JSON.stringify(value)),bills=[];let liveOrderRows=null;
    const tenants=hsSettlementSeeds.tenants,orders=hsSettlementSeeds.orders;
    const orderTenantIds=new Map(orders.map(o=>[o.id,o.tenantId]));
    const cents=value=>{const s=String(value);if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw new Error('订单金额格式不正确');const [a,b='']=s.split('.');return BigInt(a+b.padEnd(2,'0'));};
    const money=value=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
    const monthKey=value=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw new Error('请选择有效结算月份');return value;};
    const model={
      tenants:clone(tenants),
      registerTenant(t){const existing=tenants.find(item=>item.id===t.id);if(existing)existing.name=t.name;else tenants.push({id:t.id,name:t.name});this.tenants=clone(tenants);},
      getOrderRows(){return liveOrderRows===null?null:clone(liveOrderRows);},
      syncOrders(rows){
        const converted=[];
        for(const row of rows){let tenantId=orderTenantIds.get(row[0]);if(!tenantId){const matches=tenants.filter(t=>t.name===row[1]);if(matches.length===1)tenantId=matches[0].id;}if(!tenantId||!String(row[5]).startsWith('CNY '))continue;orderTenantIds.set(row[0],tenantId);converted.push({id:row[0],tenantId,direction:row[3],status:row[4],amount:String(row[5]).slice(4).replaceAll(',',''),completedAt:row[8]});}
        liveOrderRows=clone(rows);orders.splice(0,orders.length,...converted);
      },
      preview(tenantId,month){
        monthKey(month);const tenant=tenants.find(t=>t.id===tenantId);if(!tenant)throw new Error('租户不存在');
        const policies=owner.__HSProviderDemo.tenantBilling(tenantId),seen=new Set(),selected=[];
        for(const o of orders){if(o.tenantId!==tenantId||o.status!=='成功'||!['代收','代付'].includes(o.direction)||o.completedAt.slice(0,7)!==month||seen.has(o.id))continue;seen.add(o.id);selected.push(o);}
        const lines=['collection','payout'].map((key,index)=>{
          const direction=['代收','代付'][index],items=selected.filter(o=>o.direction===direction),amount=items.reduce((n,o)=>n+cents(o.amount),0n),policy=policies[key];let fee=null;
          if(!items.length)fee=0n;
          else if(policy.value!==''){
            const checked=owner.__HSProviderDemo.validateTenantBilling(policies)[key];
            if(checked.mode==='perTransaction')fee=BigInt(items.length)*cents(checked.value);
            else{const [a,b='']=checked.value.split('.'),rate=BigInt(a+b.padEnd(4,'0'));fee=(amount*rate+500000n)/1000000n;}
          }
          return {direction,count:items.length,amount:money(amount),policy:clone(policy),formula:owner.__HSProviderDemo.billingFormula(policy),fee:fee===null?null:money(fee)};
        });
        return {tenantId,tenantName:tenant.name,month,currency:'CNY',count:selected.length,amount:money(lines.reduce((n,l)=>n+cents(l.amount),0n)),lines,total:lines.some(l=>l.fee===null)?null:money(lines.reduce((n,l)=>n+cents(l.fee),0n)),orders:clone(selected)};
      },
      generate(tenantId,month){
        const existing=bills.find(b=>b.tenantId===tenantId&&b.month===month);if(existing)return clone(existing);
        const statement=this.preview(tenantId,month);if(!statement.count)throw new Error('本月没有成功订单，无需生成结算单');if(statement.total===null)throw new Error('请先设置有成功订单业务的租户费率');
        const bill={...statement,id:`ST-${month.replace('-','')}-${tenantId.slice(-3)}`,createdAt:new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false})};bills.push(clone(bill));return clone(bill);
      },
      find(tenantId,month){return clone(bills.find(b=>b.tenantId===tenantId&&b.month===month)||null);},
      list(){return clone(bills);}
    };owner.__HSTenantSettlements=model;
  }
  window.HSTenantSettlements=owner.__HSTenantSettlements;
})();
