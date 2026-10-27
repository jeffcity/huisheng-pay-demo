import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const scope=vm.createContext({window:{}});
vm.runInContext(read('../src/daily-reports-model.js'),scope);
vm.runInContext(read('../src/channel-records-model.js'),scope);
const daily=scope.window.HSDailyReports,records=scope.window.HSChannelRecords;
const expected=JSON.parse(read('./fixtures/lansheng-cny-reports.json'));
const modules=JSON.parse(read('../src/legacy/modules.json'));
const tenant='HS-TEN-001',plain=value=>JSON.parse(JSON.stringify(value));
const allModels=[[daily,'日终'],[records,'账户记录']];

test('7个日终和6个账户记录按蓝盛CNY字段独立清单完整接入',()=>{
 assert.equal(Object.keys(daily.configs).length,7);assert.equal(Object.keys(records.configs).length,6);
 assert.equal(Object.keys(expected).length,13);
 for(const [model,subgroup] of allModels)for(const [route,c] of Object.entries(model.configs)){
  assert.equal(c.title,expected[route].title,route);
  assert.deepEqual(plain(c.columns.map(([,name])=>name)),expected[route].columns,route);
  if(c.types)assert.deepEqual(plain(c.types),expected[route].types,route);
  assert.equal(modules[route].initialHash,route);assert.equal(modules[route].subgroup,subgroup);assert.equal(modules[route].label,c.title);
  assert(!c.columns.some(([,name])=>/USDT|TRX|RMB/.test(name)),route);
 }
 assert(!Object.values(modules).some(m=>/商户服务费流水|USDT代付手续费流水/.test(m.label)));
 for(const route of ['agent-payout-daily','agent-change']){assert.equal(modules[route],undefined);assert.equal(daily.configs[route],undefined);assert.equal(records.configs[route],undefined);}
 for(const c of Object.values(daily.configs))assert(!c.columns.some(([,label])=>label.includes('代理费')));
});
test('每页默认有多页CNY样例，其他租户和无租户不种入数据',()=>{
 for(const [model] of allModels)for(const route of Object.keys(model.configs)){
  const rows=model.fixtures(route,tenant);assert(rows.length>20,route);assert(rows.every(r=>r.currency==='CNY'&&r.tenantId===tenant&&r.route===route));
  assert.equal(model.fixtures(route,'HS-TEN-017').length,0);assert.equal(model.fixtures(route,'').length,0);
  if(model===daily)for(const row of rows){assert.equal(row.walletStart+row.walletDetail,row.walletEnd);assert.equal(row.prepayStart+row.prepayDetail,row.prepayEnd);}
  assert(rows.some(r=>r[model===daily?'amount':'change']===(model===daily?0:'0.00')),route);
 }
});
test('查询和导出在所有页面之间按租户、路由和CNY隔离',()=>{
 for(const [model] of allModels){
  const all=Object.keys(model.configs).flatMap(route=>model.fixtures(route,tenant));
  for(const route of Object.keys(model.configs)){
   const own=model.fixtures(route,tenant),foreign={...own[0],tenantId:'HS-TEN-017',remark:'FOREIGN-RECORD'},hidden={...own[0],currency:'USDT',remark:'HIDDEN-CURRENCY'};
   const mixed=[...all,foreign,hidden],result=model.query(mixed,route,tenant,{currency:'CNY'});
   assert.equal(result.length,own.length,route);assert(result.every(r=>r.route===route&&r.tenantId===tenant&&r.currency==='CNY'));
   assert.equal(model.query(mixed,route,tenant,{currency:'USDT'}).length,0);assert.equal(model.query(mixed,route,tenant,{currency:'TRX'}).length,0);
   const csv=model.csv(mixed,route,tenant);assert(!csv.includes('FOREIGN-RECORD'));assert(!csv.includes('HIDDEN-CURRENCY'));
   assert(!csv.includes('代理费'));if(model===daily){for(const key of ['agentFee','merchantAgentFee','channelAgentFee']){assert.equal(model.totals(own,route,tenant)[key],undefined);assert(own.every(row=>!Object.hasOwn(row,key)));}}
   assert.equal(csv.split('\r\n').length,own.length+(model===daily?2:1),route);
   assert.equal(model.query(mixed,route,'',{currency:'CNY'}).length,0);
  }
 }
});
test('日终实体与日期组合筛选含边界，导出与合计基于全部筛选记录',()=>{
 for(const route of Object.keys(daily.configs)){
  const rows=daily.fixtures(route,tenant),target=rows[3],filters={currency:'CNY',entity:target.entityId,start:target.date,end:target.date};
  const filtered=daily.query(rows,route,tenant,filters);assert.equal(filtered.length,1,route);assert.equal(filtered[0].key,target.key);
  const sums=daily.totals(filtered,route,tenant);assert.equal(sums.amount,target.amount);assert.equal(sums.total,target.total);
  assert.equal(sums.walletStart,undefined);assert.equal(sums.walletEnd,undefined);assert.equal(sums.prepayStart,undefined);assert.equal(sums.merchantBalance,undefined);
  assert.equal(daily.csv(filtered,route,tenant).split('\r\n').length,3);
 }
});
test('日终无效日期拒绝应用，零单成交率和时间预设有明确结果',()=>{
 const route='merchant-collect-daily',rows=daily.fixtures(route,tenant),before=JSON.stringify(rows);
 for(const start of ['2026-02-30','2026-13-01','26-10-01','2026-10-01T00:00'])assert.throws(()=>daily.query(rows,route,tenant,{start}));
 assert.throws(()=>daily.query(rows,route,tenant,{start:'2026-10-26',end:'2026-10-20'}));
 assert.equal(JSON.stringify(rows),before);assert.equal(daily.totals([rows[0]],route,tenant).rate,'—');
 assert.deepEqual(plain(daily.presetRange('today')),{start:'2026-10-26',end:'2026-10-26'});
 assert.deepEqual(plain(daily.presetRange('yesterday')),{start:'2026-10-25',end:'2026-10-25'});
 assert.deepEqual(plain(daily.presetRange('month')),{start:'2026-10-01',end:'2026-10-26'});
 assert.deepEqual(plain(daily.presetRange('all')),{start:'',end:''});
});
test('六类记录实体、类型、双订单号、秒级起止时间可联合筛选',()=>{
 for(const route of Object.keys(records.configs)){
  const rows=records.fixtures(route,tenant),target=rows.find(r=>r.platformOrder!=='-')||rows[1];
  const result=records.query(rows,route,tenant,{currency:'CNY',entity:target.entityId,type:target.type,platformOrder:target.platformOrder,merchantOrder:target.merchantOrder,start:target.at,end:target.at});
  assert.equal(result.length,1,route);assert.equal(result[0].id,target.id);
  assert.equal(records.query(rows,route,tenant,{currency:'CNY',platformOrder:'NOT-AN-ORDER'}).length,0);
  assert.equal(records.query(rows,route,tenant,{currency:'CNY',entity:'NOT-AN-ENTITY'}).length,0);
 }
});
test('记录分页、导出覆盖全部结果，正负零变动精确且不改变原始记录',()=>{
 for(const route of Object.keys(records.configs)){
  const rows=records.fixtures(route,tenant),before=JSON.stringify(rows),first=records.paginate(rows,1,10),second=records.paginate(rows,2,10);
  assert.equal(first.rows.length,10);assert.equal(second.rows.length,10);assert.notEqual(first.rows[0].id,second.rows[0].id);
  assert.equal(records.paginate(rows,999,10).page,7);assert.equal(records.paginate([],999,10).page,1);
  assert.equal(records.csv(rows,route,tenant).split('\r\n').length,68);
  assert(rows.some(r=>r.change.startsWith('+')));assert(rows.some(r=>r.change.startsWith('-')));assert(rows.some(r=>r.change==='0.00'));
  for(const row of rows)assert.equal(Math.round(Number(row.before)*100)+Math.round(Number(row.change)*100),Math.round(Number(row.after)*100));
  assert.equal(JSON.stringify(rows),before);
 }
});
test('导出文本防公式注入，字段无undefined，页面动态文本进行HTML转义',()=>{
 for(const [model] of allModels)for(const route of Object.keys(model.configs)){
  const row={...model.fixtures(route,tenant)[0],remark:'=HYPERLINK("bad")'};
  const csv=model.csv([row],route,tenant);assert(!csv.includes('undefined'),route);
  if(model.configs[route].columns.some(([key])=>key==='remark'))assert(csv.includes("'="),route);
  assert(!model.escapeHtml('<img src=x onerror=alert(1)>').includes('<img'));
 }
});
test('页面脚本编译有效，备注之外无资金写入或远程请求',()=>{
 for(const file of ['reports','channel-records']){
  const html=read('../public/legacy/sources/'+file+'.html');
  assert.doesNotMatch(html,/\bfetch\(|XMLHttpRequest|setTenantBilling|\.tenantData\(|\.log\(/);
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 }
 const html=read('../public/legacy/sources/reports.html');
 assert.match(html,/if\(!scopeValid\(\)\)\{toast\('租户已切换，备注未保存'/);
 assert.match(html,/if\(!scopeValid\(\)\)\{render\(\);return\}const rows=filtered/);
 assert.match(html,/remarkStorageKey='huisheng-demo:'\+tenantId/);
});
