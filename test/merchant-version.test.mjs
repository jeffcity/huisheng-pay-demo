import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('商户端保留 2026-09-23 已合并的通知配置功能', async () => {
  const page = await readFile(new URL('../surfaces/merchant/demo.html', import.meta.url), 'utf8');
  for (const marker of ['data-page="notificationBots"', 'data-page="notificationConfigs"', 'id="notifyWindow"', 'id="notifyThreshold"', '登录错误过多', '修改密码']) assert.ok(page.includes(marker), marker);
});

test('商户开发版页面分类与独立通知功能维护在明文源码', async () => {
  const page = await readFile(new URL('../surfaces/merchant/demo.html', import.meta.url), 'utf8');
  for (const marker of ['merchant-development-baseline', 'cryptoCollect:', 'cryptoPayout:', 'accountCollect:', 'accountPayout:', 'prepayCollect:', 'prepayPayout:', 'serviceFee:', 'dailyCollect:', 'dailyPayout:', 'data-base-manual', 'data-page="access"', 'data-page="notificationBots"', 'data-page="notificationConfigs"']) assert.ok(page.includes(marker), marker);
  assert.doesNotMatch(page, /function decodeBase64/);
  assert.match(page, /window\.__renderMerchantBaseline\?\.\(name\)/);
  assert.match(page, /merchantAuthorizeCurrentOperation\('merchant.payout.apply'/);
  assert.doesNotMatch(page, /Demo 已确认扩展|refundExtension|payoutExtension|fundingExtension|reconExtension|integrationExtension|homeExtension/);
  assert.match(page, /legacy\.hidden = true/);
  assert.match(page, /if \(name === 'children'\).*return false/);
  assert.match(page, /form\.elements\[key\]\.value=value/);
  assert.match(page, /feeRecharge:\['预付手续费充值'/);
  assert.match(page, /data-base-withdraw>提现<\/button>/);
  // Development credentials and endpoints must never become demo fixtures.
  assert.doesNotMatch(page, /saas-merchant-web1\.newopsname\.com|MOFQEGOT42|saas-gateway\.newopsname\.com/);
});

test('明文商户页面的全部内联脚本可解析', async () => {
  const page = await readFile(new URL('../surfaces/merchant/demo.html', import.meta.url), 'utf8');
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 5);
  for (const [index, script] of scripts.entries()) assert.doesNotThrow(() => new Function(script[1]), `script ${index}`);
});
