// Single tenant system-fee wallet for the local review Demo. No real funds or network.
(() => {
  let owner = window;
  try { if (window.top.document) owner = window.top; } catch (_) {}
  if (!owner.__HSFeeWallets) {
    const scale = 100000000n, wallets = new Map(), charges = new Map(), pending = new Map(), adjustments = new Map();
    const clone = value => JSON.parse(JSON.stringify(value));
    const parse = (value, precision = 8) => {
      const text = String(value ?? '').trim();
      if (!new RegExp('^\\d+(?:\\.\\d{1,' + precision + '})?$').test(text)) throw new Error('请输入有效的非负金额或费率');
      const [whole, fraction = ''] = text.split('.');
      return BigInt(whole + fraction.padEnd(precision, '0'));
    };
    const exact = value => {
      const negative = value < 0n, n = negative ? -value : value;
      const fraction = String(n % scale).padStart(8, '0').replace(/0+$/, '').padEnd(2, '0');
      return `${negative ? '-' : ''}${n / scale}.${fraction}`;
    };
    const rounded = value => {
      const n = (value + 500000n) / 1000000n;
      return `${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
    };
    function ensure(tenantId) {
      const known = owner.__HSProviderDemo?.tenants.some(t => t.id === tenantId) || owner.__HSTenantSettlements?.tenants.some(t => t.id === tenantId);
      if (!known) throw new Error('租户不存在');
      if (!wallets.has(tenantId)) wallets.set(tenantId, { balance: tenantId === 'HS-TEN-001' ? 1000n * scale : 0n, allowNegative: false, status: ({'HS-TEN-018':'审核中','HS-TEN-029':'停用','HS-TEN-061':'关闭'})[tenantId] || '正常', profileInitialized: false, revision: 0 });
      return wallets.get(tenantId);
    }
    function policyFor(tenantId, direction) {
      const policies = owner.__HSProviderDemo.tenantBilling(tenantId);
      return policies[direction === '代收' ? 'collection' : 'payout'];
    }
    function quote(amount, policy) {
      if (!policy || policy.value === '') return null;
      const checked = owner.__HSProviderDemo.validateTenantBilling({ collection: policy, payout: policy }).collection;
      const cents = parse(amount, 2);
      return checked.mode === 'percentage' ? cents * parse(checked.value, 4) : parse(checked.value, 2) * 1000000n;
    }
    function post(order, policy, deductedAt) {
      const tenantId = String(order.tenantId || ''), wallet = ensure(tenantId);
      if (order.status !== '成功' || !['代收', '代付'].includes(order.direction) || (order.currency && order.currency !== 'CNY')) return { applied: false, reason: '仅成功的CNY代收、代付订单计费' };
      if (!order.id || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(order.completedAt || '')) throw new Error('订单号和成功时间不能为空');
      const amount = parse(order.amount, 2), key = `${tenantId}:${order.id}`, prior = charges.get(key);
      if (prior) {
        if (prior.direction !== order.direction || parse(prior.orderAmount, 2) !== amount || prior.succeededAt !== order.completedAt) return { applied: false, reason: '订单快照冲突，未重复扣费' };
        return { applied: false, duplicate: true, entry: clone(prior) };
      }
      const pendingPrior = pending.get(key);
      if (pendingPrior && (pendingPrior.direction !== order.direction || parse(pendingPrior.orderAmount, 2) !== amount || pendingPrior.succeededAt !== order.completedAt)) return { applied: false, reason: '待计费订单快照冲突，原记录已保留' };
      const fee = quote(order.amount, policy);
      if (fee === null) {
        if (!pending.has(key)) pending.set(key, { id: `SF-PENDING-${order.id}`, tenantId, orderId: String(order.id), direction: order.direction, orderAmount: exact(amount * 1000000n), currency: 'CNY', succeededAt: order.completedAt, deductedAt: '—', policy: null, fee: null, beforeBalance: '—', afterBalance: '—', status: '待计费' });
        return { applied: false, pending: true, reason: '待平台设置费率' };
      }
      const after = wallet.balance - fee;
      const entry = { id: `SF-${String(charges.size + 1).padStart(6, '0')}`, tenantId, orderId: String(order.id), direction: order.direction, orderAmount: exact(amount * 1000000n), currency: 'CNY', sequence: wallet.revision + 1, succeededAt: order.completedAt, deductedAt: deductedAt || order.completedAt, policy: clone(policy), fee: exact(fee), beforeBalance: exact(wallet.balance), afterBalance: exact(after), status: '已扣费' };
      charges.set(key, entry); pending.delete(key); wallet.balance = after; wallet.revision++;
      return { applied: true, entry: clone(entry) };
    }
    function adjustmentPreview(tenantId, input) {
      const w = ensure(tenantId);
      if (w.status === '关闭') throw new Error('关闭租户只允许查看钱包');
      if (!['increase','decrease'].includes(input.direction)) throw new Error('请选择调增或调减');
      if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(String(input.amount ?? '').trim())) throw new Error('金额最多12位整数及2位小数');
      const amount = parse(input.amount, 2) * 1000000n;
      if (amount === 0n) throw new Error('调整金额必须大于0');
      const reason = String(input.reason || '').trim(), operator = String(input.operator || '').trim();
      if (!reason || reason.length > 200) throw new Error('请填写200字以内的调整原因');
      if (!operator || operator.length > 100) throw new Error('操作人不能为空');
      const delta = input.direction === 'increase' ? amount : -amount;
      const after = w.balance + delta;
      if (delta < 0n && after < 0n && !w.allowNegative) throw new Error('未开启允许负余额，不能调减为负数');
      return { amount: exact(amount), change: exact(delta), beforeBalance: exact(w.balance), afterBalance: exact(after), reason, operator, revision: w.revision };
    }
    function feeFacts(tenantId, month) {
      ensure(tenantId);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('请选择有效月份');
      const entries = clone([...charges.values()].filter(e => e.tenantId === tenantId && e.succeededAt.slice(0,7) === month).sort((a,b) => b.deductedAt.localeCompare(a.deductedAt) || b.id.localeCompare(a.id)));
      const ids = new Set(entries.map(e => e.orderId));
      const knownPending = [...pending.values()].filter(e => e.tenantId === tenantId && e.succeededAt.slice(0,7) === month).map(e => ({id:e.orderId,tenantId,direction:e.direction,status:'成功',amount:e.orderAmount,completedAt:e.succeededAt}));
      const missingIds = new Set(knownPending.map(o => o.id));
      const missing = knownPending.concat((owner.__HSTenantSettlements?.sourceOrders() || []).filter(o => o.tenantId === tenantId && o.status === '成功' && ['代收','代付'].includes(o.direction) && o.completedAt.slice(0,7) === month && !ids.has(o.id) && !missingIds.has(o.id)));
      return { entries, missing };
    }
    const model = {
      wallet(tenantId) { const w = ensure(tenantId); return { tenantId, currency: 'CNY', balance: exact(w.balance), allowNegative: w.allowNegative, status: w.status, profileInitialized: w.profileInitialized, revision: w.revision }; },
      setAllowNegative(tenantId, allowed) { if (typeof allowed !== 'boolean') throw new Error('请选择有效的负余额设置'); ensure(tenantId).allowNegative = allowed; },
      syncTenantProfile(tenant) { const w = ensure(tenant.id); w.status = String(tenant.status || '正常'); w.profileInitialized = true; },
      canAccept(tenantId, order = {}) {
        const w = ensure(tenantId);
        if (w.status !== '正常') return { allowed: false, reason: `租户${w.status}，不接受新订单` };
        const directional = ['代收','代付'].includes(order.direction), policies = owner.__HSProviderDemo.tenantBilling(tenantId);
        if (directional ? policyFor(tenantId,order.direction).value === '' : [policies.collection,policies.payout].every(p=>p.value === '')) return { allowed: false, reason: '平台尚未设置业务费率，新订单已拦截' };
        if (w.allowNegative) return { allowed: true, reason: '允许负余额，可继续接收新订单' };
        let required = null;
        if (directional && order.amount !== undefined) required = quote(order.amount, policyFor(tenantId, order.direction));
        if (w.balance < 0n || (required !== null ? w.balance < required : w.balance === 0n)) return { allowed: false, reason: '钱包余额不足，新订单已拦截；在途订单继续处理' };
        return { allowed: true, reason: '钱包余额充足，可接收新订单' };
      },
      recordSuccess(order) { return post(order, policyFor(order.tenantId, order.direction), owner.__HSProviderDemo.now()); },
      pendingEntries(tenantId, month = '') { ensure(tenantId); return clone([...pending.values()].filter(e=>e.tenantId===tenantId && (!month || e.succeededAt.slice(0,7)===month))); },
      entries(tenantId, month = '') {
        ensure(tenantId);
        return clone([...charges.values()].filter(e => e.tenantId === tenantId && (!month || e.succeededAt.slice(0, 7) === month)).sort((a,b) => b.deductedAt.localeCompare(a.deductedAt) || b.id.localeCompare(a.id)));
      },
      previewAdjustment(tenantId, input) { return adjustmentPreview(tenantId, input); },
      adjust(tenantId, input) {
        const w = ensure(tenantId), requestId = String(input.requestId || '');
        if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) throw new Error('调整请求无效，请重新打开弹窗');
        const key = tenantId + ':' + requestId, prior = adjustments.get(key);
        if (prior) {
          if (prior.direction !== input.direction || parse(prior.amount,2) !== parse(input.amount,2) || prior.reason !== String(input.reason || '').trim() || prior.operator !== String(input.operator || '').trim()) throw new Error('调整请求内容冲突');
          return { applied: false, duplicate: true, entry: clone(prior) };
        }
        const preview = adjustmentPreview(tenantId, input);
        if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== w.revision) throw new Error('钱包余额已变化，请重新打开调整弹窗');
        const entry = { ...preview, id: 'AJ-' + String(adjustments.size + 1).padStart(6,'0'), tenantId, requestId, direction: input.direction, type: input.direction === 'increase' ? '人工调增' : '人工调减', sequence: w.revision + 1, currency: 'CNY', occurredAt: owner.__HSProviderDemo.now(), status: '已入账' };
        w.balance += parse(preview.amount) * (input.direction === 'increase' ? 1n : -1n); w.revision++;
        adjustments.set(key, entry);
        return { applied: true, entry: clone(entry) };
      },
      ledger(tenantId) {
        ensure(tenantId);
        const fees = this.entries(tenantId).map(e => ({...e, type:'系统费', change: e.fee === '0.00' ? '0.00' : '-' + e.fee, occurredAt: e.deductedAt, operator:'系统', reason:''}));
        return clone(fees.concat([...adjustments.values()].filter(e => e.tenantId === tenantId)).sort((a,b)=>b.sequence - a.sequence));
      },
      queryLedger(tenantId, filters = {}) {
        const keyword = String(filters.keyword || '').trim().toLowerCase(), type = filters.type || 'all';
        if (!['all','collect','payout','increase','decrease'].includes(type)) throw new Error('请选择有效的流水类型');
        const from = filters.from || '', to = filters.to || '';
        for (const date of [from,to].filter(Boolean)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) throw new Error('请选择有效的记录日期');
        }
        if (from && to && from > to) throw new Error('开始日期不能晚于结束日期');
        const entries = this.pendingEntries(tenantId).map(e => ({...e,type:'系统费',change:null,operator:'系统',reason:'',occurredAt:''})).concat(this.ledger(tenantId));
        return entries.filter(e => {
          const recordType = e.type === '系统费' ? (e.direction === '代收' ? 'collect' : 'payout') : e.direction;
          const date = (e.occurredAt || e.succeededAt || '').slice(0,10);
          return (type === 'all' || type === recordType) && (!keyword || [e.id,e.orderId].some(value => String(value || '').toLowerCase().includes(keyword))) && (!from || date >= from) && (!to || date <= to);
        });
      },
      daily(tenantId, month, filters = {}) {
        let { entries, missing } = feeFacts(tenantId, month);
        const from = filters.from || '', to = filters.to || '';
        for (const date of [from,to].filter(Boolean)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) throw new Error('请选择有效的统计日期');
          if (date.slice(0,7) !== month) throw new Error('请选择统计月份内的日期');
        }
        if (from && to && from > to) throw new Error('开始日期不能晚于结束日期');
        const saved = owner.__HSTenantSettlements?.find(tenantId, month);
        if (saved?.entries && filters.source !== 'live') { entries = saved.entries; missing = []; }
        const empty = () => ({ count:0, amount:0n, fee:0n, pendingCount:0 });
        const group = () => ({ collection:empty(), payout:empty() });
        const days = new Map(), totals = group();
        const facts = entries.concat(missing.map(o => ({direction:o.direction,succeededAt:o.completedAt,orderAmount:o.amount,fee:null})));
        for (const e of facts) {
          const date = e.succeededAt.slice(0,10), key = e.direction === '代收' ? 'collection' : 'payout';
          if ((from && date < from) || (to && date > to)) continue;
          if (!days.has(date)) days.set(date,group());
          for (const target of [days.get(date)[key],totals[key]]) {
            target.count++;
            target.amount += parse(e.orderAmount,2) * 1000000n;
            if (e.fee === null) target.pendingCount++; else target.fee += parse(e.fee);
          }
        }
        const present = value => ({count:value.count,amount:exact(value.amount),exactFee:exact(value.fee),pendingCount:value.pendingCount});
        const row = value => ({collection:present(value.collection),payout:present(value.payout),exactTotal:exact(value.collection.fee+value.payout.fee),pendingCount:value.collection.pendingCount+value.payout.pendingCount});
        return { month, rows:[...days].sort(([a],[b])=>b.localeCompare(a)).map(([date,value])=>({date,...row(value)})), totals:row(totals) };
      },
      reconcile(tenantId, month) {
        const { entries, missing } = feeFacts(tenantId, month);
        const lines = ['代收','代付'].map(direction => {
          const list = entries.filter(e => e.direction === direction), pending = missing.filter(o => o.direction === direction);
          const amount = list.reduce((n,e) => n + parse(e.orderAmount,2) * 1000000n,0n) + pending.reduce((n,o) => n + parse(o.amount,2) * 1000000n,0n);
          const fee = list.reduce((n,e) => n + parse(e.fee),0n);
          return { direction, count: list.length + pending.length, postedCount: list.length, pendingCount: pending.length, amount: exact(amount), exactFee: exact(fee), fee: pending.length ? null : rounded(fee), policy: clone(policyFor(tenantId,direction)), formula: '逐单按扣费时的费率快照汇总' };
        });
        return { lines, exactTotal: exact(lines.reduce((n,l)=>n+parse(l.exactFee),0n)), count: lines.reduce((n,l) => n+l.count,0), amount: exact(lines.reduce((n,l) => n+parse(l.amount),0n)), total: lines.some(l=>l.fee===null) ? null : exact(lines.reduce((n,l) => n+parse(l.fee),0n)), entries, pendingCount: missing.length };
      }
    };
    owner.__HSFeeWallets = model;
    // Historical demonstration charges reference actual successful seed orders. Current fee settings stay unchanged.
    for (const order of [...(owner.__HSTenantSettlements?.sourceOrders() || [])].sort((a,b)=>a.completedAt.localeCompare(b.completedAt))) {
      if (order.tenantId === 'HS-TEN-001' && order.status === '成功' && ['代收','代付'].includes(order.direction)) post(order, { mode: order.direction === '代收' ? 'percentage' : 'perTransaction', value: order.direction === '代收' ? '0.4501' : '2.00' });
    }
  }
  window.HSFeeWallets = owner.__HSFeeWallets;
})();
