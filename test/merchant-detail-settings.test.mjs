import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/merchants.html', import.meta.url), 'utf8');
const providerSource = fs.readFileSync(new URL('../src/provider-model.js', import.meta.url), 'utf8');
const names = ['merchantWhitelist','businessMerchantCapability','businessWhitelistAllowed','renderBusinessWhitelist','renderMerchantCapabilitySwitch', 'capabilityChangeAllowed', 'returnFromCapabilityChange', 'applyCapabilityChange', 'merchantDirectionAccessFields', 'renderMerchantIpRow', 'renderMerchantIpEditor', 'merchantIpInputValue', 'preparePayoutSettingsConfirm', 'returnToPayoutSettings', 'openPayoutSettingsConfirm', 'renderSecuritySetting', 'renderBusinessCallbackIps', 'saveMerchantCallbackIps', 'merchantPayoutProducts', 'merchantBoundChannels', 'merchantRatePercent', 'renderMerchantPayoutRates', 'normalizeMerchantPayoutRate', 'payoutRateContextAllowed', 'bindMerchantPayoutRates', 'openMerchantPayoutRateConfirm', 'merchantCallbackIps', 'merchantStatusOffLabel', 'merchantSingleFeeValue', 'normalizedMerchantSingleFee', 'renderMerchantSwitch', 'renderCallbackIpField', 'renderCollectConfig', 'renderPayoutConfig', 'renderCommonConfig', 'renderLoginWhitelist', 'renderDirectionAccess', 'renderIntegrationValue', 'merchantIntegrationKey', 'createMerchantDemoKey', 'ensureAdminSecurity', 'renderMerchantMfaField', 'verifyMerchantMfa', 'applyAccessChange', 'validateLoginWhitelist', 'loginWhitelistIdentity', 'isForbiddenIpv4', 'expandIpv6', 'isPublicIpEntry', 'saveMerchantBusinessConfig'];
const functions = names.map(name => {
  const start = source.indexOf(`    function ${name}(`);
  assert(start >= 0, name);
  const end = source.indexOf('\n    function ', start + 1);
  return source.slice(start, end);
}).join('\n');

function fixture() {
  const elements = new Map(), timers = [], errors = [], loginChanges = [];
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, disabled: false, textContent: '', handlers: {}, dataset: {}, focus() {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
    return elements.get(id);
  };
  const window = { document: {} }; window.top = window;
  const context = vm.createContext({
    window, merchantCapabilityOptions: ['法币代收', '法币代付'], renderRows() {}, closeModal() {}, activeSecurityTab: 'access', activePayoutTab: 'settings', activeModalTab: '代付配置', showModal() {}, bindModalEvents() {},
    document: { getElementById: el, querySelector: el, querySelectorAll(selector) {
      const match = selector.match(/^\[data-ip-entry="([^"]+)"\]$/);
      return match ? [el(match[1]), ...[...elements].filter(([id]) => id.startsWith(match[1] + '-')).map(([, value]) => value)] : [];
    } },
    crypto: webcrypto,
    openLoginWhitelistConfirm(item, next) { loginChanges.push({ item, next }); },
    setTimeout(fn) { timers.push(fn); },
    clearInlineError() { errors.length = 0; },
    showInlineError(message, id) { errors.push({ message, id }); },
    currentTenantOperator: { account: 'tenant-operator', google2fa: '123456' },
    whitelistEntries(value) { return value.split(/[,\n]/).map(x => x.trim()).filter(Boolean); },
    nowText() { return '2026-10-19'; }, renderDetailModal() {}, showToast() {}, openAccessResult() {},
    escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'); },
    walletRow() { return ['CNY', '代付钱包', '100.00', '10.00', '90.00']; },
    section(title, body) { return `<section><h3>${title}</h3>${body}</section>`; },
    productRows() { return ''; }, tag(value) { return `<span>${value}</span>`; },
    ensureMerchantLoginDomain() { return { loginDomain: 'merchant.demo.example', loginDomainStatus: '可用' }; },
    merchantCallback(item) { return item.callback; }, merchantWhitelist(item) { return item.whitelist; },
    renderWhitelistRow(value) { return `<input data-whitelist-entry value="${value}">`; }
  });
  vm.runInContext(providerSource, context);
  vm.runInContext(functions, context);
  // Mount the rendered inline form and bind its real handler in the DOM fixture.
  context.openMerchantPayoutRates = (item) => {
    const html = context.renderMerchantPayoutRates(item);
    const decode = value => value.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
    el('modal').innerHTML = html;
    el('merchantPayoutRateForm').dataset.rateState = decode(html.match(/data-rate-state="([^"]*)"/)[1]);
    for (const match of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g)) el(match[1]).value = decode(match[2]);
    context.bindMerchantPayoutRates(item);
  };

  const cfg = { status: '开启', singleFee: 'CNY 2.00', manualOrder: '开启', rejectNotice: '关闭', callbackIp: '', orderApi: 'https://demo.example/payout/create', queryApi: 'https://demo.example/payout/query', doc: '代付 API', fees: [] };
  const item = { id: 'MCH-TEST', name: '测试商户', capabilities: ['法币代收', '法币代付'], payoutConfig: cfg, collectConfig: { ...cfg, today: 'CNY 0.00', products: [], orderApi: 'https://demo.example/collect/create', queryApi: 'https://demo.example/collect/query', doc: '代收 API' }, wallets: [['100.00']], logs: [], callback: '', whitelist: '8.8.8.8', ipStatus: '已确认' };
  el('merchantPayoutStatus').checked = true;
  el('merchantPayoutManual').checked = true;
  el('merchantPayoutSingleFee').value = '2.00';
  el('merchantPayoutReason').value = '变更配置';
  context.merchantProfileTenantId = window.HSProviderDemo.tenantId; context.merchants = [item];
  return { api: context, model: window.HSProviderDemo, item, cfg, el, errors, timers, loginChanges, save() { context.saveMerchantBusinessConfig(item, 'payout'); }, confirm(reason = '变更配置', code) { el('merchantPayoutReason').value = reason; if (code !== undefined) el('merchantPayout2fa').value = code; el('payoutSettingsConfirm').handlers.click(); }, commit() { timers.splice(0).forEach(fn => fn()); } };
}

