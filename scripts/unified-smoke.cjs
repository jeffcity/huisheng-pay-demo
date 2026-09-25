const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');

(async () => {
  let browser, server;
  try {
    const file = resolve(__dirname, '../dist/index.html');
    const html = await readFile(file);
    // 只提供单个 HTML，任何旁路资源都会 404：模拟 Pages 仓库子目录。
    server = createServer((request, response) => {
      if (request.url !== '/repo/demo/index.html') { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox']
    });
    for (const url of [pathToFileURL(file).href, `http://127.0.0.1:${server.address().port}/repo/demo/index.html`]) {
      const page = await browser.newPage();
      const errors = [], localRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({ width: 1440, height: 900 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:')) return request.abort();
        if (/^(file|http):/.test(request.url())) localRequests.push(request.url().split('#')[0]);
        request.continue();
      });
      await page.goto(url, { waitUntil: 'load' });
      async function current(id) {
        await page.waitForSelector(`iframe[data-active-surface="${id}"]`);
        assert.equal(await page.$$eval('#surface-panel > iframe', frames => frames.length), 1);
        const frame = await (await page.$('#surface-panel > iframe')).contentFrame();
        await frame.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.body.innerText.trim().length > 100);
        return frame;
      }
      const platform = await current('platform');
      await platform.waitForSelector('.arco-menu-item');
      // 标记旧页面，确认切端会销毁运行时，而不是隐藏保活。
      await platform.evaluate(() => { window.__oldSurfaceMarker = true; });
      await page.click('#tab-tenant');
      const tenant = await current('tenant');
      assert.ok(platform.detached, '旧平台端必须卸载');
      await tenant.waitForSelector('.arco-menu-item');
      await tenant.evaluate(() => [...document.querySelectorAll('.arco-menu-item')].find(el => el.textContent.includes('通知中心')).click());
      await tenant.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.body.innerText.includes('通知配置'));
      await page.click('#tab-merchant');
      const merchant = await current('merchant');
      assert.ok(tenant.detached, '旧租户端必须卸载');
      assert.match(await merchant.evaluate(() => document.querySelector('iframe').contentDocument.body.innerText), /商户/);
      await page.goBack();
      await current('tenant');
      await page.goForward();
      await current('merchant');
      await page.focus('#tab-merchant');
      await page.keyboard.press('Home');
      const fresh = await current('platform');
      assert.equal(await fresh.evaluate(() => window.__oldSurfaceMarker), undefined);
      await page.reload({ waitUntil: 'load' });
      await current('platform');
      assert.deepEqual([...new Set(localRequests)], [url], '单文件不应请求其他本地文件');
      assert.deepEqual(errors, [], '不应出现脚本运行错误');
      await page.setViewport({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.$eval('#tab-merchant', el => el.getBoundingClientRect().right <= innerWidth), true);
      console.log('PASS 单文件离线/子路径、三端切换卸载、通知中心、键盘、历史与窄屏：', url);
      await page.close();
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})();
