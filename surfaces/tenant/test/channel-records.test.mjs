import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/channel-records-model.js',import.meta.url),'utf8');
const context=vm.createContext({window:{}});vm.runInContext(source,context);const model=context.window.HSChannelRecords;
const collect='channel-pay-change',payout='channel-payout-change',tenant='HS-TEN-001';
const rows=model.fixtures(collect,tenant),outRows=model.fixtures(payout,tenant);
const plain=value=>JSON.parse(JSON.stringify(value));
const filters={currency:'CNY'};
test('两套表头保持蓝盛列序，代付商户号不替换商户订单筛选语义',()=>{
 assert.deepEqual(plain(model.configs[collect].columns.map(c=>c[1])),['序号','通道名称','平台订单号','商户订单号','类型','币种','原金额','变动金额','变动后金额','变动时间','备注']);
 assert.deepEqual(plain(model.configs[payout].columns.map(c=>c[1])),['序号','通道名称','通道商名称','平台订单号','商户号','类型','币种','原金额','变动金额','变动后金额','变动时间','备注']);
});
test('两个运营中心路由接入同一个真实业务源',()=>{
 const modules=JSON.parse(readFileSync(new URL('../src/legacy/modules.json',import.meta.url),'utf8'));
 for(const route of [collect,payout]){assert.equal(modules[route].group,'运营中心');assert.equal(modules[route].sourceKey,'channel-records');assert.equal(modules[route].initialHash,route)}
 const embed=readFileSync(new URL('../src/embed.js',import.meta.url),'utf8');assert.match(embed,/moduleName === 'channel-records'/);
});
test('代收代付仅开放CNY，隐藏币种不可查询，类型保持独立',()=>{
 for(const route of [collect,payout]){assert.deepEqual(plain(model.configs[route].currencies),['CNY']);for(const currency of ['USDT','TRX'])assert.equal(model.query([...rows,...outRows],route,tenant,{currency}).length,0)}
 assert.deepEqual(plain(model.configs[collect].types),['后台调整','代收','结算','下发','活动赠送','其他']);assert.deepEqual(plain(model.configs[payout].types),['代付退回','后台调整','代付','结算','订单冲销']);
 assert.equal(model.query(outRows,payout,tenant,{currency:'TRX'}).length,0);
});
test('组合筛选同时限定币种、通道、类型、双订单号和时间',()=>{
 const target=rows.find(r=>r.currency==='CNY'&&r.type==='代收');
 const result=model.query(rows,collect,tenant,{currency:target.currency,channel:target.channelId,type:target.type,platformOrder:target.platformOrder.toLowerCase(),merchantOrder:target.merchantOrder,start:target.at,end:target.at});
 assert.equal(result.length,1);assert.equal(result[0].platformOrder,target.platformOrder);
 assert.equal(model.query(rows,collect,tenant,{...filters,platformOrder:'不存在订单'}).length,0);
});
test('代付商户订单号筛选使用订单字段，不能误用展示商户号',()=>{
 const target=outRows.find(r=>r.type==='代付'&&r.currency==='CNY');assert.notEqual(target.merchantNo,target.merchantOrder);
 const exact=model.query(outRows,payout,tenant,{...filters,merchantOrder:target.merchantOrder});assert.equal(exact.length,1);
 assert.equal(model.query(outRows,payout,tenant,{...filters,merchantOrder:target.merchantNo}).length,0);
});
test('查询与导出不能混入其他租户或其他方向',()=>{
 const foreign={...rows[0],tenantId:'HS-TEN-017',platformOrder:'FOREIGN-ONLY'};
 const mixed=[...rows,...outRows,foreign];
 const result=model.query(mixed,collect,tenant,filters);assert(result.length>10);assert(result.every(r=>r.tenantId===tenant&&r.direction==='collect'&&r.currency==='CNY'));
 assert.equal(model.fixtures(collect,'HS-TEN-017').length,0);assert.equal(model.fixtures(collect,'').length,0);
 const csv=model.csv(mixed,collect,tenant);assert(!csv.includes('FOREIGN-ONLY'));assert(!csv.includes('QuickPay 银行卡代付'));
});
test('时间范围含起止边界并支持日期到全天',()=>{
 const target=rows[0],one=model.query(rows,collect,tenant,{...filters,start:target.at.replaceAll('-','/'),end:target.at});assert.equal(one.length,1);
 const date=target.at.slice(0,10),day=model.query(rows,collect,tenant,{...filters,start:date,end:date});assert(day.length>1);assert(day.every(r=>r.at.startsWith(date)));
 assert.equal(model.normalizeTime('2026-10-21T10:20'),'2026-10-21 10:20:00');
});
test('非法或反向日期拒绝查询，原只读数据不改变',()=>{
 const before=JSON.stringify(rows);
 for(const start of ['2026-02-30','2026-13-01','无效','2026-10-21 24:00:00'])assert.throws(()=>model.query(rows,collect,tenant,{...filters,start}));
 assert.throws(()=>model.query(rows,collect,tenant,{...filters,start:'2026-10-21',end:'2026-10-20'}));assert.equal(JSON.stringify(rows),before);
});
test('分页条数、越界跳页、空态与查询后首页可用',()=>{
 const result=model.query(rows,collect,tenant,filters),first=model.paginate(result,1,10),next=model.paginate(result,2,10);assert.equal(first.rows.length,10);assert.notEqual(first.rows[0].id,next.rows[0].id);
 assert.equal(model.paginate(result,-8,10).page,1);const last=model.paginate(result,9999,20);assert.equal(last.page,last.pages);assert(last.rows.length<=20);
 assert.equal(model.paginate(result,1,100).rows.length,result.length);assert.equal(model.paginate([],99,10).page,1);assert.equal(model.paginate([],99,10).rows.length,0);
});
test('导出包含全部查询结果而非当前页，保持列序与CSV安全',()=>{
 const result=model.query(rows,collect,tenant,{...filters,type:'代收'}),csv=model.csv(result,collect,tenant);assert(csv.startsWith('\uFEFF"序号","通道名称","平台订单号","商户订单号"'));assert.equal(csv.split('\r\n').length,result.length+1);
 const malicious={...result[0],remark:'=HYPERLINK("bad")'};assert(model.csv([malicious],collect,tenant).includes("'="));assert(!csv.includes(',undefined'));
});
test('示例金额精度与变动关系正确，零值、正数、负数和TRX空态可验证',()=>{
 for(const row of [...rows,...outRows]){for(const key of ['before','after'])assert.match(row[key],/^\d+\.\d{2}$/);assert.match(row.change,/^[+-]?\d+\.\d{2}$/);assert.equal(Math.round(Number(row.before)*100)+Math.round(Number(row.change)*100),Math.round(Number(row.after)*100))}
 assert(rows.some(r=>r.change==='0.00'));assert(rows.some(r=>r.change.startsWith('+')));assert(rows.some(r=>r.change.startsWith('-')));assert.equal(model.query(rows,collect,tenant,{currency:'TRX'}).length,0);
});
test('只读页面无远程业务请求或钱包写入，内联脚本语法有效',()=>{
 const html=readFileSync(new URL('../public/legacy/sources/channel-records.html',import.meta.url),'utf8');assert.doesNotMatch(html,/\bfetch\(|XMLHttpRequest|localStorage\.setItem|setTenantBilling|\.tenantData\(|\.log\(/);
 assert.match(html,/provider\?\.tenantId!==tenantId/);assert.match(html,/暂无数据/);assert.match(html,/aria-label="商户订单号"/);
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
