// dist 冒烟：React 壳加载 → 租户平台钱包渲染 → 钱包弹窗 → 流水时间切换。
// 与当前统一导航和钱包 Demo 的构建产物保持一致。
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = 'file://' + process.argv[2];

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--allow-file-access-from-files']
    });
    const page = await browser.newPage();
    page.on('pageerror', error => console.log('PAGEERROR:', error.message.slice(0, 200)));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(DIST, { waitUntil: 'networkidle0', timeout: 30000 });

    await page.waitForSelector('.arco-menu-item', { timeout: 10000 });
    console.log('SHELL_OK React+Arco 壳渲染');

    const walletMenu = await page.waitForFunction(() => (
      [...document.querySelectorAll('.arco-menu-item')]
        .find(item => item.textContent.includes('租户平台钱包')) || null
    ), { timeout: 10000 });
    await walletMenu.asElement().click();

    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe');
      try {
        const inner = frame?.contentDocument;
        return Boolean(
          // 首页也包含同名表格和原型 API，必须等到目标文档完成切换。
          inner?.defaultView?.__UNIFIED_DEMO_HASH === 'wallets' &&
          inner?.querySelector('#tableBody tr') &&
          inner?.defaultView?.__HSPlatformPrototype?.getWalletRows
        );
      } catch {
        return false;
      }
    }, { timeout: 15000 });
    console.log('EMBED_OK 租户平台钱包经 embed 管线加载');

    const walletCount = await page.evaluate(() => {
      const inner = document.querySelector('iframe').contentDocument;
      return inner.defaultView.__HSPlatformPrototype.getWalletRows().length;
    });

    await page.evaluate(() => {
      document.querySelector('iframe').contentDocument
        .querySelector('#tableBody tr [data-detail]')?.click();
    });
    await page.waitForFunction(() => {
      const inner = document.querySelector('iframe').contentDocument;
      return Boolean(
        inner.querySelector('#drawer.open.wallet-modal') &&
        inner.querySelector('#drawerTitle')?.textContent.includes('租户钱包') &&
        inner.querySelectorAll('.wallet-detail-card').length === 3 &&
        inner.querySelector('[data-wallet-flow-section]')
      );
    }, { timeout: 5000 });
    console.log('MODAL_OPEN 租户钱包详情弹窗');

    for (const period of ['today', 'yesterday']) {
      await page.evaluate(selectedPeriod => {
        document.querySelector('iframe').contentDocument
          .querySelector(`[data-wallet-flow-period="${selectedPeriod}"]`)?.click();
      }, period);
      await page.waitForFunction(selectedPeriod => {
        const inner = document.querySelector('iframe').contentDocument;
        const tab = inner.querySelector(`[data-wallet-flow-period="${selectedPeriod}"]`);
        return tab?.getAttribute('aria-selected') === 'true' &&
          inner.querySelectorAll('[data-wallet-flow-section] tbody tr').length > 0;
      }, { timeout: 5000 }, period);
    }

    const result = await page.evaluate(() => {
      const inner = document.querySelector('iframe').contentDocument;
      return {
        title: inner.querySelector('#drawerTitle')?.textContent.trim(),
        cards: inner.querySelectorAll('.wallet-detail-card').length,
        flowRows: inner.querySelectorAll('[data-wallet-flow-section] tbody tr').length,
        activePeriod: inner.querySelector('[data-wallet-flow-period][aria-selected="true"]')?.textContent.trim()
      };
    });

    const pass = walletCount > 0 && result.cards === 3 && result.flowRows > 0 && result.activePeriod === '昨日';
    console.log('AFTER 钱包详情:', walletCount, '个租户钱包 |', result.title, '|', result.cards, '个钱包 |', result.activePeriod, result.flowRows, '条流水');
    console.log(pass ? 'DIST_SMOKE_PASS 钱包弹窗与流水时间切换链路完好' : 'DIST_SMOKE_FAIL');
    await page.screenshot({ path: 'smoke-dist.png' });
    process.exitCode = pass ? 0 : 1;
  } catch (error) {
    console.error('DIST_SMOKE_ERROR', error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
