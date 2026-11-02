// 页面注册表一致性：每个页面的 sourceKey 都能落到真实源文件；导航覆盖全部页面。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = JSON.parse(await readFile(path.join(root, "src/legacy/modules.json"), "utf8"));

test("页面注册表包含 33 个页面", () => {
  assert.equal(Object.keys(modules).length, 33);
  assert.equal(modules.todos, undefined);
  assert.equal(modules.tickets, undefined);
});

test("登录安全参照开发环境展示白名单管理", async () => {
  const html = await readFile(path.join(root, "public/legacy/sources/system.html"), "utf8");
  const securityView = html.slice(html.indexOf('<section class="view" id="view-security">'), html.indexOf('<section class="view" id="view-settings">'));
  for (const label of ['IP地址', '启用状态', '备注', '创建时间', '新增白名单', '批量删除']) assert.ok(securityView.includes(label));
  assert.match(securityView, /aria-label="登录IP白名单"/);
  assert.doesNotMatch(securityView, /<h2>登录记录<\/h2>/);
  assert.match(html, /login-whitelist-drawer/);
});

test("商户管理保留 2026-09-25 已确认优化，不能退回旧版", async () => {
  const html = await readFile(path.join(root, 'public/legacy/sources/merchants.html'), 'utf8');
  assert.doesNotMatch(html, /id="businessView"/);
  assert.match(html, /"跑量统计": renderVolumeTab/);
  assert.match(html, /data-whitelist-entry/);
  assert.match(html, /id="walletAdjustSubmit"/);
  assert.match(html, /merchantCollectCallbackIp/);
  assert.match(html, /merchantPayoutCallbackIp/);
  assert.match(html, /单笔|有效金额/);
});

test("账户管理提供补单限制且不再展示数据范围列", async () => {
  const html = await readFile(path.join(root, 'public/legacy/sources/system.html'), 'utf8');
  const accounts = html.slice(html.indexOf('id="view-accounts"'), html.indexOf('id="view-roles"'));
  assert.doesNotMatch(accounts, /<th>数据范围<\/th>/);
  for (const key of ['repairDailyCount', 'repairDailyAmount', 'repairSingleAmount']) assert.ok(html.includes(key));
  assert.match(html, /modalShell\('补单设置'/);
  assert.match(html, /type="submit">确认提交/);
});

test("系统费使用单一租户钱包与逐单扣费流水", async () => {
  const html = await readFile(path.join(root, "public/legacy/sources/overview.html"), "utf8");
  assert.equal(modules.wallets.label, "系统费");
  assert.equal(modules.funds, undefined);
  assert.equal(modules.ledger, undefined);
  for (const text of ["租户钱包余额", "原订单号 / 成功时间", "原始订单金额（CNY）", "计费方式 / 费率快照", "变动金额（CNY）", "扣费/调整时间（UTC+8）", "变动后余额（CNY）"]) assert(html.includes(text));
  assert.match(html, /window\.HSFeeWallets\?\.canAccept/);
});

test("登录页提供 2FA 已绑定与未绑定两条可验证流程", async () => {
  const html = await readFile(path.join(root, "public/legacy/sources/login.html"), "utf8");
  assert.match(html, /data-demo-account-state="bound"/);
  assert.match(html, /data-demo-account-state="unbound"/);
  assert.match(html, /admin@tenant\.example[\s\S]*?Tenant#2026[\s\S]*?246810/);
  assert.match(html, /newadmin@tenant\.example[\s\S]*?Bind#2026[\s\S]*?135790/);
  assert.match(html, /id="verifyPanel"/);
  assert.match(html, /id="bindPanel"/);
  assert.match(html, /当前账号尚未绑定验证器/);
  assert.match(html, /模拟绑定二维码/);
  assert.match(html, /完成绑定并进入/);
  assert.match(html, /permissionFact\.twoFactorBound === false \? "bind" : "verify"/);
});

test("每个页面的源文件存在于 public/legacy/sources", async () => {
  const keys = new Set(Object.values(modules).map(m => m.sourceKey));
  assert.equal(keys.size, 8);
  for (const key of keys) {
    await stat(path.join(root, "public/legacy/sources", `${key}.html`));
  }
});

test("通知中心使用独立业务源并包含发送消息与通知配置两个页签", async () => {
  assert.equal(modules.notifications.sourceKey, "notifications");
  assert.equal(modules.notifications.group, "运营中心");
  const html = await readFile(path.join(root, "public/legacy/sources/notifications.html"), "utf8");
  assert.match(html, /role="tab"[^>]*>\s*(?:<[^>]+>[^<]*<\/[^>]+>\s*)*发送的消息/);
  assert.match(html, /role="tab"[^>]*>\s*(?:<[^>]+>[^<]*<\/[^>]+>\s*)*通知配置/);
  assert.match(html, /新增通知配置/);
  assert.match(html, /同一消息类型可配置多个目标群/);
  assert.match(html, /推送时间（UTC\+8）/);
  assert.match(html, /推送事件/);
  assert.match(html, /推送内容/);
  assert.match(html, /推送当时命中的模板快照/);
});

test("每个页面都有 label/group/module/sourceKey/sourceName", () => {
  for (const [id, m] of Object.entries(modules)) {
    assert.ok(m.label, `${id} 缺 label`);
    assert.ok(m.group, `${id} 缺 group`);
    assert.ok(m.module, `${id} 缺 module`);
    assert.ok(m.sourceKey, `${id} 缺 sourceKey`);
    assert.ok(m.sourceName, `${id} 缺 sourceName`);
    assert.equal(m.sourceKey, m.module, `${id} sourceKey 与 module 不一致`);
  }
});

test("导航覆盖全部非 utility 页面，utility 页面恰好 2 个", async () => {
  const { NAV_GROUPS, UTILITY_ITEMS, MODULES } = await import("../src/modules.js");
  const navIds = NAV_GROUPS.flatMap(g => g.items.map(i => i.id));
  const utilityIds = UTILITY_ITEMS.map(i => i.id);
  assert.equal(utilityIds.length, 2);
  for (const id of Object.keys(MODULES)) {
    const covered = navIds.includes(id) || utilityIds.includes(id);
    assert.ok(covered, `${id} 未出现在导航或工具区`);
  }
  assert.equal(new Set([...navIds, ...utilityIds]).size, Object.keys(MODULES).length);
});
