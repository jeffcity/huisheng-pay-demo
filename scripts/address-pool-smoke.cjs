const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const {tmpdir}=require('node:os');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>{if(/^https?:/.test(r.url())){requests.push(r.url());r.abort()}else r.continue()});
  await page.setViewport({width:1440,height:1000});
  await page.goto(pathToFileURL(resolve(__dirname,'../dist/index.html')).href+'#address',{waitUntil:'load'});
  async function shell(){await page.waitForSelector('iframe[data-active-surface="address"]');assert.equal(await page.$$eval('#surface-panel>iframe',xs=>xs.length),1);return(await page.$('#surface-panel>iframe')).contentFrame()}
  async function business(f,selector){await f.waitForFunction(s=>!!document.querySelector('#content iframe')?.contentDocument?.querySelector(s),{},selector);assert.equal(await f.$$eval('#content>iframe',xs=>xs.length),1);return(await f.$('#content>iframe')).contentFrame()}
  let f=await shell(),wallet=await business(f,'#tbody tr');
  assert.equal(await wallet.$$eval('#tbody tr',xs=>xs.length),4);
  assert.deepEqual(await wallet.$$eval('#f-owner option',xs=>xs.map(x=>x.textContent)),['请选择地址归属','汇盛','美人桥','汇盛商户代付充值']);
  await wallet.select('#f-currency','TRX');await wallet.click('#btn-search');assert.equal(await wallet.$$eval('#tbody tr',xs=>xs.length),1);
  assert.match(await wallet.$eval('#tbody',e=>e.innerText),/HS-TRX-N-L1/);
  await wallet.click('#btn-reset');assert.equal(await wallet.$$eval('#tbody tr',xs=>xs.length),4);
  await wallet.click('#btn-add');await wallet.waitForSelector('#mask.show');
  assert.equal(await wallet.$eval('#m-owner',e=>e.value),'HUI_SHENG');
  await wallet.click('#btn-ok');assert.equal(await wallet.$eval('#e-name',e=>e.classList.contains('show')),true);
  async function fill(sel,value){await wallet.$eval(sel,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))},value)}
  await fill('#m-name','汇盛独立地址回归');await wallet.select('#m-pool','0');
  await wallet.waitForFunction(()=>document.querySelector('#m-layer').options.length>1);await wallet.select('#m-layer','HS-TRX-N-L1');
  await fill('#m-address','THuishengAddressPoolSmokeOnly1234567');await wallet.click('#btn-ok');
  await wallet.waitForFunction(()=>!document.querySelector('#mask').classList.contains('show'));
  assert.equal(await wallet.$$eval('#tbody tr',xs=>xs.length),5);assert.match(await wallet.$eval('#tbody tr',e=>e.innerText),/汇盛独立地址回归/);
  await wallet.click('#btn-add');await wallet.select('#m-owner','MEI_REN_BRIDGE');
  assert.equal(await wallet.$eval('#m-sign',e=>e.disabled),false);assert.equal(await wallet.$eval('#m-pool',e=>e.disabled),true);await wallet.click('#btn-cancel');
  await f.click('[data-page="address-amount-level"]');assert.equal(wallet.detached,true);
  let levels=await business(f,'#tierBody tr');assert.equal(await levels.$$eval('#tierBody tr',xs=>xs.length),3);
  assert.match(await levels.$eval('#ownerHint',e=>e.textContent),/TRX.*汇盛/);
  await levels.click('#btnAdd');assert.equal(await levels.$$eval('#tierBody tr',xs=>xs.length),4);
  await levels.click('#btnSave');assert.match(await levels.$eval('#toast',e=>e.textContent),/已保存 TRX/);
  await levels.click('[data-currency="USDT"]');assert.equal(await levels.$$eval('#tierBody tr',xs=>xs.length),3);
  assert.match(await levels.$eval('#mapBody',e=>e.innerText),/HS-USDT/);
  await levels.click('[data-currency="TRX"]');assert.equal(await levels.$$eval('#tierBody tr',xs=>xs.length),4);
  // Switching surfaces destroys the old end. A fresh visit retains the original prototype reset behavior.
  for(const id of ['tenant','merchant','beauty','platform','address']){
   const old=f;await page.click('#tab-'+id);await page.waitForSelector('iframe[data-active-surface="'+id+'"]');assert.equal(await page.$$eval('#surface-panel>iframe',xs=>xs.length),1);if(id==='tenant')assert.equal(old.detached,true);
  }
  f=await shell();wallet=await business(f,'#tbody tr');assert.equal(await wallet.$$eval('#tbody tr',xs=>xs.length),4);
  for(const width of [962,390]){
   await page.setViewport({width,height:959});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.$$eval('.tabs button',xs=>xs.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})),true);
   assert.equal(await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewport({width:1440,height:1000});await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));await page.screenshot({path:resolve(tmpdir(),'hs-address-pool-wallet.png')});
  await f.click('[data-page="address-amount-level"]');levels=await business(f,'#tierBody tr');await page.screenshot({path:resolve(tmpdir(),'hs-address-pool-levels.png')});
  assert.deepEqual(requests,[],'地址池必须完全内联，不能访问蓝盛或其他服务');assert.deepEqual(errors,[]);
  console.log('PASS 地址池：筛选/新增/校验/美人桥归属、币种独立层级、保存、五端卸载与窄屏、离线独立运行');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
