// Single tenant system-fee wallet for the local review Demo. No real funds or network.
(() => {
  let owner = window;
  try { if (window.top.document) owner = window.top; } catch (_) {}
  if (!owner.__HSFeeWallets) {
    const scale = 100000000n, wallets = new Map(), charges = new Map(), pending = new Map(), adjustments = new Map();
    const openingRecharge = {
      tenantId: 'HS-TEN-001',
      orderNo: 'SFRC-20260714-0001',
      amount: '1000.00',
      paymentCurrency: 'USDT',
      status: '已完成',
      tone: 'green',
      createdAt: '2026-07-14 09:00:00',
      creditedAt: '2026-07-14 09:03:12'
    };
    const systemFeeRechargeOrderFixtures = [
      { tenantId: 'HS-TEN-001', orderNo: 'SFRC-20261121-0003', amount: '1000.00', paymentCurrency: 'USDT', status: '待支付', tone: 'orange', createdAt: '2026-11-21 10:24:30' },
      { tenantId: 'HS-TEN-001', orderNo: 'SFRC-20261121-0002', amount: '2500.00', paymentCurrency: 'USDT', status: '处理中', tone: 'blue', createdAt: '2026-11-21 10:16:08' },
      { tenantId: 'HS-TEN-001', orderNo: 'SFRC-20261120-0001', amount: '500.00', paymentCurrency: 'USDT', status: '已关闭', tone: 'gray', createdAt: '2026-11-20 18:32:19', closeReason: '支付超时' },
      openingRecharge
    ];
    const rechargeOrdersStorageKey = 'hs.demo.system-fee-recharge-orders';
    let createdRechargeOrders = [], savedRechargeActions = [];
    const rechargeActions = new Map(), rechargeCredits = new Map();
    try {
      const saved = JSON.parse(owner.sessionStorage.getItem(rechargeOrdersStorageKey));
      if (Array.isArray(saved)) createdRechargeOrders = saved;
      if (Array.isArray(saved?.orders)) createdRechargeOrders = saved.orders;
      if (Array.isArray(saved?.actions)) savedRechargeActions = saved.actions;
    } catch (_) {}
    function saveRechargeState() {
      try {
        owner.sessionStorage.setItem(rechargeOrdersStorageKey, JSON.stringify({
          orders: createdRechargeOrders, actions: [...rechargeActions.values()]
        }));
      } catch (_) {}
    }
    const clone = value => JSON.parse(JSON.stringify(value));
    const parse = (value, precision = 8) => {
      const text = String(value ?? '').trim();
      if (!new RegExp('^\\d+(?:\\.\\d{1,' + precision + '})?$').test(text)) throw new Error('请输入有效的非负金额或费率');
      const [whole, fraction = ''] = text.split('.');
      return BigInt(whole + fraction.padEnd(precision, '0'));
    };
    const parseCny = value => parse(value, 2) * (scale / 100n);
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
      if (!wallets.has(tenantId)) wallets.set(tenantId, { balance: tenantId === openingRecharge.tenantId ? parseCny(openingRecharge.amount) : 0n, allowNegative: false, status: ({'HS-TEN-018':'审核中','HS-TEN-029':'停用','HS-TEN-061':'关闭'})[tenantId] || '正常', profileInitialized: false, revision: 0 });
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
    function liveFeeFacts(tenantId, includesDate) {
      ensure(tenantId);
      const entries = clone([...charges.values()].filter(e => e.tenantId === tenantId && includesDate(e.succeededAt.slice(0,10))).sort((a,b) => b.deductedAt.localeCompare(a.deductedAt) || b.id.localeCompare(a.id)));
      const knownPending = [...pending.values()].filter(e => e.tenantId === tenantId && includesDate(e.succeededAt.slice(0,10))).map(e => ({id:e.orderId,tenantId,direction:e.direction,status:'成功',amount:e.orderAmount,completedAt:e.succeededAt}));
      const missing = knownPending.concat((owner.__HSTenantSettlements?.sourceOrders() || []).filter(order => {
        if (order.tenantId !== tenantId || order.status !== '成功' || !['代收','代付'].includes(order.direction)) return false;
        const key = `${tenantId}:${order.id}`;
        // Existing wallet snapshots set the success date even if the order feed later changes it.
        return !charges.has(key) && !pending.has(key) && includesDate(order.completedAt.slice(0,10));
      }));
      return { entries, missing };
    }
    function feeFacts(tenantId, month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('请选择有效月份');
      return liveFeeFacts(tenantId, date => date.slice(0,7) === month);
    }
    function validCalendarDate(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const parsed = new Date(date + 'T00:00:00Z');
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === date;
    }
    function emptyFeeStats() {
      const direction = () => ({ count:0, amount:0n, fee:0n, pendingCount:0 });
      return { collection:direction(), payout:direction() };
    }
    function addFeeStat(stats, entry) {
      const total = stats[entry.direction === '代收' ? 'collection' : 'payout'];
      total.count++;
      total.amount += parse(entry.orderAmount,2) * 1000000n;
      if (entry.fee === null) total.pendingCount++;
      else total.fee += parse(entry.fee);
    }
    function presentFeeStats(stats) {
      const present = value => ({ count:value.count, amount:exact(value.amount), exactFee:exact(value.fee), pendingCount:value.pendingCount });
      return {
        collection:present(stats.collection), payout:present(stats.payout),
        exactTotal:exact(stats.collection.fee + stats.payout.fee),
        pendingCount:stats.collection.pendingCount + stats.payout.pendingCount
      };
    }
    function rechargeStatus(order) {
      const action = rechargeActions.get(order.orderNo);
      if (!action || action.tenantId !== order.tenantId) return order;
      if (action.kind === 'cancel') return { ...order, status: '已取消', tone: 'gray', closeReason: action.reason };
      return { ...order, status: '已完成', tone: 'green', creditedAt: action.occurredAt, closeReason: '' };
    }

    function applyRechargeAction(tenantId, orderNo, input, occurredAt) {
      const order = [...createdRechargeOrders, ...systemFeeRechargeOrderFixtures].find(item => item?.tenantId === tenantId && item.orderNo === orderNo);
      const { kind } = input;
      const reason = String(input.reason || '').trim();
      const proof = String(input.proof || '').trim();
      const operator = String(input.operator || '').trim();
      if (!order || rechargeActions.has(orderNo)) throw new Error('订单不存在或已处理，请刷新列表');
      if (!reason || !operator) throw new Error('请填写处理原因');
      const wallet = ensure(tenantId);
      if (wallet.status === '关闭') throw new Error('该租户已关闭');
      const operation = { tenantId, orderNo, kind, reason, operator, occurredAt };
      if (kind === 'cancel') {
        if (order.status !== '待支付') throw new Error('仅待支付订单可取消');
      } else if (kind === 'credit') {
        if (!['待支付', '处理中', '已关闭'].includes(order.status)) throw new Error('当前订单状态无法确认到账');
        if (!proof) throw new Error('请填写蓝盛交易号或收款凭证编号');
        if ([...rechargeActions.values()].some(action => action.proof?.toLowerCase() === proof.toLowerCase())) throw new Error('该收款凭证已关联其他充值订单');
        const amount = parseCny(order.amount);
        const afterBalance = wallet.balance + amount;
        rechargeCredits.set(orderNo, {
          id: 'SFR-' + orderNo.slice(5), tenantId, orderId: orderNo, orderAmount: order.amount,
          type: '充值到账', direction: 'recharge', currency: 'CNY', change: order.amount,
          beforeBalance: exact(wallet.balance), afterBalance: exact(afterBalance), occurredAt,
          operator, reason, status: '已入账', sequence: wallet.revision + 1
        });
        wallet.balance = afterBalance;
        wallet.revision++;
        operation.proof = proof;
      } else {
        throw new Error('处理方式无效');
      }
      rechargeActions.set(orderNo, operation);
      return rechargeStatus(order);
    }

    // Quoted CNY, VND or USDT per USDT. Sources are local Demo fixtures.
    const quoteSources = {
      CNY: { '欧易（OKX）': '7.1523', '币安（Binance）': '7.1498' },
      VND: { 'XE 汇率网': '26150.00', 'Wise 汇率': '26148.50' },
      USDT: { 'USDT 固定汇率': '1.0000' }
    };
    const rateSettingsKey = 'hs.demo.recharge-rate-settings';
    let rateSettings = {
      CNY: { source: '欧易（OKX）', floating: '0.1430' },
      VND: { source: 'XE 汇率网', floating: '523.00' }
    };
    function currencyQuote(currency, source, floating) {
      const base = quoteSources[currency]?.[source];
      if (typeof base !== 'string') throw new Error('报价不可用，请选择有效的汇率来源');
      const digits = currency === 'VND' ? 2 : 4;
      const units = parse(floating, digits);
      const divisor = 10n ** BigInt(digits);
      const format = value => String(value / divisor) + '.' + String(value % divisor).padStart(digits, '0');
      return { currency, source, base, floating: format(units), effective: format(parse(base, digits) + units) };
    }
    try {
      const saved = JSON.parse(owner.sessionStorage.getItem(rateSettingsKey));
      for (const currency of Object.keys(quoteSources)) {
        if (saved?.[currency]) rateSettings[currency] = currencyQuote(currency, saved[currency].source, saved[currency].floating);
      }
    } catch (_) {}
    function saveRate(currency, source, floating) {
      const row = currencyQuote(currency, source, floating);
      rateSettings[currency] = { source, floating: row.floating };
      try { owner.sessionStorage.setItem(rateSettingsKey, JSON.stringify(rateSettings)); } catch (_) {}
    }
    function rechargeQuote(amount, rate) {
      // Preserve the cashier's upward rounding to USDT cents.
      const denominator = parse(rate);
      const numerator = parse(amount, 2) * scale;
      const cents = (numerator + denominator - 1n) / denominator;
      return { exchangeRate: rate, receivable: exact(cents * (scale / 100n)) };
    }
    // Offline stand-in for the provider's per-order URL. One document URL per Demo session.
    let demoCashierBase;
    function rechargeCashierUrl(order) {
      if (order.cashierUrl) return order.cashierUrl;
      if (!demoCashierBase) {
        const template = owner.document?.getElementById?.('demo-recharge-cashier');
        if (!template) return null;
        demoCashierBase = owner.URL.createObjectURL(new owner.Blob([JSON.parse(template.textContent)], { type: 'text/html;charset=utf-8' }));
      }
      return demoCashierBase + '#order=' + encodeURIComponent(order.orderNo) + '&amount=' + encodeURIComponent(order.receivable);
    }
    const model = {
      rateSources() { return clone(quoteSources); },
      configuredRates() {
        return Object.entries(rateSettings).map(([currency, row]) => currencyQuote(currency, row.source, row.floating));
      },
      previewRate: currencyQuote,
      saveRate,
      rechargePayment(tenantId, orderNo) {
        const order = this.rechargeOrders(tenantId).find(item => item.orderNo === orderNo && item.status === '待支付');
        if (!order) return null;
        return {
          amount: order.receivable,
          cashierUrl: rechargeCashierUrl(order),
          rate: order.exchangeRate
        };
      },
      rechargeOrders(tenantId) {
        return clone([...createdRechargeOrders, ...systemFeeRechargeOrderFixtures].filter(order => order?.tenantId === tenantId).map(order => {
          // Orders created before configurable quotes used the fixed 7.20 rate.
          const snapshot = order.exchangeRate ? order : { ...order, ...rechargeQuote(order.amount, '7.20') };
          return rechargeStatus(snapshot);
        }));
      },
      createRechargeOrder(tenantId, amount) {
        if (ensure(tenantId).status !== '正常') throw new Error('当前租户状态无法发起充值');
        const cny = parseCny(amount);
        if (cny <= 0n) throw new Error('充值金额必须大于 0');
        const createdAt = owner.__HSProviderDemo.now();
        const date = createdAt.slice(0, 10).replaceAll('-', '');
        const sequence = String(systemFeeRechargeOrderFixtures.length + createdRechargeOrders.length + 1).padStart(4, '0');
        const order = {
          tenantId,
          orderNo: `SFRC-${date}-${sequence}`,
          amount: exact(cny),
          ...rechargeQuote(exact(cny), currencyQuote('CNY', rateSettings.CNY.source, rateSettings.CNY.floating).effective),
          paymentCurrency: 'USDT',
          status: '待支付',
          tone: 'orange',
          createdAt
        };
        createdRechargeOrders.unshift(order);
        saveRechargeState();
        return { ...clone(order), cashierUrl: rechargeCashierUrl(order) };
      },
      resolveRechargeOrder(tenantId, orderNo, input) {
        const order = applyRechargeAction(tenantId, orderNo, input, owner.__HSProviderDemo.now());
        saveRechargeState();
        return clone(order);
      },
      rechargeAudit(tenantId) {
        return clone([...rechargeActions.values()].reverse().filter(action => action.tenantId === tenantId));
      },
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
        const entries = fees.concat([...adjustments.values(), ...rechargeCredits.values()].filter(e => e.tenantId === tenantId));
        if (tenantId === openingRecharge.tenantId) {
          entries.push({
            id: 'SFR-000001', tenantId, orderId: openingRecharge.orderNo, orderAmount: openingRecharge.amount,
            type: '充值到账', direction: 'recharge', currency: 'CNY', change: openingRecharge.amount,
            beforeBalance: '0.00', afterBalance: openingRecharge.amount, occurredAt: openingRecharge.creditedAt,
            operator: '系统', status: '已入账', sequence: 0
          });
        }
        return clone(entries.sort((a,b)=>b.sequence - a.sequence));
      },
      queryLedger(tenantId, filters = {}) {
        const keyword = String(filters.keyword || '').trim().toLowerCase(), type = filters.type || 'all';
        if (!['all','collect','payout','increase','decrease','recharge'].includes(type)) throw new Error('请选择有效的流水类型');
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
      statisticsForRange(tenantId, from, to) {
        if (!validCalendarDate(from) || !validCalendarDate(to)) throw new Error('请选择统计开始和结束日期');
        if (from > to) throw new Error('统计开始日期不能晚于结束日期');
        const { entries, missing } = liveFeeFacts(tenantId, date => date >= from && date <= to);
        const totals = emptyFeeStats();
        for (const entry of entries) addFeeStat(totals, entry);
        for (const order of missing) {
          if (order.currency && order.currency !== 'CNY') continue;
          addFeeStat(totals, { direction: order.direction, orderAmount: order.amount, fee: null });
        }
        return presentFeeStats(totals);
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
        const days = new Map(), totals = emptyFeeStats();
        const facts = entries.concat(missing.map(o => ({direction:o.direction,succeededAt:o.completedAt,orderAmount:o.amount,fee:null})));
        for (const entry of facts) {
          const date = entry.succeededAt.slice(0,10);
          if ((from && date < from) || (to && date > to)) continue;
          if (!days.has(date)) days.set(date,emptyFeeStats());
          addFeeStat(days.get(date), entry);
          addFeeStat(totals, entry);
        }
        return { month, rows:[...days].sort(([a],[b])=>b.localeCompare(a)).map(([date,value])=>({date,...presentFeeStats(value)})), totals:presentFeeStats(totals) };
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
    for (const action of savedRechargeActions) {
      try { applyRechargeAction(action.tenantId, action.orderNo, action, action.occurredAt); } catch (_) {}
    }
  }
  window.HSFeeWallets = owner.__HSFeeWallets;
})();