test('单笔费用按整数分格式化，零值与大金额不发生浮点改写', () => {
  const { api } = fixture();
  for (const [value, expected] of [['0', 'CNY 0.00'], ['0002.5', 'CNY 2.50'], ['90071992547409.90', 'CNY 90071992547409.90'], ['70368744177664.01', 'CNY 70368744177664.01'], ['90071992547409.91', 'CNY 90071992547409.91']]) assert.equal(api.normalizedMerchantSingleFee(value), expected);
  for (const value of ['', '-1', 'NaN', 'Infinity', '1e2', '2.001', '90071992547409.92']) assert.equal(api.normalizedMerchantSingleFee(value), null);
});

test('无效金额与错误MFA都不能部分更新开关或费用，验证码会清空', () => {
  for (const fee of ['', '-1', '1.001', '90071992547409.92', '3.25']) {
    const f = fixture(), before = JSON.stringify(f.cfg);
    f.el('merchantPayoutSingleFee').value = fee;
    f.el('merchantPayoutManual').checked = false;
    f.el('merchantPayout2fa').value = '000000';
    f.save(); if (fee === '3.25') f.confirm('变更配置', '000000'); f.commit();
    assert(f.errors.length);
    assert.equal(JSON.stringify(f.cfg), before);
    assert.equal(f.item.logs.length, 0);
    if (fee === '3.25') assert.equal(f.el('merchantPayout2fa').value, '');
  }
});

test('保存单笔费用支持0，保留前后值与原因且不动钱包或其他业务', () => {
  for (const fee of ['0', '3.25', '70368744177664.01']) {
    const f = fixture(), beforeCollect = JSON.stringify(f.item.collectConfig), beforeWallet = JSON.stringify(f.item.wallets);
    f.el('merchantPayoutSingleFee').value = fee;
    f.el('merchantPayout2fa').value = '123456';
    f.save();
    assert.equal(f.cfg.singleFee, 'CNY 2.00', '提交前不修改数据');
    f.confirm('变更配置', '123456'); f.commit();
    assert.equal(f.cfg.singleFee, f.api.normalizedMerchantSingleFee(fee));
    assert.equal(JSON.stringify(f.item.collectConfig), beforeCollect);
    assert.equal(JSON.stringify(f.item.wallets), beforeWallet);
    assert.match(f.item.logs[0][3], /单笔费用 CNY 2\.00/);
    assert.match(f.item.logs[0][3], /变更配置/);
    assert.doesNotMatch(JSON.stringify(f.item.logs), /123456/);
    assert.equal(f.el('merchantPayout2fa').value, '');
    assert.equal(fixture().cfg.singleFee, 'CNY 2.00');
  }
});

