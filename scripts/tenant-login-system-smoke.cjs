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
    await page.setRequestInterception(true);
    page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href + '#tenant');
    const shell = await (await page.waitForSelector('#surface-panel > iframe')).contentFrame();
    await shell.waitForSelector('.arco-menu-item');
    async function open(id, selector) {
      await shell.evaluate(pageId => window.postMessage({ type: 'hs-unified-open-page', pageId }, '*'), id);
      const frame = await (await shell.waitForSelector('iframe')).contentFrame();
      await frame.waitForSelector(selector, { visible: true });
      return frame;
    }
    for (const [state, account, password, code, panel, row, submit, result] of [
      ['bound', 'admin@tenant.example', 'Tenant#2026', '246810', '#verifyPanel', '#otpRow', '#verifyBtn', '#verifyResult'],
      ['unbound', 'newadmin@tenant.example', 'Bind#2026', '135790', '#bindPanel', '#bindCodeRow', '#bindBtn', '#bindResult']
    ]) {
      const frame = await open('login', '#loginForm');
      await frame.click(`[data-demo-account-state="${state}"]`);
      await frame.$eval('#account', (el, value) => { el.value = value; }, account);
      await frame.$eval('#password', (el, value) => { el.value = value; }, password);
      await frame.click('#loginButton');
      await frame.waitForSelector(panel, { visible: true });
      // OTP fields have stable accessible groups; bound group lives inside verifyPanel.
      const fields = state === 'bound' ? '#verifyPanel .code-row input' : row + ' input';
      await frame.$$eval(fields, (els, code) => els.forEach((el, i) => { el.value = code[i]; el.dispatchEvent(new Event('input', { bubbles: true })); }), '000000');
      await frame.click(submit);
      assert.equal(await frame.$eval(result, el => el.classList.contains('hidden')), true);
      await frame.$$eval(fields, (els, code) => els.forEach((el, i) => { el.value = code[i]; el.dispatchEvent(new Event('input', { bubbles: true })); }), code);
      await frame.click(submit);
      await frame.waitForSelector(result, { visible: true });
      assert.match(await frame.$eval(result, el => el.textContent), /登录成功|验证已通过|已绑定/);
      console.log('PASS 统一 Demo 租户登录：', state, '错误验证码拦截、正确验证码通过');
    }
    const system = await open('accounts', '#accountRows [data-repair-account]');
    assert.equal(await system.$$eval('#view-accounts th', els => els.some(el => el.textContent.trim() === '数据范围')), false);
    await system.click('#accountRows [data-repair-account]');
    await system.waitForSelector('form[data-form="accountRepairLimits"]');
    const set = (name, value) => system.$eval(`[name="${name}"]`, (el, value) => { el.value = value; }, value);
    await set('repairDailyCount', '5');
    await set('repairDailyAmount', '100');
    await set('repairSingleAmount', '200');
    await system.click('form[data-form="accountRepairLimits"] [type="submit"]');
    assert.match(await system.$eval('form[data-form="accountRepairLimits"] [data-error]', el => el.textContent), /不能超过/);
    await set('repairSingleAmount', '20');
    await system.click('form[data-form="accountRepairLimits"] [type="submit"]');
    await system.waitForSelector('form[data-form="accountRepairLimits"]', { hidden: true });
    assert.match(await system.$eval('#accountRows tr', el => el.textContent), /每日可补单数：5/);
    await system.click('#accountRows [data-repair-account]');
    assert.equal(await system.$eval('[name="repairSingleAmount"]', el => el.value), '20.00');
    assert.equal(await page.$$eval('#surface-panel > iframe', els => els.length), 1);
    assert.deepEqual(errors, []);
    console.log('PASS 统一 Demo 账户管理：补单限制展示、金额校验、保存回显、数据范围列移除');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
