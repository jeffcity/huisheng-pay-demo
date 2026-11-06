const assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),{pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--allow-file-access-from-files']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
 await page.goto(pathToFileURL(path.resolve(process.argv[2]||'dist/index.html')).href+'#tenant');
 let shell,frame;const open=async()=>{shell=await(await page.waitForSelector('#surface-panel > iframe')).contentFrame();await shell.waitForSelector('.arco-menu-item');await shell.evaluate(()=>[...document.querySelectorAll('.arco-menu-item')].find(e=>e.textContent.trim()==='代收通道管理').click());await shell.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('[data-collection-code]'));frame=await(await shell.$('iframe')).contentFrame();};await open();
 const cloud='CH-FIAT-IN-027',code=id=>`${cloud}-CODE-${id}`,rowSelector=`[data-collection-parent="${cloud}"][data-collection-code]`;
 const click=async selector=>{await frame.focus(selector);await page.keyboard.press('Enter');};
 const shown=()=>frame.$$eval(rowSelector,els=>els.map(el=>el.dataset.collectionCode));
 assert.equal((await shown()).length,3);assert.match(await frame.$eval(`[data-collection-fold="${cloud}"]`,e=>e.textContent),/查看全部（7）/);
 const defaultVisible=await frame.$$eval('[data-code-select]',els=>els.length);await frame.click('[data-select-all]');assert.equal(await frame.$$eval('[data-code-select]:checked',els=>els.length),defaultVisible);
 await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);assert.equal((await shown()).length,7);assert.equal(await frame.$$eval('[data-code-select]:checked',els=>els.length),defaultVisible,'展开不会选中隐藏项');
 await frame.click(`[data-code-select="${code(7)}"]`);await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);assert.match(await frame.$eval('#selectionCount',e=>e.textContent),/含隐藏 1 个/);
 await click('[data-action="bulkDelete"]');assert.match(await frame.$eval('#modalBody',e=>e.textContent),/CM8700/);await click('#modalFoot [data-action="close"]');assert.equal((await shown()).length,3,'取消删除保留数据');
 await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);await click(`[data-action="collectionFavorite"][data-code="${code(7)}"]`);assert.equal((await shown())[0],code(7));await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);assert.equal((await shown())[0],code(7),'收起保留常用置前');
 await page.reload();await open();assert.equal((await shown())[0],code(7),'同账号重载保留常用');
 // Limit is per parent across all codes, including those hidden by folding/search.
 await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);
 await click(`[data-action="collectionFavorite"][data-code="${code(1)}"]`);await click(`[data-action="collectionFavorite"][data-code="${code(2)}"]`);
 await click(`[data-action="collectionFavorite"][data-code="${code(3)}"]`);assert.match(await frame.$eval('#toastText',e=>e.textContent),/最多设置3个常用/);
 assert.equal(await frame.$eval(`[data-action="collectionFavorite"][data-code="${code(3)}"]`,e=>e.getAttribute('aria-pressed')),'false');
 assert.equal(await frame.$$eval(`${rowSelector} .collection-favorite[aria-pressed="true"]`,els=>els.length),3);
 await click('[data-action="collectionFavorite"][data-code="CH-FIAT-IN-001-CODE-1"]');assert.equal(await frame.$eval('[data-action="collectionFavorite"][data-code="CH-FIAT-IN-001-CODE-1"]',e=>e.getAttribute('aria-pressed')),'true','其他父通道独立计数');
 await click(`[data-action="collectionFavorite"][data-code="${code(1)}"]`);await click(`[data-action="collectionFavorite"][data-code="${code(3)}"]`);assert.equal(await frame.$eval(`[data-action="collectionFavorite"][data-code="${code(3)}"]`,e=>e.getAttribute('aria-pressed')),'true','取消后可设置其他常用');
 await click(`[data-action="collectionFavorite"][data-code="${code(3)}"]`);await click(`[data-action="collectionFavorite"][data-code="${code(2)}"]`);await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);
 // Upgrade a stored preference created before the limit existed.
 await frame.evaluate(()=>{const key=JSON.stringify(['hs.collection.favorites','HS-TEN-001',window.parent.__HSOwnAccountDemo.getAccount()]);localStorage.setItem(key,JSON.stringify([1,2,3,7].map(i=>'CH-FIAT-IN-027-CODE-'+i)));});
 await page.reload();await open();assert.equal(await frame.$$eval(`${rowSelector} .collection-favorite[aria-pressed="true"]`,els=>els.length),3);
 assert.equal(await frame.evaluate(()=>{const key=JSON.stringify(['hs.collection.favorites','HS-TEN-001',window.parent.__HSOwnAccountDemo.getAccount()]);return JSON.parse(localStorage.getItem(key)).length;}),3,'历史超限清理后保存');
 // Restore the single favorite used by the rest of this scenario.
 await click(`[data-action="collectionFavorite"][data-code="${code(1)}"]`);await click(`[data-action="collectionFavorite"][data-code="${code(2)}"]`);await click(`[data-action="collectionFavorite"][data-code="${code(3)}"]`);
 await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);await click(`[data-action="collectionFavorite"][data-code="${code(7)}"]`);await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);

 await shell.evaluate(()=>window.__HSOwnAccountDemo.setCurrent('other@tenant.example','test','246810'));await click('[data-action="search"]');assert.notEqual((await shown())[0],code(7),'账号隔离');
 await shell.evaluate(()=>window.__HSOwnAccountDemo.setCurrent('admin@tenant.example','Tenant#2026','246810'));await click('[data-action="search"]');assert.equal((await shown())[0],code(7));
 // Selection must not rebuild the rate input or lose an in-progress value.
 await click(`[data-action="editCollectionRate"][data-code="${code(1)}"]`);await frame.$eval(`[data-collection-rate="${code(1)}"]`,e=>e.value='0.009');await frame.click(`[data-code-select="${code(1)}"]`);assert.equal(await frame.$eval(`[data-collection-rate="${code(1)}"]`,e=>e.value),'0.009');assert.equal(await frame.$eval(`[data-collection-rate="${code(1)}"]`,e=>e.readOnly),false);
 await click(`[data-action="collectionExpand"][data-id="${cloud}"]`);assert.equal((await shown()).length,3,'编辑期间不展开重排');assert.match(await frame.$eval('#toastText',e=>e.textContent),/先确定或取消/);
 await click(`[data-action="saveCollectionRate"][data-code="${code(1)}"]`);assert.equal(await frame.evaluate(()=>window.HSProviderDemo.tenantData().channels.find(c=>c.id==='CH-FIAT-IN-027').collectionTypes[0].rate),'0.009');
 await frame.$eval('#keyword',e=>{e.value='银行卡备用';e.dispatchEvent(new Event('input',{bubbles:true}));});await click('[data-action="search"]');assert.deepEqual(await shown(),[code(4)],'隐藏子通道名称可搜');
 await click('#collectionBatchSearch');assert.equal(await frame.evaluate(()=>document.activeElement.id),'collectionSearchTerms');await frame.$eval('#collectionSearchTerms',e=>e.value='FC8002\nCM8700；FC8002');await click('[data-action="applyCollectionBatchSearch"]');assert.equal(await frame.$$eval('[data-collection-code]',els=>els.length),2);assert.match(await frame.$eval('#tableBody',e=>e.textContent),/FC8002/);assert.match(await frame.$eval('#tableBody',e=>e.textContent),/CM8700/);
 await frame.$eval('#keyword',e=>{e.value='';const data=new DataTransfer();data.setData('text/plain','QP1001\nCM8600');e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});await frame.focus('#keyword');await page.keyboard.press('Enter');assert.equal(await frame.$$eval('[data-collection-code]',els=>els.length),2,'多行粘贴分项保留');
 await frame.$eval('#keyword',e=>e.value='no-such-code');await click('[data-action="search"]');assert.equal(await frame.$$eval('[data-collection-code]',els=>els.length),0);assert.equal(await frame.$eval('[data-select-all]',e=>e.disabled),true);
 await click('[data-action="reset"]');assert.equal((await shown()).length,3);assert.equal(await frame.$eval('#keyword',e=>e.value),'');
 // Existing code actions are still usable.
 await click('[data-collection-code="CH-FIAT-IN-018-CODE-1"] td.code-ops details summary');await click('[data-action="test"][data-code="CH-FIAT-IN-018-CODE-1"]');assert.match(await frame.$eval('#modalTitle',e=>e.textContent),/出码测试/);assert(await frame.$('#testProduct'));await click('#modalFoot [data-action="close"]');
 for(const width of [1440,999,680]){await page.setViewport({width,height:960});assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'只有表格横滚 '+width);}
 assert.deepEqual(errors,[]);console.log('COLLECTION_VISIBILITY_PASS 默认3条、每通道最多3个常用、历史超限兼容、独立展开、隐藏选择、删除确认、常用记忆与账号隔离、费率编辑、批量搜索、多行粘贴、空结果与窄屏');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