test('提交时原因必填，确认期间撤权或配置变化不保存', () => {
  const f = fixture();
  f.el('merchantPayoutSingleFee').value = '3'; f.save();
  f.confirm('', '123456'); assert.match(f.errors[0].message, /原因/);
  assert.equal(f.cfg.singleFee, 'CNY 2.00');
  f.item.capabilities = ['法币代收'];
  f.confirm('变更', '123456'); assert.match(f.errors[0].message, /变化/);
  assert.equal(f.cfg.singleFee, 'CNY 2.00'); assert.equal(f.item.logs.length, 0);
  f.save(); assert.match(f.errors[0].message, /未开通/);
  for (const kind of ['tenant', 'config']) {
    const g = fixture(); g.el('merchantPayoutSingleFee').value = '3'; g.save();
    if(kind === 'tenant') g.model.tenantId = 'HS-TEN-017';
    else g.cfg.manualOrder = '关闭';
    g.confirm('变更', '123456'); assert.match(g.errors[0].message, /变化/);
    assert.equal(g.cfg.singleFee, 'CNY 2.00'); assert.equal(g.item.logs.length, 0);
  }
});

test('开关保留待配置状态，无能力时禁用，单纯启停无需费用MFA', () => {
  const f = fixture();
  f.cfg.status = '待配置';
  f.el('merchantPayoutStatus').checked = false;
  f.el('merchantPayoutManual').checked = false;
  f.save(); assert.doesNotMatch(f.el('modal').innerHTML, /id="merchantPayout2fa"/); f.confirm(); f.commit();
  assert.equal(f.errors.length, 0);
  assert.equal(f.cfg.status, '待配置');
  assert.equal(f.cfg.manualOrder, '关闭');
  f.el('merchantPayoutStatus').checked = true;
  f.save(); assert.doesNotMatch(f.el('modal').innerHTML, /id="merchantPayout2fa"/); f.confirm(); f.commit();
  assert.equal(f.cfg.status, '开启');
  f.el('merchantPayoutStatus').checked = false;
  f.save(); assert.doesNotMatch(f.el('modal').innerHTML, /id="merchantPayout2fa"/); f.confirm(); f.commit();
  assert.equal(f.cfg.status, '暂停');
  const html = f.api.renderMerchantSwitch('test', '代付功能', '未开通', false, '未开通');
  assert.match(html, /role="switch"/);
  assert.match(html, /disabled/);
  assert.match(html, /for="test"/);
  assert.match(html, /aria-describedby="testState"/);
});

test('方向接口在对应配置页，安全配置仅保留共用设置及独立登录白名单', () => {
  const f = fixture(), html = f.api.renderCommonConfig(f.item);
  assert.doesNotMatch(html, /代收对接信息|代付对接信息|access-collect-order|access-payout-order/);
  assert.match(html, /商户后台登录 IP 白名单/);
  assert.doesNotMatch(html,/accessWhitelist|API 请求 IP 白名单/);
  for (const id of ['loginWhitelistInput', 'accessCallback-shared']) assert.equal(html.split(`id="${id}"`).length - 1, 1);
  const collect = f.api.renderCollectConfig(f.item), payout = f.api.renderPayoutConfig(f.item);
  assert.match(collect, /id="access-collect-order"[^>]*>https:\/\/demo\.example\/collect\/create/);
  assert.doesNotMatch(collect, /access-payout-order|账务归属|平台不参与/);
  assert.match(payout, /id="access-payout-order"[^>]*>https:\/\/demo\.example\/payout\/create/);
  assert.doesNotMatch(payout, /access-collect-order|<select|不按商户绑定/);
  assert.doesNotMatch(collect + payout, /id="merchant(?:Collect|Payout)CallbackIp"/);
  assert.match(html, /id="merchantCollectCallbackIp"/);
  assert.match(html, /id="merchantPayoutCallbackIp"/);
});

test('登录白名单不复制API配置，错误格式和重复均不进入确认', () => {
  const f = fixture();
  assert.equal(f.item.loginWhitelist, undefined);
  for (const value of ['999.1.1.1', ',,', '8.8.8.8, 8.8.8.8', '8.8.8.8, 8.8.8.8/32', '8.8.8.8/24, 8.8.8.9/24', '2606:4700::1/64, 2606:4700::2/64']) {
    f.el('loginWhitelistInput').value = value;
    f.api.validateLoginWhitelist(f.item);
    assert(f.errors.length);
    assert.equal(f.loginChanges.length, 0);
    assert.equal(f.item.loginWhitelist, undefined);
    assert.equal(f.item.whitelist, '8.8.8.8');
  }
});

test('登录白名单只提出确认变更，正式保存留待确认弹窗验证', () => {
  const f = fixture();
  f.el('loginWhitelistInput').value = '8.8.8.8';
  f.api.validateLoginWhitelist(f.item);
  assert.equal(f.loginChanges.length, 1);
  assert.equal(f.loginChanges[0].next, '8.8.8.8');
  assert.equal(f.item.whitelist, '8.8.8.8');
  assert.equal(f.item.loginWhitelist, undefined);
  f.item.loginWhitelist = '8.8.8.8';
  f.el('loginWhitelistInput').value = '';
  f.api.validateLoginWhitelist(f.item);
  assert.equal(f.loginChanges.length, 2);
  assert.equal(f.loginChanges[1].next, '');
  assert.equal(f.item.loginWhitelist, '8.8.8.8');
});

