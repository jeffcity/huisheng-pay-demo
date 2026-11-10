const assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),{pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--allow-file-access-from-files']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:960});await page.goto(pathToFileURL(path.resolve(process.argv[2]||'dist/index.html')).href+'#tenant');
 const shell=await(await page.waitForSelector('#surface-panel > iframe')).contentFrame();await shell.waitForSelector('.arco-menu-item');await shell.evaluate(()=>[...document.querySelectorAll('.arco-menu-item')].find(e=>e.textContent.trim()==='已授权通道商').click());await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('#providerBusinessTabs'));
 let frame=await(await shell.$('iframe')).contentFrame();const click=async s=>{for(const target of await frame.$$(s)){if(await target.isVisible()){await target.focus();await page.keyboard.press('Enter');return;}}throw new Error('没有可见控件：'+s);};
 assert.equal(await frame.$eval('#providerUsageTabs',e=>e.hidden),true);
 await click('[data-provider-business="代付"]');assert.equal(await frame.$eval('[data-provider-usage="used"]',e=>e.getAttribute('aria-selected')),'true');assert.equal(await frame.$$eval('[data-payout-provider]',e=>e.length),4);
 const compact=await frame.evaluate(()=>({row:document.querySelector('#tableBody tr').getBoundingClientRect().height,width:document.querySelector('#dataTable').getBoundingClientRect().width,top:document.querySelector('.tenant-page-table').getBoundingClientRect().top,columns:document.querySelectorAll('#tableHead th').length,unrelatedFilter:getComputedStyle(document.querySelector('#productCodeFilter')).display}));
 assert(compact.row<=58,'常规行高不超过开发页示例');assert(compact.width<=1500,'常规表宽收紧');assert(compact.top<350,'压缩重复标题和上方留白');assert.equal(compact.columns,16,'全部业务字段保留');assert.equal(compact.unrelatedFilter,'none','隐藏筛选不因布局覆盖出现');
 await frame.evaluate(()=>{const channels=window.HSProviderDemo.tenantData().channels.filter(c=>c.providerId==='V-001'&&c.direction==='代付'&&c.asset==='CNY');window.__densityBalances=channels.map(c=>[c.id,c.balance]);channels.forEach((c,i)=>c.balance=i===0?'9876543210.99':'0');});await click('[data-action="refresh"]');
 assert.match(await frame.$eval('[data-payout-provider="V-001"] td:nth-child(4)',e=>e.textContent),/9,876,543,210.99/);
 assert.equal(await frame.$eval('[data-payout-provider="V-001"] td:nth-child(4)',e=>e.scrollWidth<=e.clientWidth+1),true,'大金额完整显示不溢出单元格');
 await frame.evaluate(()=>{for(const [id,balance] of window.__densityBalances)window.HSProviderDemo.tenantData().channels.find(c=>c.id===id).balance=balance;});await click('[data-action="refresh"]');
 // The automatic-settlement switch is visible without increasing row height.
 const automatic='[data-action="providerAutoSettlement"][data-id="V-001"]';
 assert.equal(await frame.$eval(automatic,e=>e.getAttribute('aria-checked')),'false');await click(automatic);assert.match(await frame.$eval('#modalBody',e=>e.textContent),/00:00（UTC\+8）/);assert.match(await frame.$eval('#modalBody',e=>e.textContent),/TG/);await click('#modalFoot [data-action="close"]');assert.equal(await frame.$eval(automatic,e=>e.getAttribute('aria-checked')),'false');
 await click(automatic);await click('#modalFoot [data-action="providerConfirmAutoSettlement"]');assert.equal(await frame.$eval(automatic,e=>e.getAttribute('aria-checked')),'true');assert.match(await frame.$eval(automatic,e=>e.parentElement.textContent),/开启/);
 await click(automatic);await click('#modalFoot [data-action="providerConfirmAutoSettlement"]');assert.equal(await frame.$eval(automatic,e=>e.getAttribute('aria-checked')),'false');
 // Provider adjustment must select a concrete channel and keep both pages in sync.
 const providerBalanceCell='[data-payout-provider="V-001"] td:nth-child(4)';
 await click('[data-action="providerMoney"][data-id="V-001"][data-key="balance"]');
 assert.equal(await frame.$('#pmGoogle'),null);
 const choices=await frame.$$eval('#pmChannel option',els=>els.map(e=>e.value));assert.deepEqual(choices,['','CH-FIAT-OUT-006','CH-FIAT-OUT-022']);
 assert.equal(await frame.$eval('#pmChannel',e=>e.value),'');await frame.select('#pmChannel','CH-FIAT-OUT-022');assert.match(await frame.$eval('#pmChannelBalance',e=>e.textContent),/418,000.00/);
 await click('#modalFoot [data-action="close"]');assert.match(await frame.$eval(providerBalanceCell,e=>e.textContent),/1,051,800.00/,'取消不修改余额');
 await click('[data-action="providerMoney"][data-id="V-001"][data-key="balance"]');await frame.select('#pmChannel','CH-FIAT-OUT-022');
 await frame.click('input[name="pmOperation"][value="decrease"]');for(const [id,value] of Object.entries({pmAmount:'10000',pmRemark:'核对演示'}))await frame.$eval('#'+id,(e,v)=>e.value=v,value);
 await click('#modalFoot [data-action="providerRunMoney"]');assert.equal(await frame.$eval('#modalBackdrop',e=>e.classList.contains('show')),false);assert.match(await frame.$eval(providerBalanceCell,e=>e.textContent),/1,041,800.00/);
 await shell.evaluate(()=>[...document.querySelectorAll('.arco-menu-item')].find(e=>e.textContent.trim()==='代付通道管理').click());await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('[data-action="payoutMoney"][data-id="CH-FIAT-OUT-022"]'));frame=await(await shell.$('iframe')).contentFrame();
 assert.match(await frame.$eval('[data-action="payoutMoney"][data-id="CH-FIAT-OUT-022"][data-key="balance"]',e=>e.closest('tr').querySelector('.payout-balance').textContent),/408,000.00/);
 await click('[data-action="payoutMoney"][data-id="CH-FIAT-OUT-022"][data-key="balance"]');assert.equal(await frame.$('#paGoogle'),null);for(const [id,value] of Object.entries({paAmount:'10000',paRemark:'恢复演示'}))await frame.$eval('#'+id,(e,v)=>e.value=v,value);
 await click('#modalFoot [data-action="runPayoutMoney"]');assert.equal(await frame.$eval('#modalBackdrop',e=>e.classList.contains('show')),false);assert.match(await frame.$eval('[data-action="payoutMoney"][data-id="CH-FIAT-OUT-022"][data-key="balance"]',e=>e.closest('tr').querySelector('.payout-balance').textContent),/418,000.00/);
 await shell.evaluate(()=>[...document.querySelectorAll('.arco-menu-item')].find(e=>e.textContent.trim()==='已授权通道商').click());await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('#providerBusinessTabs'));frame=await(await shell.$('iframe')).contentFrame();await click('[data-provider-business="代付"]');assert.match(await frame.$eval(providerBalanceCell,e=>e.textContent),/1,051,800.00/,'通道页调额后通道商同步');
 // Total-prepayment adjustment also submits and resets without a Google field.
 await click('[data-action="providerMoney"][data-id="V-001"][data-key="totalPrepaid"]');assert.equal(await frame.$('#pmGoogle'),null);assert.doesNotMatch(await frame.$eval('#modalBody',e=>e.textContent),/谷歌验证|演示验证码/);
 for(const [id,value] of Object.entries({pmAmount:'100',pmRemark:'预付演示'}))await frame.$eval('#'+id,(e,v)=>e.value=v,value);
 await click('#modalFoot [data-action="providerRunMoney"]');assert.match(await frame.$eval('#providerResult',e=>e.textContent),/0.00 → 100.00/);
 await click('[data-action="providerResetMoney"]');assert.equal(await frame.$eval('#pmAmount',e=>e.value),'');assert.equal(await frame.$eval('#pmRemark',e=>e.value),'');await click('#modalFoot [data-action="close"]');
 // Test-only fixtures: 22 authorized providers, two used; no mutation of shipping seed data.
 await frame.evaluate(()=>{const m=window.HSProviderDemo,d=m.tenantData();d.channels=d.channels.filter(c=>c.direction!=='代付'||['V-001','V-003'].includes(c.providerId));for(let i=5;i<=22;i++){const id='TEST-'+i;m.providers.push({id,name:'演示代付通道商'+i,directions:['代付']});m.grants.push({id:'GRANT-'+i,tenantId:m.tenantId,providerId:id,directions:['代付'],status:'已授权'});}});
 await click('[data-action="refresh"]');assert.equal(await frame.$$eval('[data-payout-provider]',e=>e.length),2);assert.match(await frame.$eval('#providerUsageTabs',e=>e.textContent),/未使用20/);
 await frame.click('[data-select-providers]');assert.equal(await frame.$$eval('[data-provider-select]:checked',e=>e.length),2);assert.equal(await frame.$eval('[data-select-providers]',e=>e.checked),true);
 await click('[data-provider-usage="unused"]');assert.equal(await frame.$$eval('[data-provider-select]:checked',e=>e.length),0);assert.equal(await frame.$$eval('[data-payout-provider]',e=>e.length),10);assert.match(await frame.$eval('#recordCount',e=>e.textContent),/20/);
 await click('[data-action="pageNext"]');assert.equal(await frame.$$eval('[data-payout-provider]',e=>e.length),10);
 await frame.type('#keyword','TEST-22');await frame.focus('#keyword');await page.keyboard.press('Enter');assert.equal(await frame.$$eval('[data-payout-provider]',e=>e.length),1);assert.match(await frame.$eval('#providerPayoutOverview',e=>e.textContent),/通道商数量：1/);
 await click('[data-action="providerSettleAll"]');assert.match(await frame.$eval('#modalBody',e=>e.textContent),/演示代付通道商22/);assert.doesNotMatch(await frame.$eval('#modalBody',e=>e.textContent),/QuickPay/);await click('#modalFoot [data-action="close"]');
 await click('[data-provider-usage="used"]');assert.equal(await frame.$eval('#keyword',e=>e.value),'');assert.equal(await frame.$$eval('[data-payout-provider]',e=>e.length),2);
 // A new payout channel changes groups on refresh, even when disabled and without orders.
 await frame.evaluate(()=>window.HSProviderDemo.tenantData().channels.push({id:'usage-created',tenantId:'HS-TEN-001',direction:'代付',providerId:'TEST-22',status:'关闭',today:0}));await click('[data-action="refresh"]');assert.equal(await frame.$$eval('[data-payout-provider]',e=>e.length),3);
 await frame.evaluate(()=>{const d=window.HSProviderDemo.tenantData();d.channels=d.channels.filter(c=>c.id!=='usage-created');});await click('[data-action="refresh"]');assert.equal(await frame.$$eval('[data-payout-provider]',e=>e.length),2);
 for(const width of [999,680]){await page.setViewport({width,height:960});assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'only table scrolls '+width);}
 await click('[data-provider-business="代收"]');assert.equal(await frame.$eval('#providerUsageTabs',e=>e.hidden),true);assert.equal(await frame.$$eval('#tableBody tr',e=>e.length),3);assert.deepEqual(errors,[]);
 console.log('PAYOUT_PROVIDER_USAGE_PASS 22家授权／2家使用、分组计数、分页搜索、选择隔离、结算范围、通道增删归组、代收边界与窄屏');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
