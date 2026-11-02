// Cross-tenant read-only review adapter. Tenant report definitions and query rules remain unchanged.
(() => {
 const daily=window.HSDailyReports,records=window.HSChannelRecords;
 const configs=Object.fromEntries([[daily,'日终'],[records,'账户记录']].flatMap(([base,category])=>Object.entries(base.configs).map(([route,c])=>[route,Object.freeze({...c,category,columns:[...(c.columns[0][0]==='id'?[c.columns[0]]:[]),['tenant','租户'],...c.columns.slice(c.columns[0][0]==='id'?1:0)],permissions:{view:'platform.report.'+route+'.view',query:'platform.report.'+route+'.query',export:'platform.report.'+route+'.export'}})])));
 const baseFor=route=>configs[route]?.category==='日终'?daily:records;
 const tenantList=catalog=>[...new Map((catalog||[]).filter(t=>t&&t.id&&t.name).map(t=>[t.id,{id:String(t.id),name:String(t.name)}])).values()];
 function accessible(catalog,authorization,preview=false){
  const all=tenantList(catalog);if(preview)return all;
  if(!authorization)return [];
  if(authorization.dataScope?.scopeCode==='platform.all_tenants')return all;
  if(authorization.dataScope?.scopeCode==='platform.assigned_tenants')return all.filter(t=>authorization.dataScope.tenantIds?.includes(t.id));
  return [];
 }
 function fixtures(route,catalog){
  if(!configs[route])return [];
  const base=baseFor(route),isDaily=base===daily;
  return Object.freeze(tenantList(catalog).flatMap((t,index)=>base.fixtures(route,'HS-TEN-001').map(seed=>{
   const row={...seed,tenantId:t.id,tenantName:t.name,tenant:t.name+'（'+t.id+'）',entityKey:t.id+':'+seed.entityId,key:t.id+':'+(seed.key||seed.id)};
   // Explicitly virtual examples for the platform view; keep tenant 001 values identical.
   if(isDaily){for(const key of daily.moneyFields)if(Number.isFinite(row[key]))row[key]*=index+1;}
   else {for(const key of ['before','change','after']){const n=Math.round(Number(row[key])*100)*(index+1);row[key]=(key==='change'&&n>0?'+':'')+(n/100).toFixed(2);}}
   return Object.freeze(row);
  })));
 }
 function query(rows,route,filters={},allowedIds=[]){
  const config=configs[route];if(!config||(filters.currency||'CNY')!=='CNY')return [];
  const base=baseFor(route),ids=new Set(allowedIds),selected=String(filters.tenant||'');
  // Validate dates even when a tenant has no rows, retaining the tenant page's error behavior.
  base.query([],route,'scope',{...filters,entity:'',currency:'CNY'});
  if(selected&&!ids.has(selected))return [];
  const targetIds=selected?[selected]:[...ids];
  const result=targetIds.flatMap(id=>base.query(rows,route,id,{...filters,entity:'',currency:'CNY'}));
  return result.filter(r=>!filters.entity||r.entityKey===filters.entity).sort((a,b)=>String(b.date||b.at).localeCompare(String(a.date||a.at))||a.tenantId.localeCompare(b.tenantId)||b.id-a.id);
 }
 function entities(route,catalog,selected='',allowedIds=[]){
  const ids=new Set(allowedIds);if(!configs[route]||configs[route].kind==='platform')return [];
  return tenantList(catalog).filter(t=>ids.has(t.id)&&(!selected||selected===t.id)).flatMap(t=>baseFor(route).entities(route).map(([id,name])=>[t.id+':'+id,t.name+' · '+name+' · '+id]));
 }
 function totals(rows,route,allowedIds=[]){
  const scoped=query(rows,route,{},allowedIds),result={};
  for(const key of daily.sumFields)result[key]=scoped.reduce((sum,r)=>sum+(Number(r[key])||0),0);
  result.rate=result.total?(result.success/result.total*100).toFixed(2)+'%':'—';return result;
 }
 const csvCell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)&&!(/^[+-]?\d+(?:\.\d+)?$/.test(s)||s==='—'||s==='-'))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
 function csv(rows,route,allowedIds=[]){
  const c=configs[route];if(!c)throw new Error('未知报表');const scoped=query(rows,route,{},allowedIds),isDaily=c.category==='日终';
  const value=(r,key)=>isDaily&&daily.moneyFields.has(key)?(r[key]/100).toFixed(2):key==='at'?r[key].replaceAll('-','/'):r[key];
  const lines=[c.columns.map(([,label])=>label),...scoped.map(row=>c.columns.map(([key])=>value(row,key)))];
  if(isDaily&&scoped.length){const sum=totals(scoped,route,allowedIds);lines.push(c.columns.map(([key],i)=>i===0?'合计':daily.sumFields.has(key)?value(sum,key):key==='rate'?sum.rate:''));}
  return '\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n');
 }
 window.HSPlatformReports=Object.freeze({configs,accessible,fixtures,entities,query,totals,csv,escapeHtml:daily.escapeHtml,moneyFields:daily.moneyFields,countFields:daily.countFields,sumFields:daily.sumFields,demoToday:daily.demoToday,presetRange:daily.presetRange,paginate:records.paginate,normalizeTime:records.normalizeTime});
})();