test('安全配置无内联验证码，验证函数失败清空且不提交敏感值', () => {
  const f = fixture(), html = f.api.renderCommonConfig(f.item);
  assert.doesNotMatch(html, /id="(?:loginWhitelist2fa|access2fa-shared)"/);
  assert.match(html, /data-access-save="callback"/);
  assert.doesNotMatch(html, /data-access-save="whitelist"/);
  f.el('mfa').value = '000000';
  assert.equal(f.api.verifyMerchantMfa('mfa'), undefined);
  assert.equal(f.el('mfa').value, '');
  assert.match(f.errors[0].message, /验证失败/);
  f.el('mfa').value = '123456';
  assert.equal(f.api.verifyMerchantMfa('mfa'), true);
  assert.equal(f.el('mfa').value, '');
  assert.equal(f.item.logs.length, 0);
});

test('对接资料完整展示合成密钥和账号，两个业务读同一密钥，各商户隔离', () => {
  const f = fixture(), key = f.api.merchantIntegrationKey(f.item);
  assert.match(key, /^demo_[a-f0-9]{32}$/);
  const collect = f.api.renderDirectionAccess(f.item, 'collect');
  const payout = f.api.renderDirectionAccess(f.item, 'payout');
  for (const label of ['商户名称', '商户号', '对接密钥', '下单接口', '查询接口', '回调 IP', 'API 对接文档', '商户登录地址', '商户登录账号', '登录密码']) assert(collect.includes(label));
  assert(collect.includes(key) && payout.includes(key));
  assert.notEqual(f.api.merchantIntegrationKey(fixture().item), key);
  const untrusted = f.api.renderIntegrationValue('test', '字段', '<img src=x onerror=alert(1)>');
  assert.doesNotMatch(untrusted, /<img/);
  assert.match(untrusted, /&lt;img/);
});

test('IPv6空格与缩写可正常解析，同一网段正确去重', () => {
  const f = fixture();
  f.el('loginWhitelistInput').value = '2606:4700:4700::1111 /128';
  f.el('loginWhitelist2fa').value = '123456';
  f.api.validateLoginWhitelist(f.item);
  assert.equal(f.errors.length, 0);
  assert.equal(f.loginChanges[0].next, '2606:4700:4700::1111/128');
  assert.equal(f.api.loginWhitelistIdentity('8.8.8.8/24'), f.api.loginWhitelistIdentity('8.8.8.9/24'));
  assert.equal(f.api.loginWhitelistIdentity('2606:4700::1/64'), f.api.loginWhitelistIdentity('2606:4700:0:0::2/64'));
  for (const entry of ['10.1.1.1', '127.0.0.1', '999.1.1.1', '1e2.1.1.1', '::1', 'fc00::1', '2606::1/129', '8.8.8.8/33']) assert.equal(f.api.loginWhitelistIdentity(entry), null);
});

test('API独立保存不清理待测试回调，回调保存不改API白名单', () => {
  const f = fixture();
  f.item.callback = 'https://current.demo.example/notify';
  f.item.pendingCallbacks = { shared: 'https://pending.demo.example/notify' };
  f.api.applyAccessChange(f.item, { direction: 'payout', callbackChanged: false, whitelistChanged: true, callback: f.item.callback, whitelist: '9.9.9.9' });
  f.commit();
  assert.equal(f.item.pendingCallbacks.shared, 'https://pending.demo.example/notify');
  assert.equal(f.item.callback, 'https://current.demo.example/notify');
  assert.equal(f.item.payoutConfig.orderIp, '9.9.9.9');
  assert.equal(f.item.whitelist, '8.8.8.8');
  f.api.applyAccessChange(f.item, { callbackChanged: true, whitelistChanged: false, callback: 'https://new.demo.example/notify', whitelist: '1.1.1.1' });
  f.commit();
  assert.equal(f.item.callback, 'https://new.demo.example/notify');
  assert.equal(f.item.payoutConfig.orderIp, '9.9.9.9');
  assert.equal(f.item.whitelist, '8.8.8.8');
  assert.equal(f.item.pendingCallbacks.shared, undefined);
});

function boundRateFixture() {
  const f = fixture();
  const product = f.model.tenantData().products.find(p => p.id === 'PROD-OUT-001');
  product.merchantBindings[f.item.id] = { bound: true, rate: '0.0018', fee: '2.00', dailyLimit: '3000000.00', agentRate: '0' };
  return { ...f, product, form() {
    f.api.openMerchantPayoutRates(f.item);
    for (const [id, value] of Object.entries({ 'merchantRate-0': '0.25', 'merchantDaily-0': '123456.78', 'merchantFee-0': '3.25', merchantRateReason: '调整当前商户费率' })) f.el(id).value = value;
  }, submit() { f.el('merchantRateSave').handlers.click(); }, confirm(code) { f.el('merchantRate2fa').value = code; f.el('merchantRateConfirm').handlers.click(); } };
}

