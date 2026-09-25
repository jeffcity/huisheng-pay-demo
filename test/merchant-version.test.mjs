import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('商户端保留 2026-09-23 已合并的通知配置功能', async () => {
  const html = await readFile(new URL('../surfaces/merchant/demo.html', import.meta.url), 'utf8');
  const modules = JSON.parse(html.match(/const modules = (\{[^\n]+\});/)[1]);
  const page = Buffer.from(modules.overview.html, 'base64').toString('utf8');
  for (const marker of ['data-page="notificationBots"', 'data-page="notificationConfigs"', 'id="notifyWindow"', 'id="notifyThreshold"', '登录错误过多', '修改密码']) assert.ok(page.includes(marker), marker);
});
