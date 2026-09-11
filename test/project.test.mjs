// 模块注册表一致性：每个模块的 sourceKey/initialHash 都能落到真实源文件；
// 导航覆盖所有业务模块。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = JSON.parse(await readFile(path.join(root, "src/legacy/modules.json"), "utf8"));

test("模块注册表包含 33 个统一入口", () => {
  assert.equal(Object.keys(modules).length, 33);
});

test("每个模块的源文件存在于 public/legacy/sources", async () => {
  const keys = new Set(Object.values(modules).map(m => m.sourceKey));
  for (const key of keys) {
    await stat(path.join(root, "public/legacy/sources", `${key}.html`));
  }
});

test("每个模块都有 label/group/code", () => {
  for (const [id, m] of Object.entries(modules)) {
    assert.ok(m.label, `${id} 缺 label`);
    assert.ok(m.group, `${id} 缺 group`);
    assert.ok(m.code, `${id} 缺 code`);
  }
});

test("系统管理新增 IP 规则立即启用，2FA 绑定仅由登录流程触发", async () => {
  const system = await readFile(path.join(root, "public/legacy/sources/system.html"), "utf8");
  const login = await readFile(path.join(root, "public/legacy/sources/login.html"), "utf8");
  const moduleSource = await readFile(path.join(root, "src/modules.js"), "utf8");
  const appSource = await readFile(path.join(root, "src/App.jsx"), "utf8");
  assert.match(system, /新增 IP 规则/);
  assert.match(system, /data-action="security-entry-add"[\s\S]*?<span>新增<\/span>/);
  assert.match(system, /保存成功后立即启用/);
  assert.match(system, /enabled: true, updated:/);
  assert.match(system, /data-action="security-save"[\s\S]*?<span>保存<\/span>/);
  assert.match(system, /启用后，只有已启用规则中的 IP 可以登录平台。保存前，当前登录 IP/);
  assert.doesNotMatch(system, /<span>新增并启用<\/span>|<span>保存全局开关<\/span>|若平台全部管理员因白名单无法登录|<strong>当前登录 IP<\/strong>|新增规则默认停用|保存后默认停用|新增登录 IP 规则（默认停用）/);
  assert.match(system, /security-entry-toggle/);
  assert.match(system, /登录时强制绑定/);
  assert.doesNotMatch(system, /open-2fa-bind|绑定入口/);
  assert.match(moduleSource, /title: '系统管理', items: \[\s*\{ module: 'system-accounts', label: '系统管理控制台' \},?\s*\]/);
  assert.equal([...moduleSource.matchAll(/module: 'system-(?:accounts|roles|security|menus|fees)'/g)].length, 1);
  assert.equal(modules["system-fees"], undefined);
  assert.doesNotMatch(system, /\{ id: "fees", label: "套餐费率"/);
  assert.doesNotMatch(login, /feesonly|仅套餐费率|id: "fees", label: "套餐费率"/);
  assert.match(appSource, /selectedKeys=\{\[activeTarget\.navId \|\| activeModule\]\}/);
  assert.match(moduleSource, /title: '账号登录（流程示意）'/);
  assert.match(moduleSource, /module: 'login-bind', label: '绑定 Google 2FA'/);
  assert.match(login, /扫描二维码或复制密钥，然后输入 6 位验证码/);
  assert.match(login, /JBSWY3DPEHPK3PXP/);
  assert.match(login, /id="copyBindSecret"/);
  assert.match(login, /验证并绑定/);
  assert.match(login, /body\[data-login-view="bind"\] \.access-rail/);
  assert.match(login, /document\.body\.dataset\.loginView = view/);
  assert.doesNotMatch(login, /<li><span>账号状态<\/span>|<li><span>绑定结果<\/span>|<li><span>恢复码<\/span>/);
});

test("平台账号编辑展示 2FA 状态且列表提供独立重置操作", async () => {
  const system = await readFile(path.join(root, "public/legacy/sources/system.html"), "utf8");
  const editForm = system.slice(system.indexOf("function renderAccountEditForm"), system.indexOf("function renderAccountResetPasswordForm"));
  const createForm = system.slice(system.indexOf("function renderAccountCreateForm"), system.indexOf("function renderAccountEditForm"));
  const accountList = system.slice(system.indexOf("function renderUsers"), system.indexOf("function renderSystemReceipts"));
  const roleChoices = system.slice(system.indexOf("function roleChoiceCards"), system.indexOf("function renderAccountCreateForm"));
  const accountModalConfig = system.slice(system.indexOf("function accountModalConfig"), system.indexOf("function renderRoleCreateForm"));

  assert.doesNotMatch(editForm, /accountEditScopeCode|账号数据范围|指定租户|部门 \/ 岗位|auditStrip\("编辑平台账号"/);
  assert.doesNotMatch(createForm, /accountCreateScopeCode|账号数据范围|指定租户|部门 \/ 岗位|auditStrip\("新增平台账号"/);
  assert.match(editForm, /id="accountStatusEdit"/);
  assert.match(editForm, /class="switch-control"/);
  assert.match(editForm, /当前状态/);
  assert.doesNotMatch(editForm, /accountResetTwofaEdit|保存时重置 2FA|等待账号登录绑定/);
  assert.match(editForm, /<label>角色<\/label>/);
  assert.match(editForm, /<label for="accountRemarkEdit">备注<\/label>/);
  assert.doesNotMatch(accountList, /<th>部门<\/th>|<th>数据范围<\/th>/);
  assert.match(accountList, /data-message="account:reset-2fa:\$\{account\.id\}"[\s\S]*?<span>重置 2FA<\/span>/);
  assert.match(accountModalConfig, /confirmText: "保存"/);
  assert.doesNotMatch(accountModalConfig, /confirmText: "保存账号"/);
  assert.doesNotMatch(roleChoices, /role\.scope/);
});

test("角色编辑使用状态切换器且不展示编码、数据范围和提交前摘要", async () => {
  const system = await readFile(path.join(root, "public/legacy/sources/system.html"), "utf8");
  const editForm = system.slice(system.indexOf("function renderRoleEditForm"), system.indexOf("function renderRoleDeleteForm"));
  const createForm = system.slice(system.indexOf("function renderRoleCreateForm"), system.indexOf("function renderRoleEditForm"));
  const roleConfig = system.slice(system.indexOf("function renderRoleConfig"), system.indexOf("function renderMenuRow"));
  const authorizeForm = system.slice(system.indexOf("function renderRoleAuthorizeForm"), system.indexOf("function updatePlatformSensitivePreview"));

  assert.doesNotMatch(editForm, /角色编码|roleCodeEdit|角色数据范围|roleEditScopeCode|指定租户|成员数量|已授权页面|变更影响|auditStrip\("编辑角色"/);
  assert.doesNotMatch(createForm, /角色编码|roleCodeCreate|角色数据范围|roleCreateScopeCode|指定租户|auditStrip\("新增角色"/);
  assert.match(editForm, /id="roleStatusEdit"/);
  assert.match(editForm, /class="switch-control"/);
  assert.match(editForm, /data-role-status-label/);
  assert.doesNotMatch(roleConfig, /<th>(?:数据范围|已授权页面|按钮权限)<\/th>|data-message="role:state:|const pageCount = grantedPageCount|const actionCount = grantedActionCount/);
  assert.doesNotMatch(authorizeForm, /角色数据范围|<th>数据范围<\/th>|<span>数据范围<\/span>/);
});

test("租户创建要求初始登录 IP，并分离登录与 API 两套名单", async () => {
  const tenants = await readFile(path.join(root, "public/legacy/sources/tenants.html"), "utf8");
  assert.match(tenants, /初始管理员登录 IP/);
  assert.match(tenants, /初始管理员登录 IP 必填/);
  assert.match(tenants, /租户后台登录 IP 白名单/);
  assert.match(tenants, /业务 API 来源 IP 白名单/);
  assert.match(tenants, /两套名单相互独立/);
});

test("财务模块保留七类独立待办入口", async () => {
  const funds = await readFile(path.join(root, "public/legacy/sources/funds.html"), "utf8");
  for (const queue of ["存款确认", "提款审核", "账户审核", "人工调整", "异常资金", "结果冲突", "通知失败"]) {
    assert.match(funds, new RegExp(queue), `缺少资金待办：${queue}`);
  }
});

test("财务模块导航只展示租户平台钱包", async () => {
  const moduleSource = await readFile(path.join(root, "src/modules.js"), "utf8");
  assert.match(moduleSource, /\{ module: 'wallets', label: '租户平台钱包' \}/);
  assert.doesNotMatch(moduleSource, /\{ module: 'funds', label: '资金待办' \}/);
});

test("平台通知中心归属协同运营并保持平台职责边界", async () => {
  const moduleSource = await readFile(path.join(root, "src/modules.js"), "utf8");
  const page = await readFile(path.join(root, "public/legacy/sources/notifications.html"), "utf8");
  const system = await readFile(path.join(root, "public/legacy/sources/system.html"), "utf8");

  assert.equal(modules.notifications?.sourceKey, "notifications");
  assert.equal(modules.notifications?.navId, "notifications");
  assert.match(moduleSource, /title: '协同运营'[\s\S]*module: 'tickets'[\s\S]*module: 'notifications', label: '平台通知中心'/);
  for (const label of ["发送的消息", "通知配置", "平台自有配置范围", "通知详情"]) {
    assert.match(page, new RegExp(label), `平台通知中心缺少：${label}`);
  }
  assert.match(page, /商户自有系统通知补推仍由租户端有权限人员处理/);
  assert.doesNotMatch(page, /商户通知补推按钮|重新通知商户/);
  assert.match(system, /platform\.notification\.view/);
  assert.match(system, /platform\.notification\.config\.manage/);
  assert.match(system, /platform\.notification\.export/);
});

test("平台系统管理提供独立租户菜单目录与安全发布边界", async () => {
  const system = await readFile(path.join(root, "public/legacy/sources/system.html"), "utf8");
  const moduleSource = await readFile(path.join(root, "src/modules.js"), "utf8");

  assert.equal(modules["system-tenant-menus"]?.sourceKey, "system");
  assert.equal(modules["system-tenant-menus"]?.initialHash, "tenant-menus");
  assert.equal(modules["system-tenant-menus"]?.navId, "system-accounts");
  assert.match(moduleSource, /title: '系统管理', items: \[\s*\{ module: 'system-accounts', label: '系统管理控制台' \},?\s*\]/);
  for (const label of ["平台菜单管理", "租户菜单管理", "租户端路由", "组件标识", "能力归属", "适用范围", "发布状态 / 版本"]) {
    assert.match(system, new RegExp(label), `租户菜单管理缺少：${label}`);
  }
  assert.match(system, /新菜单默认保存为草稿/);
  assert.match(system, /不会自动给租户账号或角色授权/);
  assert.match(system, /平台发布范围、租户业务授权、角色权限和账号状态的交集/);
  assert.match(system, /租户端路由必须以 \/tenant\//);
  assert.match(system, /权限标识需以 tenant:/);
  assert.match(system, /platform\.tenant_menu\.view/);
  assert.match(system, /platform\.tenant_menu\.manage/);
  assert.match(system, /platform\.tenant_menu\.publish/);
  assert.match(system, /platform\.tenant_menu\.audit/);
  const tenantPage = system.slice(system.indexOf("function renderTenantMenus"), system.indexOf("function renderFees"));
  assert.doesNotMatch(tenantPage, /删除菜单|data-message="tenant-menu:delete/);
});

test("租户平台钱包详情使用弹窗并展示租户钱包信息", async () => {
  const wallets = await readFile(path.join(root, "public/legacy/sources/wallets.html"), "utf8");
  const walletDetail = wallets.slice(wallets.indexOf("function platformWalletDetailMarkup"), wallets.indexOf("function detailMarkup"));
  const walletPageStart = wallets.indexOf("      wallets: {");
  const walletPage = wallets.slice(walletPageStart, wallets.indexOf("      funds: {", walletPageStart));
  assert.match(wallets, /classList\.toggle\('wallet-modal', page\.detailKind === 'wallet'\)/);
  assert.match(wallets, /\.drawer\.wallet-modal/);
  assert.match(walletDetail, /租户钱包/);
  assert.match(walletDetail, /activeWalletCurrency/);
  assert.match(wallets, /最近钱包流水/);
  assert.match(wallets, /data-wallet-flow-period/);
  for (const period of ["近一小时", "今日", "昨日"]) assert.match(wallets, new RegExp(period));
  const walletFlow = wallets.slice(wallets.indexOf("function platformWalletFlowMarkup"), wallets.indexOf("function platformWalletDetailMarkup"));
  assert.match(walletFlow, /<th>流水单号<\/th>/);
  assert.match(walletFlow, /<th>类型<\/th>/);
  for (const orderType of ["人工调整", "冻结", "解冻", "增加", "减少"]) {
    assert.match(walletFlow, new RegExp(orderType), `钱包流水缺少类型：${orderType}`);
  }
  assert.doesNotMatch(walletFlow, /<th>流水类型<\/th>/);
  assert.doesNotMatch(walletFlow, /<th>收支<\/th>/);
  assert.doesNotMatch(walletFlow, /<th>订单类型<\/th>/);
  assert.doesNotMatch(wallets, /最近资金摘要/);
  assert.match(walletDetail, /可用余额/);
  assert.match(walletDetail, /冻结金额/);
  assert.match(wallets, /data-wallet-currency/);
  for (const currency of ["CNY", "USD", "PHP", "THB"]) assert.match(wallets, new RegExp(`${currency}:`));
  assert.doesNotMatch(wallets, /<div class="risk-strip">/);
  assert.doesNotMatch(wallets, /平台只维护租户的 CNY 代收/);
  assert.doesNotMatch(walletPage, /核对异常/);
  for (const hiddenColumn of ["待处理事项", "最近变化", "状态"]) {
    assert.doesNotMatch(walletPage.match(/columns: \[[^\n]+/)?.[0] || "", new RegExp(hiddenColumn));
  }
  const walletActions = wallets.slice(wallets.indexOf("function detailActions"), wallets.indexOf("function platformSafeSummary"));
  assert.match(walletActions, /page\.detailKind === 'wallet'[\s\S]*?return ''/);
  for (const outdatedBlock of ["租户三钱包摘要", "余额与流水边界", "关联流水示例", "内部划转只读事实", "当前风险冻结", "成功后迟到失败待冲正"]) {
    assert.doesNotMatch(walletDetail, new RegExp(outdatedBlock));
  }
});

test("统一导航使用最新模块名称", async () => {
  const moduleSource = await readFile(path.join(root, "src/modules.js"), "utf8");
  const system = await readFile(path.join(root, "public/legacy/sources/system.html"), "utf8");

  for (const label of ["财务模块", "报表模块", "审计模块"]) {
    assert.match(moduleSource, new RegExp(`title: '${label}'`), `统一导航缺少：${label}`);
    assert.match(system, new RegExp(label), `系统管理菜单元数据缺少：${label}`);
  }

  for (const legacyLabel of ["资金运营", "报表体系", "审计体系"]) {
    assert.doesNotMatch(moduleSource, new RegExp(`title: '${legacyLabel}'`), `统一导航仍保留旧名称：${legacyLabel}`);
    assert.doesNotMatch(system, new RegExp(legacyLabel), `系统管理菜单元数据仍保留旧名称：${legacyLabel}`);
  }
});

test("平台通知中心提供机器人配置并与通知配置联动", async () => {
  const page = await readFile(path.join(root, "public/legacy/sources/notifications.html"), "utf8");

  for (const label of ["机器人配置", "机器人名称", "TG Bot Token", "关联通知配置", "新增机器人"]) {
    assert.match(page, new RegExp(label), `机器人配置缺少：${label}`);
  }
  assert.match(page, /id="robotsTab"[\s\S]*data-tab="robots"/);
  assert.match(page, /id="robotToken" type="password" autocomplete="new-password"/);
  assert.match(page, /let robotData = \[/);
  assert.match(page, /function populateRobotOptions\(\)/);
  assert.match(page, /configData = configData\.map[\s\S]*robotId:/);
  assert.match(page, /robotId: Number\(el\("modalRobot"\)\.value\)/);
  assert.match(page, /if \(state\.robotFromConfig\) el\("modalRobot"\)\.value = String\(id\)/);
  assert.doesNotMatch(page, /data-delete-robot|data-toggle-robot/);
});