test('商户费率使用百分比并精确转为小数，金额沿用整数分', () => {
  const f = fixture();
  for (const [input, raw] of [['0', '0'], ['0.18', '0.0018'], ['100', '1'], ['0.0001', '0.000001'], ['12.3400', '0.1234']]) {
    assert.equal(f.api.normalizeMerchantPayoutRate(input), raw);
    assert.equal(Number(f.api.merchantRatePercent(raw)), Number(input));
  }
  for (const input of ['', '-1', '101', '1e2', '0.00001']) assert.equal(f.api.normalizeMerchantPayoutRate(input), null);
});

test('产品按实际绑定列出，解绑后消失，详情不重复展示绑定通道', () => {
  const f = boundRateFixture();
  const list = f.api.merchantPayoutProducts(f.item);
  assert.equal(list.length, 1);
  const channels = f.api.merchantBoundChannels(list[0]); assert(channels.length > 1);
  const html = f.api.renderPayoutConfig(f.item);
  assert.doesNotMatch(html, /merchant-bound-channels|绑定通道（/);
  assert.match(html, /产品费率/);
  f.product.merchantBindings[f.item.id].bound = false;
  assert.equal(f.api.merchantPayoutProducts(f.item).length, 0);
});

test('商户费率错误和MFA失败不保存，成功仅改当前商户产品配置', () => {
  const f = boundRateFixture(), other = JSON.stringify(f.product.merchantBindings['MCH-1188']), wallets = JSON.stringify(f.item.wallets);
  f.form(); f.el('merchantRate-0').value = '-1'; f.submit(); assert(f.errors.length); assert.equal(f.product.merchantBindings[f.item.id].rate, '0.0018');
  f.el('merchantRate-0').value = '0.25'; f.submit(); f.confirm('000000');
  assert.equal(f.product.merchantBindings[f.item.id].rate, '0.0018');
  f.confirm('123456');
  assert.equal(f.product.merchantBindings[f.item.id].rate, '0.0025');
  assert.equal(f.product.merchantBindings[f.item.id].dailyLimit, '123456.78');
  assert.equal(f.product.merchantBindings[f.item.id].fee, '3.25');
  assert.equal(JSON.stringify(f.product.merchantBindings['MCH-1188']), other);
  assert.equal(JSON.stringify(f.item.wallets), wallets);
  assert.doesNotMatch(JSON.stringify(f.item.logs), /123456(?:[^.]|$)/);
});

test('费率确认时撤权或解除绑定，整次提交拒绝且不写日志', () => {
  for (const revoke of ['merchant', 'grant', 'binding', 'tenant']) {
    const f = boundRateFixture(); f.form(); f.submit();
    const before = f.product.merchantBindings[f.item.id].rate;
    if (revoke === 'merchant') f.item.capabilities = ['法币代收'];
    if (revoke === 'binding') f.product.merchantBindings[f.item.id].bound = false;
    if (revoke === 'grant') for (const grant of f.model.grants) grant.directions = ['代收'];
    if (revoke === 'tenant') f.model.tenantId = 'HS-TEN-017';
    f.confirm('123456');
    assert.equal(f.product.merchantBindings[f.item.id].rate, before);
    assert.equal(f.item.logs.length, 0);
    assert.match(f.errors.at(-1).message, /未保存/);
  }
});


