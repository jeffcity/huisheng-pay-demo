// 模块注册表：41 个模块 → 14 个业务源文件 + 1 个内联鉴权守卫 + hash 路由。
import modules from './legacy/modules.json';

export const MODULES = modules;

// 统一壳侧边导航（与旧壳 platform-nav 分组一致）
export const NAV_GROUPS = [
  { title: '首页', items: [
    { module: 'home', label: '首页数据看板' },
  ]},
  { title: '租户管理', items: [
    { module: 'tenant-list', label: '租户管理' },
  ]},
  { title: '通道商授权', items: [
    { module: 'business', label: '通道商授权' },
  ]},
  { title: '财务模块', items: [
    { module: 'wallets', label: '租户结算单' },
  ]},
  { title: '通道商管理', items: [
    { module: 'channel-vendors', label: '通道商管理' },
  ]},
  { title: '报表模块', subgroups: [
    { title: '日终', items: [
      { module: 'payout-channel-daily', label: '代付通道日终统计', level: 3 },
      { module: 'collect-channel-daily', label: '代收通道日终统计', level: 3 },
      { module: 'merchant-collect-daily', label: '商户代收日终统计', level: 3 },
      { module: 'merchant-payout-daily', label: '商户代付日终统计', level: 3 },
      { module: 'platform-collect-daily', label: '平台代收日终统计', level: 3 },
      { module: 'platform-payout-daily', label: '平台代付日终统计', level: 3 },
    ]},
    { title: '账户记录', items: [
      { module: 'channel-pay-change', label: '通道代收流水记录', level: 3 },
      { module: 'channel-payout-change', label: '通道代付流水记录', level: 3 },
      { module: 'merchant-collect-change', label: '商户代收流水记录', level: 3 },
      { module: 'merchant-payout-change', label: '商户代付流水记录', level: 3 },
      { module: 'merchant-payout-prepay-change', label: '商户代付预付记录', level: 3 },
      { module: 'merchant-collect-prepay-change', label: '商户代收预付记录', level: 3 },
    ]},
  ], items: []},
  { title: '审计模块', items: [
    { module: 'orders', label: '全局订单查询' },
    { module: 'audit', label: '审计日志' },
  ]},
  { title: '协同运营', items: [
    { module: 'notifications', label: '平台通知中心' },
  ]},
  { title: '系统管理', items: [
    { module: 'system-accounts', label: '系统管理控制台' },
  ]},
  { title: '账号登录（流程示意）', items: [
    { module: 'login-form', label: '平台账号登录' },
    { module: 'login-bind', label: '绑定 Google 2FA' },
    { module: 'login-exception', label: '登录异常提示' },
  ]},
];

export const ALL_NAV_MODULES = NAV_GROUPS.flatMap(group => [
  ...(group.items || []),
  ...(group.subgroups || []).flatMap(sub => sub.items),
]);
