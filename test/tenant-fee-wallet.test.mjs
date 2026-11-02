import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sources = ['provider-model','settlement-model','tenant-fee-wallet-model'].map(name => fs.readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8'));
function fixture() {
  const window = {document:{}}; window.top = window;
  const ctx = vm.createContext({window,Date,Map,Set,JSON,Error,BigInt});
  for (const source of sources) vm.runInContext(source,ctx);
  return {w:window.HSFeeWallets,b:window.HSProviderDemo,s:window.HSTenantSettlements};
}
const policy = (mode,value) => ({collection:{mode,value},payout:{mode,value}});
const order = (id,extra={}) => ({id,tenantId:'HS-TEN-017',direction:'代收',currency:'CNY',amount:'0.10',status:'成功',completedAt:'2026-07-20 10:00:00',...extra});
test('历史扣费样例关联真实成功订单，展示原精度和同一钱包余额',()=>{
 const f=fixture(),entries=f.w.entries('HS-TEN-001');
 assert.equal(entries.length,4);assert.equal(entries[0].afterBalance,f.w.wallet('HS-TEN-001').balance);const chronological=[...entries].reverse();assert.equal(chronological[0].beforeBalance,'1000.00');for(let i=1;i<chronological.length;i++)assert.equal(chronological[i].beforeBalance,chronological[i-1].afterBalance);assert(entries.every(e=>f.s.sourceOrders().some(o=>o.id===e.orderId&&o.status==='成功')));
 assert.equal(f.w.wallet('HS-TEN-001').balance,'936.94688');assert.equal(entries.find(e=>e.orderId==='HS-C-260717-000941').fee,'38.7086');
 assert.equal(f.s.preview('HS-TEN-001','2026-07').total,'63.05');assert.equal(f.s.preview('HS-TEN-001','2026-07').exactTotal,'63.05312');
});
test('每笔0.005原精度扣款，月度汇总为0.01而非逐笔舍入0.02',()=>{
 const f=fixture();f.b.setTenantBilling('HS-TEN-017',policy('percentage','5'));
 f.w.recordSuccess(order('A'));f.w.recordSuccess(order('B'));
 assert.equal(f.w.entries('HS-TEN-017')[0].fee,'0.005');assert.equal(f.w.wallet('HS-TEN-017').balance,'-0.01');
 const m=f.w.reconcile('HS-TEN-017','2026-07');assert.equal(m.lines[0].exactFee,'0.01');assert.equal(m.total,'0.01');
});
test('失败、取消、处理中和退款均不扣系统费，跨租户隔离',()=>{
 const f=fixture();f.b.setTenantBilling('HS-TEN-017',policy('perTransaction','2'));
 for(const status of ['失败','已取消','处理中','异常待处理'])assert.equal(f.w.recordSuccess(order(status,{status})).applied,false);
 assert.equal(f.w.recordSuccess(order('REFUND',{direction:'代收退款'})).applied,false);
 assert.equal(f.w.entries('HS-TEN-017').length,0);assert.equal(f.w.wallet('HS-TEN-001').balance,'936.94688');
 assert.throws(()=>f.w.wallet('OTHER'),/不存在/);
});
test('同租户同订单只扣一次，金额或方向冲突不重复扣款，费率修改不重写流水',()=>{
 const f=fixture();f.b.setTenantBilling('HS-TEN-017',policy('percentage','5'));
 assert.equal(f.w.recordSuccess(order('ID')).applied,true);assert.equal(f.w.recordSuccess(order('ID')).duplicate,true);
 f.b.setTenantBilling('HS-TEN-017',policy('percentage','10'));
 assert.equal(f.w.recordSuccess(order('ID')).duplicate,true);assert.match(f.w.recordSuccess(order('ID',{amount:'1.00'})).reason,/冲突/);
 assert.match(f.w.recordSuccess(order('ID',{direction:'代付'})).reason,/冲突/);
 assert.equal(f.w.wallet('HS-TEN-017').balance,'-0.005');assert.equal(f.w.entries('HS-TEN-017')[0].policy.value,'5');
 const copy=f.w.entries('HS-TEN-017');copy[0].fee='999';assert.equal(f.w.entries('HS-TEN-017')[0].fee,'0.005');
});
test('未设置不冒充免费，真实0费率可入账且不扣余额',()=>{
 const f=fixture();assert.match(f.w.recordSuccess(order('PENDING')).reason,/设置费率/);assert.equal(f.w.entries('HS-TEN-017').length,0);
 f.b.setTenantBilling('HS-TEN-017',policy('percentage','0'));assert.equal(f.w.recordSuccess(order('FREE')).entry.fee,'0.00');
 assert.equal(f.w.wallet('HS-TEN-017').balance,'0.00');assert.equal(f.w.canAccept('HS-TEN-017',{direction:'代收',amount:'1.00'}).allowed,true);
});
test('余额不足只拦截新单，在途成功仍扣；允许负余额恢复新单但关闭租户优先',()=>{
 const f=fixture();f.b.setTenantBilling('HS-TEN-001',policy('perTransaction','1000'));
 assert.equal(f.w.canAccept('HS-TEN-001',{direction:'代付',amount:'10.00'}).allowed,false);
 assert.equal(f.w.recordSuccess(order('INFLIGHT',{tenantId:'HS-TEN-001',direction:'代付'})).applied,true);
 assert.equal(f.w.wallet('HS-TEN-001').balance,'-63.05312');assert.equal(f.w.canAccept('HS-TEN-001').allowed,false);
 f.w.setAllowNegative('HS-TEN-001',true);assert.equal(f.w.canAccept('HS-TEN-001').allowed,true);
 f.w.syncTenantProfile({id:'HS-TEN-001',status:'关闭'});assert.equal(f.w.canAccept('HS-TEN-001').allowed,false);
 assert.equal(f.w.recordSuccess(order('INFLIGHT-2',{tenantId:'HS-TEN-001',direction:'代付'})).applied,true);
 f.w.setAllowNegative('HS-TEN-001',false);assert.equal(f.w.canAccept('HS-TEN-001').allowed,false);
});
test('月度对账只读取扣费快照，生成/重复生成/改当前费率不再次扣费',()=>{
 const f=fixture(),before=f.w.wallet('HS-TEN-001').balance;
 const bill=f.s.generate('HS-TEN-001','2026-07');assert.equal(bill.total,'63.05');assert.equal(f.w.wallet('HS-TEN-001').balance,before);
 f.b.setTenantBilling('HS-TEN-001',policy('percentage','99'));
 assert.equal(f.s.preview('HS-TEN-001','2026-07').total,'63.05');assert.equal(f.s.generate('HS-TEN-001','2026-07').id,bill.id);
 assert.equal(f.w.wallet('HS-TEN-001').balance,before);assert.equal(f.w.entries('HS-TEN-001').length,4);
});
test('订单状态同步成功触发扣费；重复同步不重复收费',()=>{
 const f=fixture();f.b.setTenantBilling('HS-TEN-001',policy('perTransaction','1.23'));
 const rows=f.s.sourceOrders().map(o=>[o.id,'汇盛东南亚','-',o.direction,o.status,'CNY '+o.amount,'-','-',o.completedAt]);
 rows.find(r=>r[0]==='HS-P-260717-000336')[4]='成功';
 f.s.syncOrders(rows);const after=f.w.wallet('HS-TEN-001').balance;
 assert.equal(after,'935.71688');assert.equal(f.w.entries('HS-TEN-001').length,5);
 f.s.syncOrders(rows);assert.equal(f.w.wallet('HS-TEN-001').balance,after);
});

test('关闭和停用租户不依赖访问平台页初始化，负余额开关不能绕过',()=>{const f=fixture();for(const id of ['HS-TEN-061','HS-TEN-029']){f.w.setAllowNegative(id,true);assert.equal(f.w.canAccept(id).allowed,false);}});
test('未设置费率拒绝新单，在途成功保留独立待计费事实',()=>{const f=fixture();assert.equal(f.w.canAccept('HS-TEN-001',{direction:'代付',amount:'100'}).allowed,false);const r=f.w.recordSuccess(order('PENDING-OUTSIDE-SOURCE'));assert.equal(r.pending,true);assert.equal(f.w.pendingEntries('HS-TEN-017').length,1);assert.equal(f.w.reconcile('HS-TEN-017','2026-07').pendingCount,1);assert.equal(f.w.reconcile('HS-TEN-017','2026-07').total,null);f.b.setTenantBilling('HS-TEN-017',policy('perTransaction','1'));f.w.recordSuccess(order('PENDING-OUTSIDE-SOURCE'));assert.equal(f.w.pendingEntries('HS-TEN-017').length,0);assert.equal(f.w.entries('HS-TEN-017').length,1);});

test('待计费成功快照不能被重试变更金额、业务或成功月份',()=>{const f=fixture(),o=order('IMMUTABLE-PENDING');f.w.recordSuccess(o);f.b.setTenantBilling('HS-TEN-017',policy('perTransaction','1'));for(const change of [{amount:'1.00'},{direction:'代付'},{completedAt:'2026-08-20 10:00:00'}])assert.match(f.w.recordSuccess({...o,...change}).reason,/快照冲突/);assert.equal(f.w.pendingEntries('HS-TEN-017').length,1);assert.equal(f.w.pendingEntries('HS-TEN-017')[0].orderAmount,'0.10');assert.equal(f.w.wallet('HS-TEN-017').balance,'0.00');assert.equal(f.w.recordSuccess(o).applied,true);});

const adjustment = (f, tenantId='HS-TEN-001', values={}) => ({direction:'increase',amount:'100.00',reason:'银行到账补记',operator:'Jeff / 平台超管',requestId:'adjust-request-001',expectedRevision:f.w.wallet(tenantId).revision,...values});
test('平台人工调增调减保留原精度余额并写完整流水，系统费及月度对账不混入人工调整',()=>{
 const f=fixture(),before=f.w.wallet('HS-TEN-001').balance,feeBefore=f.w.reconcile('HS-TEN-001','2026-07').exactTotal;
 const up=f.w.adjust('HS-TEN-001',adjustment(f));assert.equal(up.entry.beforeBalance,before);assert.equal(up.entry.afterBalance,'1036.94688');assert.equal(up.entry.operator,'Jeff / 平台超管');assert.equal(up.entry.reason,'银行到账补记');assert.match(up.entry.occurredAt,/^\d{4}-/);
 const down=f.w.adjust('HS-TEN-001',adjustment(f,'HS-TEN-001',{direction:'decrease',amount:'20.01',requestId:'adjust-request-002'}));assert.equal(down.entry.afterBalance,'1016.93688');assert.equal(down.entry.change,'-20.01');
 assert.equal(f.w.ledger('HS-TEN-001').length,6);assert.equal(f.w.entries('HS-TEN-001').length,4);assert.equal(f.w.reconcile('HS-TEN-001','2026-07').exactTotal,feeBefore);
 const copy=f.w.ledger('HS-TEN-001');copy[0].reason='改写';assert.notEqual(f.w.ledger('HS-TEN-001')[0].reason,'改写');
});
test('人工调整不得使用0、负数、多余小数、无原因或无操作人，失败不写余额或流水',()=>{
 for(const change of [{amount:'0'},{amount:'-1'},{amount:'1.001'},{amount:'1e2'},{amount:'1000000000000'},{reason:''},{reason:'x'.repeat(201)},{operator:''},{direction:'other'},{requestId:''},{expectedRevision:undefined}]){
  const f=fixture(),before=f.w.wallet('HS-TEN-001').balance,entries=f.w.ledger('HS-TEN-001').length;
  assert.throws(()=>f.w.adjust('HS-TEN-001',adjustment(f,'HS-TEN-001',change)));assert.equal(f.w.wallet('HS-TEN-001').balance,before);assert.equal(f.w.ledger('HS-TEN-001').length,entries);
 }
});
test('调减遵循允许负余额设置，调增可偿还已有负余额，关闭租户只读',()=>{
 const f=fixture();assert.throws(()=>f.w.adjust('HS-TEN-017',adjustment(f,'HS-TEN-017',{direction:'decrease',amount:'1.00'})),/负余额/);
 f.w.setAllowNegative('HS-TEN-017',true);assert.equal(f.w.adjust('HS-TEN-017',adjustment(f,'HS-TEN-017',{direction:'decrease',amount:'1.00'})).entry.afterBalance,'-1.00');
 f.w.setAllowNegative('HS-TEN-017',false);assert.equal(f.w.adjust('HS-TEN-017',adjustment(f,'HS-TEN-017',{amount:'0.01',requestId:'adjust-request-002'})).entry.afterBalance,'-0.99');
 assert.throws(()=>f.w.adjust('HS-TEN-061',adjustment(f,'HS-TEN-061')),/关闭/);assert.equal(f.w.ledger('HS-TEN-061').length,0);assert.equal(f.w.wallet('HS-TEN-001').balance,'936.94688');
});
test('调整请求幂等，内容冲突拒绝；收费导致余额变化时拒绝过期调整',()=>{
 const f=fixture(),input=adjustment(f);f.w.adjust('HS-TEN-001',input);assert.equal(f.w.adjust('HS-TEN-001',input).duplicate,true);assert.equal(f.w.wallet('HS-TEN-001').balance,'1036.94688');assert.throws(()=>f.w.adjust('HS-TEN-001',{...input,amount:'200.00'}),/冲突/);
 const stale=adjustment(f,'HS-TEN-001',{requestId:'adjust-request-002'});f.b.setTenantBilling('HS-TEN-001',policy('perTransaction','1'));f.w.recordSuccess(order('SUCCESS-DURING-ADJUST',{tenantId:'HS-TEN-001'}));
 const after=f.w.wallet('HS-TEN-001').balance;assert.throws(()=>f.w.adjust('HS-TEN-001',stale),/余额已变化/);assert.equal(f.w.wallet('HS-TEN-001').balance,after);assert.equal(f.w.ledger('HS-TEN-001').filter(e=>e.type==='人工调增').length,1);
});

test('同秒人工调整与系统费混合入账按实际顺序展示，余额链连续',()=>{
 const f=fixture();f.b.now=()=> '2026-10-29 12:00:00';f.b.setTenantBilling('HS-TEN-017',policy('perTransaction','0.01'));f.w.setAllowNegative('HS-TEN-017',true);
 f.w.adjust('HS-TEN-017',adjustment(f,'HS-TEN-017',{amount:'1.01'}));f.w.recordSuccess(order('SAME-SECOND'));
 f.w.adjust('HS-TEN-017',adjustment(f,'HS-TEN-017',{direction:'decrease',amount:'2.00',requestId:'adjust-request-002'}));
 const entries=f.w.ledger('HS-TEN-017');assert.equal(entries[0].afterBalance,'-1.00');assert.equal(entries[0].afterBalance,f.w.wallet('HS-TEN-017').balance);const chain=[...entries].reverse();for(let i=1;i<chain.length;i++)assert.equal(chain[i].beforeBalance,chain[i-1].afterBalance);
});

test('钱包流水支持订单号/流水号包含查询和类型、日期组合，查询不改变资金',()=>{
 const f=fixture(),before=f.w.wallet('HS-TEN-001').balance;
 assert.equal(f.w.queryLedger('HS-TEN-001',{keyword:'000941'})[0].orderId,'HS-C-260717-000941');
 assert.equal(f.w.queryLedger('HS-TEN-001',{keyword:'sf-000004'})[0].fee,'20.34452');
 assert.equal(f.w.queryLedger('HS-TEN-001',{type:'collect',from:'2026-07-17',to:'2026-07-17'}).length,2);
 assert.equal(f.w.queryLedger('HS-TEN-001',{type:'payout',from:'2026-07-15',to:'2026-07-15'}).length,1);
 assert.equal(f.w.queryLedger('HS-TEN-001',{keyword:'NOT-FOUND'}).length,0);
 assert.equal(f.w.queryLedger('HS-TEN-017',{}).length,0);assert.equal(f.w.queryLedger('HS-TEN-001',{}).length,4);assert.equal(f.w.wallet('HS-TEN-001').balance,before);
});
test('合并查询保留人工调增调减与待计费，并拒绝无效日期范围',()=>{
 const f=fixture();f.b.now=()=> '2026-10-29 12:00:00';f.w.adjust('HS-TEN-001',adjustment(f));
 assert.equal(f.w.queryLedger('HS-TEN-001',{type:'increase',from:'2026-10-29',to:'2026-10-29'}).length,1);
 assert.equal(f.w.queryLedger('HS-TEN-001',{keyword:'AJ-000001',type:'increase'})[0].reason,'银行到账补记');
 f.w.adjust('HS-TEN-001',adjustment(f,'HS-TEN-001',{direction:'decrease',amount:'1.00',requestId:'adjust-request-002'}));assert.equal(f.w.queryLedger('HS-TEN-001',{type:'decrease'}).length,1);
 f.w.recordSuccess(order('PENDING-QUERY'));const pending=f.w.queryLedger('HS-TEN-017',{keyword:'PENDING-QUERY',type:'collect',from:'2026-07-20',to:'2026-07-20'});assert.equal(pending.length,1);assert.equal(pending[0].status,'待计费');assert.equal(pending[0].change,null);assert.equal(pending[0].occurredAt,'');
 const before=JSON.stringify(f.w.wallet('HS-TEN-001'));for(const filters of [{from:'2026-07-20',to:'2026-07-01'},{from:'2026-02-30'},{to:'bad'},{type:'bogus'}])assert.throws(()=>f.w.queryLedger('HS-TEN-001',filters));assert.equal(JSON.stringify(f.w.wallet('HS-TEN-001')),before);
});

test('系统费日统计按成功日期分代收代付，原精度合计与月统计一致且排除人工调整',()=>{
 const f=fixture();f.w.adjust('HS-TEN-001',adjustment(f));const before=f.w.wallet('HS-TEN-001').balance,d=f.w.daily('HS-TEN-001','2026-07'),m=f.w.reconcile('HS-TEN-001','2026-07');
 assert.equal(d.rows.length,2);assert.equal(d.rows[0].date,'2026-07-17');assert.equal(d.rows[0].collection.count,2);assert.equal(d.rows[0].collection.amount,'13120.00');assert.equal(d.rows[0].collection.exactFee,'59.05312');assert.equal(d.rows[0].payout.count,1);assert.equal(d.rows[0].payout.amount,'9800.00');assert.equal(d.rows[0].exactTotal,'61.05312');assert.equal(d.rows[1].date,'2026-07-15');assert.equal(d.rows[1].exactTotal,'2.00');
 assert.equal(d.totals.exactTotal,m.exactTotal);assert.equal(d.totals.collection.count,m.lines[0].count);assert.equal(d.totals.payout.amount,m.lines[1].amount);assert.equal(d.totals.pendingCount,0);assert.equal(f.w.wallet('HS-TEN-001').balance,before);
});
test('日统计不按日舍入，跨月延迟扣款按订单成功日期归属，当前费率变化不改历史',()=>{
 const f=fixture();f.b.setTenantBilling('HS-TEN-017',policy('percentage','5'));f.b.now=()=> '2026-08-01 00:00:01';
 f.w.recordSuccess(order('DAILY-A',{completedAt:'2026-07-30 23:59:59'}));f.w.recordSuccess(order('DAILY-B',{completedAt:'2026-07-31 23:59:59'}));
 f.b.setTenantBilling('HS-TEN-017',policy('percentage','99'));const d=f.w.daily('HS-TEN-017','2026-07');assert.equal(d.rows[0].date,'2026-07-31');assert.equal(d.rows[0].collection.exactFee,'0.005');assert.equal(d.rows[1].collection.exactFee,'0.005');assert.equal(d.totals.exactTotal,'0.01');assert.equal(f.w.daily('HS-TEN-017','2026-08').rows.length,0);
});
test('日统计包含待计费成功，不假算免费；空月、其他租户及无效月份正确处理',()=>{
 const f=fixture();f.w.recordSuccess(order('DAILY-PENDING'));const d=f.w.daily('HS-TEN-017','2026-07');assert.equal(d.rows[0].collection.count,1);assert.equal(d.rows[0].collection.amount,'0.10');assert.equal(d.rows[0].pendingCount,1);assert.equal(d.rows[0].collection.exactFee,'0.00');assert.equal(d.totals.pendingCount,1);assert.equal(f.w.entries('HS-TEN-017').length,0);
 assert.equal(f.w.daily('HS-TEN-018','2026-07').rows.length,0);assert.equal(f.w.daily('HS-TEN-001','2026-06').rows.length,0);assert.throws(()=>f.w.daily('HS-TEN-001','2026-13'));assert.throws(()=>f.w.daily('OTHER','2026-07'));
});
test('已生成月度快照时，日统计与费用卡片使用同一快照，不混入后续成功订单',()=>{
 const f=fixture(),bill=f.s.generate('HS-TEN-001','2026-07');f.b.setTenantBilling('HS-TEN-001',policy('perTransaction','1'));f.w.recordSuccess(order('AFTER-MONTH-SNAPSHOT',{tenantId:'HS-TEN-001'}));const before=f.w.wallet('HS-TEN-001').balance,d=f.w.daily('HS-TEN-001','2026-07');assert.equal(d.totals.exactTotal,bill.exactTotal);assert.equal(d.totals.collection.count,bill.lines[0].count);assert.equal(f.w.wallet('HS-TEN-001').balance,before);
});


test('日统计日期范围包含边界，合计只汇总命中日期且不改变整月统计和钱包',()=>{
 const f=fixture(),before=JSON.stringify(f.w.wallet('HS-TEN-001')),full=f.w.daily('HS-TEN-001','2026-07');
 const one=f.w.daily('HS-TEN-001','2026-07',{from:'2026-07-17',to:'2026-07-17'});assert.equal(one.rows.length,1);assert.equal(one.rows[0].date,'2026-07-17');assert.equal(one.totals.exactTotal,'61.05312');assert.equal(one.totals.payout.count,1);
 const until=f.w.daily('HS-TEN-001','2026-07',{to:'2026-07-15'});assert.equal(until.totals.exactTotal,'2.00');assert.equal(until.totals.collection.count,0);
 assert.equal(f.w.daily('HS-TEN-001','2026-07',{from:'2026-07-16'}).rows.length,1);
 const empty=f.w.daily('HS-TEN-001','2026-07',{from:'2026-07-01',to:'2026-07-14'});assert.equal(empty.rows.length,0);assert.equal(empty.totals.exactTotal,'0.00');assert.equal(empty.totals.payout.count,0);
 assert.equal(f.w.daily('HS-TEN-001','2026-07',{from:'2026-07-15',to:'2026-07-17'}).totals.exactTotal,full.totals.exactTotal);assert.equal(f.w.daily('HS-TEN-001','2026-07',{}).totals.exactTotal,full.totals.exactTotal);assert.equal(f.w.reconcile('HS-TEN-001','2026-07').exactTotal,full.totals.exactTotal);assert.equal(JSON.stringify(f.w.wallet('HS-TEN-001')),before);
});
test('日统计拒绝无效、反向和跨统计月份日期，支持闰年日期且保留原精度与待计费',()=>{
 const f=fixture(),before=JSON.stringify(f.w.wallet('HS-TEN-001'));for(const filter of [{from:'2026-07-18',to:'2026-07-17'},{from:'2026-07-32'},{to:'bad'},{from:'2026-06-30'},{to:'2026-08-01'}])assert.throws(()=>f.w.daily('HS-TEN-001','2026-07',filter));
 assert.throws(()=>f.w.daily('HS-TEN-001','2026-02',{to:'2026-02-29'}));assert.equal(f.w.daily('HS-TEN-001','2028-02',{from:'2028-02-29'}).rows.length,0);assert.equal(JSON.stringify(f.w.wallet('HS-TEN-001')),before);
 f.w.recordSuccess(order('QUERY-DAILY-PENDING',{completedAt:'2026-07-16 12:00:00'}));f.b.setTenantBilling('HS-TEN-017',policy('percentage','5'));f.w.recordSuccess(order('QUERY-DAILY-EXACT',{completedAt:'2026-07-17 12:00:00'}));
 assert.equal(f.w.daily('HS-TEN-017','2026-07',{to:'2026-07-16'}).totals.pendingCount,1);const d=f.w.daily('HS-TEN-017','2026-07',{from:'2026-07-17'});assert.equal(d.totals.pendingCount,0);assert.equal(d.totals.exactTotal,'0.005');
});