test('产品管理保存的尾零与科学计数费率可精确读取，改单笔费不会改成零', () => {
  const channelsSource = fs.readFileSync(new URL('../surfaces/tenant/public/legacy/sources/channels.html', import.meta.url), 'utf8');
  const saveSource = channelsSource.match(/ function saveMerchantRate\(\)\{[^\n]+/)[0];
  for (const [stored, percent] of [['0.0018000', '0.18'], ['1e-3', '0.1'], ['.0018', '0.18'], ['+1.8E-3', '0.18'], ['0.000001000', '0.0001']]) {
    const f = boundRateFixture();
    vm.runInNewContext(saveSource + ';saveMerchantRate();', {
      context: { id: f.product.id, merchantId: f.item.id },
      requireBusiness: () => true, product: () => f.product, direction: () => '代付',
      $: () => ({ value: stored }), merchantConfig: (p, mid) => p.merchantBindings[mid],
      model: f.model, tenantId: f.model.tenantId, close() {}, openBindMerchants() {}, error(message) { throw Error(message); }
    });
    assert.equal(f.api.merchantRatePercent(f.product.merchantBindings[f.item.id].rate), percent);
    f.api.openMerchantPayoutRates(f.item);
    assert(f.el('modal').innerHTML.includes(`value="${percent}"`));
    for (const [id, value] of Object.entries({ 'merchantRate-0': percent, 'merchantDaily-0': '3000000.00', 'merchantFee-0': '3.00', merchantRateReason: '仅调整单笔费用' })) f.el(id).value = value;
    f.submit(); f.confirm('123456');
    assert.equal(f.product.merchantBindings[f.item.id].rate, f.api.normalizeMerchantPayoutRate(percent));
    assert.equal(f.product.merchantBindings[f.item.id].fee, '3.00');
  }
});

test('超精度或无效既有费率不回退零，阻止打开编辑器', () => {
  for (const rate of ['0.0000001', '1e-7', 'NaN', 'Infinity', '-0.01', '1.01']) {
    const f = boundRateFixture(); f.product.merchantBindings[f.item.id].rate = rate;
    assert.equal(f.api.merchantRatePercent(rate), null);
    assert.match(f.api.renderMerchantPayoutRates(f.item), /需核对/);
    f.api.openMerchantPayoutRates(f.item);
    assert.equal(JSON.parse(f.el('merchantPayoutRateForm').dataset.rateState).rows.length, 0);
    f.el('merchantRateSave').handlers.click(); assert(f.errors.length);
    assert.equal(f.product.merchantBindings[f.item.id].rate, rate);
  }
});


test('安全配置分业务保存回调IP，保留其他配置、白名单和商户数据', () => {
  const f = fixture(), before = JSON.stringify(f.item.collectConfig);
  f.el('merchantPayoutCallbackIp').value = '9.9.9.9';
  f.el('merchantPayoutCallbackReason').value = '保存代付回调';
  f.api.saveMerchantCallbackIps(f.item, 'payout'); f.commit();
  assert.equal(f.cfg.callbackIp, '9.9.9.9');
  assert.equal(JSON.stringify(f.item.collectConfig), before);
  assert.equal(f.cfg.singleFee, 'CNY 2.00');
  assert.equal(f.item.whitelist, '8.8.8.8');
  assert.match(f.item.logs[0][3], /未配置 → 9.9.9.9/);
  f.el('merchantPayoutCallbackIp').value = '';
  f.api.saveMerchantCallbackIps(f.item, 'payout'); f.commit();
  assert.equal(f.cfg.callbackIp, '');
});

test('回调IP错误格式、重复、无原因及保存期间撤权不写入', () => {
  for (const value of ['999.1.1.1', '10.0.0.1', '8.8.8.0/24', '8.8.8.8,8.8.8.8']) {
    const f = fixture(); f.el('merchantCollectCallbackIp').value = value;
    f.el('merchantCollectCallbackReason').value = '变更';
    f.api.saveMerchantCallbackIps(f.item, 'collect'); f.commit();
    assert(f.errors.length); assert.equal(f.item.collectConfig.callbackIp, ''); assert.equal(f.item.logs.length, 0);
  }
  const f = fixture(); f.el('merchantCollectCallbackIp').value = '9.9.9.9';
  f.api.saveMerchantCallbackIps(f.item, 'collect'); f.commit(); assert.match(f.errors[0].message, /原因/);
  f.el('merchantCollectCallbackReason').value = '变更'; f.api.saveMerchantCallbackIps(f.item, 'collect');
  f.item.capabilities = ['法币代付']; f.commit(); assert.equal(f.item.collectConfig.callbackIp, ''); assert.equal(f.item.logs.length, 0);
});


test('全部绑定产品直接编辑，第二产品错误时整次不提交，成功只更新变化行', () => {
  const f = boundRateFixture();
  const second = f.model.tenantData().products.find(p => p.id === 'PROD-OUT-002');
  second.merchantBindings[f.item.id] = { bound: true, rate: '0.002', fee: '1.50', dailyLimit: '1000000.00' };
  f.api.openMerchantPayoutRates(f.item);
  assert.match(f.el('modal').innerHTML, /PAYOUT-CNY-BANK/);
  assert.match(f.el('modal').innerHTML, /PAYOUT-CNY-BATCH/);
  assert.doesNotMatch(f.el('modal').innerHTML, /data-merchant-payout-rates|设置费率/);
  const original = JSON.stringify(f.product.merchantBindings[f.item.id]);
  f.el('merchantRateReason').value = '分别设置两个产品';
  f.el('merchantRate-0').value = '0.22'; f.el('merchantFee-1').value = '-1';
  f.submit(); assert(f.errors.length); assert.equal(JSON.stringify(f.product.merchantBindings[f.item.id]), original);
  f.el('merchantFee-1').value = '1.80'; f.submit(); f.confirm('123456');
  assert.equal(f.product.merchantBindings[f.item.id].rate, '0.0022');
  assert.equal(second.merchantBindings[f.item.id].fee, '1.80');
  assert.equal(second.merchantBindings[f.item.id].rate, '0.002');
  assert.equal(f.item.logs.length, 2);
});

test('行内费率使用渲染快照，绑定通道变化拒绝提交且未绑定产品不出现', () => {
  const f = boundRateFixture(); f.api.openMerchantPayoutRates(f.item);
  assert.doesNotMatch(f.el('modal').innerHTML, /PAYOUT-CNY-BATCH/);
  f.el('merchantRate-0').value = '0.25'; f.el('merchantRateReason').value = '变更';
  f.product.channelIds.pop(); f.submit();
  assert.match(f.errors.at(-1).message, /变化/);
  assert.equal(f.product.merchantBindings[f.item.id].rate, '0.0018');
});


test('代付主表无原因和验证码，费用变更才在提交弹窗显示MFA，返回修改不保存', () => {
  const f = fixture(); const html = f.api.renderPayoutConfig(f.item);
  assert.doesNotMatch(html, /id="merchantPayout(?:Reason|2fa)"/);
  f.el('merchantPayoutSingleFee').value = '3.25'; f.el('merchantPayoutManual').checked = false;
  f.save(); assert.match(f.el('modal').innerHTML, /id="merchantPayout2fa"/);
  assert.equal(f.cfg.singleFee, 'CNY 2.00');
  f.el('payoutSettingsCancel').handlers.click();
  assert.equal(f.el('merchantPayoutSingleFee').value, '3.25'); assert.equal(f.el('merchantPayoutManual').checked, false);
  assert.equal(f.cfg.singleFee, 'CNY 2.00'); assert.equal(f.cfg.manualOrder, '开启'); assert.equal(f.item.logs.length, 0);
});


test('登录、API、两业务回调IP共用列表编辑，多个输入都参与校验且不跨区读取', () => {
  const f = fixture(), html = f.api.renderCommonConfig(f.item);
  for (const id of ['loginWhitelistInput', 'merchantCollectCallbackIp', 'merchantPayoutCallbackIp']) {
    assert(html.includes(`data-ip-editor="${id}"`));
    assert(html.includes(`data-ip-entry="${id}"`));
  }
  assert.equal((html.match(/data-ip-add/g) || []).length, 3);
  assert.doesNotMatch(html, /<textarea[^>]*id="(?:loginWhitelistInput|merchantCollectCallbackIp|merchantPayoutCallbackIp)"/);
  f.el('loginWhitelistInput').value = '8.8.8.8';
  f.el('loginWhitelistInput-1').value = '8.8.8.8/32';
  f.api.validateLoginWhitelist(f.item);
  assert.match(f.errors[0].message, /重复/);
  f.el('loginWhitelistInput-1').value = '1.1.1.0/24';
  f.api.validateLoginWhitelist(f.item);
  assert.equal(f.loginChanges[0].next, '8.8.8.8\n1.1.1.0/24');
  f.el('merchantCollectCallbackIp').value = '9.9.9.9';
  f.el('merchantCollectCallbackIp-1').value = '1.1.1.0/24';
  f.el('merchantCollectCallbackReason').value = '配置回调';
  f.api.saveMerchantCallbackIps(f.item, 'collect'); f.commit();
  assert.match(f.errors[0].message, /不支持网段/);
  assert.equal(f.item.collectConfig.callbackIp, '');
  f.el('merchantCollectCallbackIp-1').value = '2606:4700:4700::1111';
  f.api.saveMerchantCallbackIps(f.item, 'collect'); f.commit();
  assert.equal(f.item.collectConfig.callbackIp, '9.9.9.9, 2606:4700:4700::1111');
  assert.equal(f.item.payoutConfig.callbackIp, '');
  assert.equal(f.item.whitelist, '8.8.8.8');
});


test('对接资料整组复制与页面共用字段，各业务方向及当前密钥正确且内容转义', () => {
  const f = fixture();
  f.item.name = '商户"<测试>&';
  for (const mode of ['collect', 'payout']) {
    const html = f.api.renderDirectionAccess(f.item, mode);
    const fields = f.api.merchantDirectionAccessFields(f.item, mode);
    assert.equal(fields.length, 10);
    assert.equal((html.match(/data-copy-value=/g) || []).length, 11);
    assert.match(html, new RegExp(`data-integration-copy="${mode}"`));
    assert(html.includes('复制全部'));
    assert.doesNotMatch(html, /<测试>/);
    assert(html.includes('商户&quot;&lt;测试>&amp;'));
    assert.equal(fields.find(([key]) => key === 'order')[2], `https://demo.example/${mode}/create`);
    assert.equal(fields.find(([key]) => key === 'key')[2], f.item.apiKey);
  }
  const before = f.item.apiKey;
  f.item.apiKey = f.api.createMerchantDemoKey();
  assert.notEqual(before, f.api.merchantDirectionAccessFields(f.item, 'payout').find(([key]) => key === 'key')[2]);
});


test('方向列表业务开关共用能力状态，确认前不改变数据，确认后只改变目标业务', () => {
  const f = fixture();
  const state = { source: 'business-payout', tenantId: f.model.tenantId, before: JSON.stringify(f.item.capabilities) };
  assert.match(f.api.renderMerchantCapabilitySwitch(f.item, '法币代付', 'business-payout'), /data-business-capability="法币代付"/);
  assert.match(f.api.renderMerchantCapabilitySwitch(f.item, '法币代付'), /role="switch".*data-capability-toggle="法币代付"[^>]*checked/);
  f.api.applyCapabilityChange(f.item, '法币代付', '关闭', state);
  assert.match(f.errors[0].message, /原因/);
  assert.equal(f.item.capabilities.includes('法币代付'), true);
  f.el('capabilityReason').value = '列表关闭代付';
  f.api.applyCapabilityChange(f.item, '法币代付', '关闭', state);
  f.api.applyCapabilityChange(f.item, '法币代付', '关闭', state);
  assert.equal(f.timers.length, 1, '重复确认只调度一次保存');
  assert.equal(f.item.capabilities.includes('法币代付'), true, '等待提交期间仍未改变');
  f.commit();
  assert.equal(f.item.capabilities.includes('法币代付'), false);
  assert.equal(f.item.capabilities.includes('法币代收'), true);
  assert.equal(f.cfg.status, '未开通');
  assert.equal(f.item.logs.length, 1);
  assert.doesNotMatch(f.api.renderMerchantCapabilitySwitch(f.item, '法币代付'), /checked/);
  assert.doesNotMatch(f.api.renderMerchantCapabilitySwitch(f.item, '法币代付', 'business-payout'), /checked/);
});

test('业务开关确认拒绝租户或能力快照变化，重新开通直接开启方向业务', () => {
  for (const mutate of [f => { f.model.tenantId = 'HS-TEN-002'; }, f => { f.item.capabilities = ['法币代收']; }]) {
    const f = fixture(), state = {source:'business-payout', tenantId:f.model.tenantId, before:JSON.stringify(f.item.capabilities)};
    f.el('capabilityReason').value = '调整';
    f.api.applyCapabilityChange(f.item, '法币代付', '关闭', state);
    mutate(f); f.commit();
    assert.match(f.errors.at(-1).message, /已变化/);
    assert.equal(f.item.logs.length, 0);
    assert.equal(f.cfg.status, '开启');
  }
  const f = fixture(); f.item.capabilities = ['法币代收']; f.cfg.status = '未开通';
  const state = {source:'business-payout', tenantId:f.model.tenantId, before:JSON.stringify(f.item.capabilities)};
  f.el('capabilityReason').value = '详情开通';
  f.api.applyCapabilityChange(f.item, '法币代付', '开通', state); f.commit();
  assert.equal(f.cfg.status, '开启');
  assert(f.item.capabilities.includes('法币代付'));
  assert.match(f.api.renderMerchantCapabilitySwitch(f.item, '法币代付', 'business-payout'), /checked/);
});

test('代收不提供白名单，代付下单与后台登录IP独立，清空不回落旧值', () => {
  const f=fixture();
  assert.equal(f.api.renderBusinessWhitelist(f.item,'collect'),'');
  assert.equal(f.api.businessWhitelistAllowed(f.item,'collect'),false);
  const html=f.api.renderBusinessWhitelist(f.item,'payout');
  assert.match(html,/代付下单 IP 白名单/);assert.doesNotMatch(html,/loginWhitelistInput|商户后台登录/);
  f.item.loginWhitelist='1.1.1.1';
  f.api.applyAccessChange(f.item,{direction:'payout',callbackChanged:false,whitelistChanged:true,whitelist:''});f.commit();
  assert.equal(f.api.merchantWhitelist(f.item,'payout'),'');
  assert.equal(f.item.loginWhitelist,'1.1.1.1');assert.equal(f.item.whitelist,'8.8.8.8');
  const before=JSON.stringify(f.item);
  for(const direction of [null,'collect']) {
    f.api.applyAccessChange(f.item,{direction,whitelistChanged:true,whitelist:'1.0.0.1'});f.commit();
    assert.equal(JSON.stringify(f.item),before,'不接受代收或通用入口写入白名单');
  }
});
