// Local integration tests: no audio hardware or paid services needed.
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:1440,height:1080}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3000');await page.locator('#menuOpen:not([disabled])').waitFor();
 await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
 assert.equal(await page.locator('#cashierDialog').count(),0);assert.equal(await page.getByText('di su nombre',{exact:false}).count(),0);
 const cash=await ctx.newPage();cash.on('pageerror',e=>errors.push(e.message));await cash.goto('http://localhost:3000/caja.html');await cash.locator('#workspace:not([hidden])').waitFor();
 await page.bringToFront();await page.locator('#menuOpen').click();await page.locator('[data-category="Platos"]').click();await page.locator('.runway').waitFor();await page.mouse.move(0,0);
 assert.equal(await page.locator('.runway-group').count(),3);assert.equal(await page.locator('.runway-group').nth(1).locator('.runway-card').count(),5);
 const pos=await page.locator('.runway-viewport').evaluate(e=>e.scrollLeft);await page.waitForTimeout(700);const later=await page.locator('.runway-viewport').evaluate(e=>e.scrollLeft);assert.ok(later>pos,'pasarela se mueve');
 await page.locator('[data-carousel="pause"]').click();const paused=await page.locator('.runway-viewport').evaluate(e=>e.scrollLeft);await page.waitForTimeout(250);assert.equal(await page.locator('.runway-viewport').evaluate(e=>e.scrollLeft),paused);
 await page.screenshot({path:'test-results/solo-desktop.png',fullPage:true});
 async function say(text){const modal=await page.locator('#optionsModal').evaluate(e=>e.open);const summary=await page.locator('#summaryModal').evaluate(e=>e.open);if(!modal&&!summary)await page.locator('.text-alternative').evaluate(e=>e.open=true);const id=modal?'modalText':summary?'summaryText':'chatText';await page.locator('#'+id).fill(text);await page.locator('#'+id).press('Enter');await page.waitForTimeout(160);await page.waitForFunction(()=>!document.getElementById('sendText').disabled);}
 await say('me apoyo');assert.match(await page.locator('#reply').textContent(),/medio pollo/);assert.equal(await page.locator('#cartCount').textContent(),'0');
 await say('medio pollo');assert.equal(await page.locator('#cartCount').textContent(),'1');
 await say('me llamo Hian');await page.locator('#summaryModal[open]').waitFor();await page.locator('[data-close="summaryModal"]').click();
 await say('muéstrame las bebidas');await say('sí');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mesero-brasa-v2-orders')||'[]').length),0,'sí fuera de revisión no envía');
 await page.locator('[data-close="summaryModal"]').click();await say('sin cebolla');
 await say('eso es todo');await page.locator('#summaryModal[open]').waitFor();assert.match(await page.locator('#summaryBody').textContent(),/sin cebolla/);
 await page.locator('#confirmButton').click();await cash.locator('.queue-card').waitFor();assert.match(await cash.locator('.queue-card').textContent(),/Hian/);assert.match(await cash.locator('.queue-card').textContent(),/sin cebolla/);
 assert.equal(await cash.locator('.queue-card').count(),1);await cash.locator('[data-status="aceptado"][data-order]').click();await cash.locator('.status-pill[data-status="aceptado"]').waitFor();
 const cash2=await ctx.newPage();await cash2.goto('http://localhost:3000/caja.html');await cash2.locator('.status-pill[data-status="aceptado"]').waitFor();
 await cash.locator('[data-status="preparando"][data-order]').click();await cash2.locator('.status-pill[data-status="preparando"]').waitFor();
 await cash.screenshot({path:'test-results/caja-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('#menuOpen:not([disabled])').waitFor();await page.screenshot({path:'test-results/home-mobile.png',fullPage:true});
 await page.locator('#menuOpen').click();await page.locator('[data-category="Platos"]').click();await page.waitForTimeout(400);await page.screenshot({path:'test-results/solo-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-close="optionsModal"]').click();await page.locator('#menuOpen').click();await page.locator('[data-category="Combos"]').click();assert.equal(await page.locator('[data-carousel="pause"]').textContent(),'Reanudar');
 await cash.setViewportSize({width:390,height:844});await cash.screenshot({path:'test-results/caja-mobile.png',fullPage:true});assert.equal(await cash.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: Solo, voz vía transcripción, aclaración, revisión segura, pasarela, caja en vivo entre pestañas, estados y móvil.');
})().catch(e=>{console.error(e);process.exit(1);});
