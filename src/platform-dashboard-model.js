/* Virtual CNY dashboard facts only. No order, wallet or billing mutation. */
(function (root) {
  'use strict';
  const directions = ['代收', '代付'];
  const fixtureTenants = ['HS-TEN-001', 'HS-TEN-018', 'HS-TEN-029', 'HS-TEN-044'];
  // Only the connected providers' CNY capabilities; never relabel a USDT capability.
  const fixtureRoutes = [
    ['V-001', '代收', 1680, 1600, 1568, 134825],
    ['V-002', '代收', 1270, 1230, 1191, 98650],
    ['V-001', '代付', 1120, 1060, 1010, 112400],
    ['V-003', '代付', 860, 820, 792, 149800],
    ['V-004', '代付', 740, 710, 689, 168500]
  ];
  function createFacts(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('无效统计日期');
    return fixtureTenants.flatMap((tenantId, index) => fixtureRoutes.map(([providerId, direction, count, terminal, success, averageMinor], route) => {
      const scale = [1, .72, .46, .28][index];
      const successCount = Math.floor(success * scale);
      return { date, tenantId, providerId, currency: 'CNY', direction,
        orderCount: Math.floor(count * scale), terminalCount: Math.floor(terminal * scale),
        successCount, successAmountMinor: successCount * (averageMinor + index * 1250 + route * 375) };
    }));
  }
  function blank() { return { orderCount: 0, terminalCount: 0, successCount: 0, successAmountMinor: 0, successRate: null }; }
  function sum(rows) {
    const result = blank();
    for (const row of rows) for (const key of ['orderCount', 'terminalCount', 'successCount', 'successAmountMinor']) result[key] += row[key];
    result.successRate = result.terminalCount ? result.successCount / result.terminalCount : null;
    return result;
  }
  function metrics(rows) {
    return { collection: sum(rows.filter(row => row.direction === '代收')), payout: sum(rows.filter(row => row.direction === '代付')), total: sum(rows) };
  }
  function summarize({ date, cutoffAt, facts, tenants = [], providers = [], scope }) {
    const all = scope?.scopeCode === 'platform.all_tenants';
    const allowed = new Set(scope?.scopeCode === 'platform.assigned_tenants' ? (scope.tenantIds || []).map(String) : []);
    const visibleTenants = tenants.filter(tenant => all || allowed.has(tenant.id));
    const tenantIds = new Set(visibleTenants.map(tenant => tenant.id));
    const connected = providers.filter(provider => provider.adapterStatus === '已接入');
    const providerIds = new Set(connected.map(provider => provider.id));
    const rows = (facts || []).filter(row => row.date === date && row.currency === 'CNY' && directions.includes(row.direction)
      && tenantIds.has(row.tenantId) && providerIds.has(row.providerId));
    const group = (items, key) => items.map(item => ({ id: item.id, name: item.name, ...metrics(rows.filter(row => row[key] === item.id)) }))
      .sort((a, b) => b.total.successAmountMinor - a.total.successAmountMinor || a.id.localeCompare(b.id));
    return { date, cutoffAt, currency: 'CNY', allTenants: all, tenantCount: visibleTenants.length,
      ...metrics(rows), providers: tenantIds.size ? group(connected, 'providerId') : [], tenants: group(visibleTenants, 'tenantId') };
  }
  const money = metric => (metric.successAmountMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rate = metric => metric.successRate === null ? '—' : `${(metric.successRate * 100).toFixed(2)}%`;
  function exportRows(view) {
    const fieldSnapshot = ['统计日期（UTC+8）', '统计层级', '对象编号', '对象名称', '业务', '币种', '成交金额', '订单数', '已结束订单数', '成功订单数', '成功率', '数据截止（UTC+8）'];
    const rowSnapshot = [];
    const append = (level, entity) => {
      for (const [key, name] of [['collection', '代收'], ['payout', '代付'], ['total', '合计']]) {
        const m = entity[key];
        rowSnapshot.push([view.date, level, entity.id, entity.name, name, 'CNY', money(m), String(m.orderCount), String(m.terminalCount), String(m.successCount), rate(m), view.cutoffAt]);
      }
    };
    append('总览', { id: view.allTenants ? 'PLATFORM' : 'AUTHORIZED_SCOPE', name: view.allTenants ? '全平台' : '授权范围', ...view });
    view.providers.forEach(entity => append('通道商', entity));
    view.tenants.forEach(entity => append('租户', entity));
    return { fieldSnapshot, rowSnapshot };
  }
  root.HSPlatformDashboard = Object.freeze({ createFacts, summarize, exportRows, money, rate });
})(typeof window === 'undefined' ? globalThis : window);
