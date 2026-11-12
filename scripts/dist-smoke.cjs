const assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),{pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--allow-file-access-from-files']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.goto(pathToFileURL(path.resolve(process.argv[2])).href);const shell=await(await page.waitForSelector('#surface-panel > iframe')).contentFrame();await shell.waitForSelector('.arco-menu-item');
 const menu=await shell.waitForFunction(()=>[...document.querySelectorAll('.arco-menu-item')].find(el=>el.textContent.includes('租户结算单')));await menu.asElement().click();await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('#settlementRows tr'));const frame=await(await shell.$('iframe')).contentFrame();
 assert.equal(await frame.$eval('#settlementMonth',el=>el.value),'2026-07');assert.equal(await frame.$$eval('#settlementRows tr',els=>els.length),5);assert.match(await frame.$eval('#settlementRows',el=>el.textContent),/63.05/);
 await frame.evaluate(()=>window.HSProviderDemo.setTenantBilling('HS-TEN-001',{collection:{mode:'percentage',value:'0.45'},payout:{mode:'perTransaction',value:'2'}}));await frame.click('#settlementSearch');await frame.click('[data-generate="HS-TEN-001"]');await frame.waitForSelector('#settlementBackdrop.show');assert.match(await frame.$eval('#settlementDetail',el=>el.textContent),/63.05/);assert.equal(await frame.$eval('#settlementDetail',el=>el.textContent.includes('ST-202607-001')),true);await frame.click('#settlementClose');await frame.click('[data-view="HS-TEN-001"]');assert.match(await frame.$eval('#settlementDetail',el=>el.textContent),/59.05/);await frame.click('#settlementClose');await frame.$eval('#settlementMonth',el=>el.value='2026-08');await frame.click('#settlementSearch');assert.equal(await frame.$$eval('#settlementRows [data-generate]:not([disabled])',els=>els.length),0); const grantMenu=await shell.waitForFunction(()=>[...document.querySelectorAll('.arco-menu-item')].find(el=>el.textContent.trim()==='通道商授权'));await grantMenu.asElement().click();await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('#tenantFilter'));const gf=await(await shell.$('iframe')).contentFrame();
 await gf.waitForSelector('#grantEmpty');assert.equal(await gf.$eval('#tenantFilter',el=>el.value),'');assert.equal(await gf.$eval('#grantWorkspace',el=>el.hidden),true);
 await gf.select('#tenantFilter','HS-TEN-001');assert.equal(await gf.$eval('#grantWorkspace',el=>el.hidden),false);assert.equal(await gf.$$eval('[data-provider-row]',els=>els.length),await gf.evaluate(()=>window.HSProviderDemo.providers.filter(p=>p.adapterStatus==='已接入').length));assert.equal(await gf.$('[data-provider="V-004"][data-direction="代收"]'),null);
 const otherGrants=await gf.evaluate(()=>JSON.stringify(window.HSProviderDemo.grants.filter(g=>g.tenantId!=='HS-TEN-001')));
 const change='[data-provider="V-001"][data-direction="代付"]';await gf.click(change);assert.equal(await gf.$eval('#saveButton',el=>el.disabled),false);
 await gf.type('#keyword','Bridge');assert.equal(await gf.$('[data-provider-row="V-001"]'),null);assert.match(await gf.$eval('#pendingCount',el=>el.textContent),/1/);await gf.click('[data-action="reset"]');assert.equal(await gf.$eval(change,el=>el.checked),false);
 await gf.select('#tenantFilter','HS-TEN-017');assert.match(await gf.$eval('#modalTitle',el=>el.textContent),/切换租户/);await gf.click('#modalFoot [data-action="close"]');assert.equal(await gf.$eval('#tenantFilter',el=>el.value),'HS-TEN-001');assert.equal(await gf.$eval(change,el=>el.checked),false);
 await gf.click('#saveButton');await gf.type('#grantReason','租户工作区方向调整');await gf.type('#grantMfa','000000');await gf.click('[data-action="saveGrant"]');assert.match(await gf.$eval('#formError',el=>el.textContent),/验证未通过/);assert.equal(await gf.evaluate(()=>window.HSProviderDemo.grantDirections('HS-TEN-001','V-001').includes('代付')),true);
 await gf.type('#grantMfa','123456');await gf.click('[data-action="saveGrant"]');assert.equal(await gf.evaluate(()=>window.HSProviderDemo.grantDirections('HS-TEN-001','V-001').includes('代付')),false);assert.equal(await gf.evaluate(()=>JSON.stringify(window.HSProviderDemo.grants.filter(g=>g.tenantId!=='HS-TEN-001'))),otherGrants);assert.equal(await gf.$eval('#saveButton',el=>el.disabled),true);
 await gf.select('#tenantFilter','HS-TEN-046');await gf.select('#grantFilter','unauthorized');assert(await gf.$$eval('[data-provider-row]',els=>els.length)>0);await gf.click('[data-action="reset"]');
 const initial=await gf.evaluate(()=>JSON.stringify(window.HSProviderDemo.grants));await gf.click('[data-provider="V-001"][data-direction="代付"]');await gf.click('#saveButton');await gf.click('#modalFoot [data-action="close"]');assert.equal(await gf.evaluate(()=>JSON.stringify(window.HSProviderDemo.grants)),initial);await gf.click('#discardButton');assert.equal(await gf.$eval('#saveButton',el=>el.disabled),true);
 await page.setViewport({width:375,height:900});assert.equal(await gf.$eval('.grant-tenant-picker select',el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right<=innerWidth+1;}),true);await gf.click('[data-provider="V-001"][data-direction="代付"]');await gf.click('#saveButton');assert.equal(await gf.$eval('.modal',el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}),true);await gf.click('#modalFoot [data-action="close"]');await page.setViewport({width:1440,height:1000});
 console.log('PLATFORM_GRANT_WORKSPACE_PASS 先选租户、全通道商、方向限制、跨筛选草稿、切换确认、统一MFA保存、其他租户隔离、取消及窄屏');

 const tenantsMenu=await shell.waitForFunction(()=>[...document.querySelectorAll('.arco-menu-item')].find(el=>el.textContent.trim()==='租户管理'));await tenantsMenu.asElement().click();
 await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('#tenantRows tr'));const tf=await(await shell.$('iframe')).contentFrame();
 assert.equal(await tf.$$eval('#tenantRows tr:first-child td',els=>els.length),8);
 assert.match(await tf.$eval('#tenantRows tr:first-child [data-tenant-metric="balances"]',el=>el.textContent),/936.94688/);
 await tf.focus('[data-billing="HS-TEN-001"]');await page.keyboard.press('Enter');await tf.waitForSelector('#tenantModal.open');assert.equal(await tf.$eval('#tenantModal',el=>el.classList.contains('billing-only')),true);assert(await tf.$('#tenantCollectionBillingValue'));assert(await tf.$('#tenantPayoutBillingValue'));
 await tf.click('#tenantModal [data-close-modal]');
 await tf.focus('[data-wallet-adjust="HS-TEN-001"]');await page.keyboard.press('Enter');await tf.waitForSelector('#walletAdjustModal.open');
 // Dialog initialization schedules focus on the next frame; let it settle before typing.
 await tf.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await tf.type('#walletAdjustAmount','10.00');await tf.type('#walletAdjustReason','平台系统费钱包补记');
 assert.equal(await tf.$eval('#walletAdjustBefore',el=>el.value),'936.94688');assert.equal(await tf.$eval('#walletAdjustAfter',el=>el.value),'946.94688');await tf.focus('#walletAdjustSubmit');await page.keyboard.press('Enter');
 await tf.waitForFunction(()=>!document.querySelector('#walletAdjustModal').classList.contains('open'));assert.equal(await tf.evaluate(()=>window.HSFeeWallets.wallet('HS-TEN-001').balance),'946.94688');
 assert.match(await tf.$eval('#tenantRows tr:first-child [data-tenant-metric="balances"]',el=>el.textContent),/946.94688/);
 await page.setViewport({width:999,height:960});assert.equal(await tf.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 console.log('PLATFORM_TENANT_METRICS_PASS 四项经营指标、系统费设置入口、共用系统费钱包调额、窄屏');
 await page.setViewport({width:1440,height:1000});
 const orderMenu=await shell.waitForFunction(()=>[...document.querySelectorAll('.arco-menu-item')].find(el=>el.textContent.trim()==='全局订单查询'));await orderMenu.asElement().click();
 await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('[data-success-amount="total"]'));const of=await(await shell.$('iframe')).contentFrame();
 const amounts=async frame=>frame.$$eval('[data-success-amount]',els=>els.map(el=>el.textContent));
 assert.equal(await of.$eval('#metrics',el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);
 assert.deepEqual(await amounts(of),['CNY 13,120.00','CNY 59,750.00','CNY 72,870.00']);
 await of.select('#pageFilter2','代付');await of.click('[data-apply-filters]');assert.deepEqual(await amounts(of),['CNY 0.00','CNY 59,750.00','CNY 59,750.00']);
 await of.select('#pageFilter3','失败');await of.click('[data-apply-filters]');assert.deepEqual(await amounts(of),['CNY 0.00','CNY 0.00','CNY 0.00']);
 await of.click('[data-reset-filters]');assert.equal((await amounts(of))[2],'CNY 72,870.00');

 const auditMenu=await shell.waitForFunction(()=>[...document.querySelectorAll('.arco-menu-item')].find(el=>el.textContent.trim()==='审计日志'));await auditMenu.asElement().click();
 await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('.audit-filter-row'));const af=await(await shell.$('iframe')).contentFrame();
 assert.equal(await af.$$eval('#filters [data-page-filter]',els=>els.length),8);assert.equal(await af.$$eval('#tableHead th',els=>els.length),10);
 assert.match(await af.$eval('#tableBody',el=>el.textContent),/HS-TEN-001/);assert.match(await af.$eval('#tableBody',el=>el.textContent),/HS-TEN-017/);assert.match(await af.$eval('#tableBody',el=>el.textContent),/租户/);
 await af.type('#pageFilter0','MCH-1188');await af.click('#filters [data-apply-filters]');assert.equal(await af.$$eval('#tableBody tr',els=>els.length),1);assert.match(await af.$eval('#tableBody',el=>el.textContent),/保存商户后台登录 IP 白名单/);
 await af.click('#tableBody [data-detail]');await af.waitForSelector('#drawer.open');assert.match(await af.$eval('#drawer',el=>el.textContent),/汇盛东南亚 \/ HS-TEN-001/);await page.keyboard.press('Escape');
 await af.click('#filters [data-reset-filters]');await af.select('#pageFilter1','tenant.finance');await af.click('#filters [data-apply-filters]');assert.equal(await af.$$eval('#tableBody tr',els=>els.length),2);
 await af.click('#filters [data-reset-filters]');await af.type('#pageFilter4','不存在的操作');await af.click('#filters [data-apply-filters]');assert.match(await af.$eval('#tableBody',el=>el.textContent),/当前条件没有数据/);await af.click('#filters [data-reset-filters]');
 for(const width of [1012,650]){await page.setViewport({width,height:960});assert.equal(await af.$eval('#filters',el=>el.scrollWidth<=el.clientWidth+1),true);assert.equal(await af.$eval('body',el=>el.scrollWidth<=innerWidth+1),true);}
 await page.setViewport({width:1440,height:1000});console.log('PLATFORM_AUDIT_QUERY_PASS 开发筛选、多租户日志、详情、重置、空数据及窄屏');
 await page.click('#tab-tenant');const ts=await(await page.waitForSelector('#surface-panel > iframe')).contentFrame();
 const trackMenu=await ts.waitForFunction(()=>[...document.querySelectorAll('.arco-menu-item')].find(el=>el.textContent.trim()==='全局订单追踪'));await trackMenu.asElement().click();
 await ts.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('[data-success-amount="total"]'));const tr=await(await ts.$('iframe')).contentFrame();
 assert.deepEqual(await amounts(tr),['CNY 8,600.00','CNY 9,800.00','CNY 18,400.00']);
 assert.equal(await tr.$eval('.tenant-tracking-page .metric-grid',el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);
 await tr.select('[data-filter-column="3"] select','代收退款');await tr.click('[data-action="search"]');assert.deepEqual(await amounts(tr),['CNY 0.00','CNY 0.00','CNY 0.00']);
 await tr.click('[data-action="reset"]');await tr.select('[data-tenant-page-size]','3');assert.equal((await amounts(tr))[2],'CNY 18,400.00');
 await tr.click('[data-action="page-next"]');assert.equal((await amounts(tr))[2],'CNY 18,400.00');
 await tr.type('[data-filter-column="2"] input','东盛电商');await tr.click('[data-action="search"]');assert.equal((await amounts(tr))[2],'CNY 0.00');await tr.click('[data-action="reset"]');
 await page.setViewport({width:650,height:900});assert.equal(await tr.$eval('.order-success-amounts',el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 assert.equal(await tr.$('.order-success-summary h2'),null);assert.equal(await tr.$('.order-success-summary p'),null);
 assert.equal(await tr.$$eval('.order-success-help-button',els=>els.length),3);
 await tr.hover('.order-success-help-button');assert.equal(await tr.$eval('.order-success-tooltip',el=>getComputedStyle(el).display),'block');assert.match(await tr.$eval('.order-success-tooltip',el=>el.textContent),/成功收款.*不含退款/);
 await tr.hover('.page-title');assert.equal(await tr.$eval('.order-success-tooltip',el=>getComputedStyle(el).display),'none');await tr.focus('.order-success-help-button');assert.equal(await tr.$eval('.order-success-tooltip',el=>getComputedStyle(el).display),'block');
 await page.keyboard.press('Tab');assert.equal(await tr.$eval('.order-success-tooltip',el=>getComputedStyle(el).display),'none');
 console.log('GLOBAL_ORDER_SUCCESS_AMOUNTS_PASS 两端成功金额、退款失败排除、筛选重置、全分页及窄屏');

 await page.setViewport({width:1440,height:1000});
 for(const [label,timeIndex,firstId] of [['CNY 代收订单',8,'HS-C-260717-000031'],['CNY 代付订单',11,'HS-P-260717-000336']]){
  const bm=await ts.waitForFunction(text=>[...document.querySelectorAll('.arco-menu-item')].find(el=>el.textContent.trim()===text),{},label);await bm.asElement().click();
  await ts.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('[data-business-order-time]'));const bf=await(await ts.$('iframe')).contentFrame();
  assert.equal(await bf.$$eval('main .order-time-stack',els=>els.length),6);assert.equal(await bf.$$eval('main .order-time-line',els=>els.length),24);
  assert.match(await bf.$eval('main thead',el=>el.textContent),/订单时间（UTC\+8）/);
  const exported=await bf.evaluate(()=>tenantExportRows(state.activePage));assert.equal(exported.rowSnapshot.length,6);assert.equal(exported.fieldSnapshot[timeIndex],'订单时间（UTC+8）');for(const row of exported.rowSnapshot){assert.equal(row.length,exported.fieldSnapshot.length);for(const text of ['提交：','支付：','通道回调：','通知商户：'])assert(row[timeIndex].includes(text));}
  if(label==='CNY 代收订单'){await bf.click('main tbody tr:first-child .order-more summary');await bf.click('main tbody tr:first-child [data-action="order-detail"]');}else await bf.click('main tbody tr:first-child [data-action="blue-payout-detail"]');
  await bf.waitForSelector('#drawer.show');const detail=await bf.$eval('#drawer',el=>el.textContent);for(const text of ['提交时间','支付时间','通道回调时间','通知商户时间'])assert(detail.includes(text));assert(detail.includes(firstId));await page.keyboard.press('Escape');
  for(const width of [1012,650]){await page.setViewport({width,height:960});assert.equal(await bf.$eval('main',el=>el.scrollWidth<=el.clientWidth+1),true);assert.equal(await bf.$$eval('main .order-time-value',els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true);}
  await page.setViewport({width:1440,height:1000});
 }
 console.log('TENANT_BUSINESS_ORDER_TIMES_PASS 两订单页四时间、详情导出、列对齐及宽窄布局');
 assert.deepEqual(errors,[]);console.log('DIST_SMOKE_PASS 月结统计、费率计算、生成回显与无订单月份检查通过');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
