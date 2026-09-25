const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href + '#merchant');
    const shell = await (await page.waitForSelector('#surface-panel > iframe')).contentFrame();
    const frame = await (await shell.waitForSelector('#demoFrame')).contentFrame();
    await frame.waitForSelector('#loginAccount', { visible: true });
    await frame.type('#loginAccount', 'admin@xinghe');
    await frame.type('#loginPassword', 'merchant-demo');
    await frame.click('#loginNext');
    await frame.waitForSelector('#loginOtp', { visible: true });
    await frame.type('#loginOtp', '382641');
    await frame.click('#loginNext');
    await frame.waitForSelector('[data-page="notificationBots"]', { visible: true });
    await frame.click('[data-page="notificationBots"]');
    await frame.waitForSelector('[data-notify-action="edit-bot"]', { visible: true });
    await frame.click('[data-notify-action="edit-bot"]');
    await frame.waitForSelector('#notifyBotToken', { visible: true });
    assert.equal(await frame.$eval('#notifyBotToken', el => el.value), '');
    await frame.click('#notifyBotModal [data-close]');
    await frame.click('[data-page="notificationConfigs"]');
    await frame.waitForSelector('[data-notify-action="edit-config"]', { visible: true });
    await frame.click('[data-notify-action="edit-config"]');
    await frame.waitForSelector('#notifyWindow', { visible: true });
    await frame.$eval('#notifyWindow', el => { el.value = '15'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await frame.$eval('#notifyThreshold', el => { el.value = '8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await frame.click('#notifyConfigForm [type="submit"]');
    await frame.waitForSelector('#notifyConfigModal', { hidden: true });
    assert.match(await frame.$eval('#notifyConfigRows', el => el.textContent), /15 分钟内失败达到 8 次/);
    assert.equal(await page.$$eval('#surface-panel > iframe', els => els.length), 1);
    assert.deepEqual(errors, []);
    console.log('PASS 统一 Demo 商户端：登录、通知机器人 Token 不回显、消息通知阈值编辑和保存');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
