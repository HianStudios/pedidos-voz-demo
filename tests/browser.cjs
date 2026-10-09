// Local integration tests: no audio hardware or paid services needed.
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:1280,height:800}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3000/?mesa=7');await page.locator('#menuOpen:not([disabled])').waitFor();
 assert.equal(await page.locator('#tableNumber').textContent(),'7');assert.equal(await page.locator('a[href="/caja.html"]').count(),0,'la mesa no enlaza a caja');
 await page.screenshot({path:'test-results/home-desktop.png'});
 const cash=await ctx.newPage();cash.on('pageerror',e=>errors.push(e.message));await cash.goto('http://localhost:3000/caja.html');await cash.locator('#workspace:not([hidden])').waitFor();
 await page.bringToFront();await page.locator('#menuOpen').click();await page.locator('.door').first().waitFor();assert.equal(await page.locator('.door').count(),4);
 await page.waitForTimeout(800);await page.screenshot({path:'test-results/menu-desktop.png'});
 await page.locator('.door[data-category="Platos"]').click();await page.locator('.dish').first().waitFor();assert.equal(await page.locator('.dish').count(),5);
 assert.equal(await page.locator('#tabs [data-category="Platos"]').getAttribute('aria-current'),'true');
 await page.waitForTimeout(900);await page.screenshot({path:'test-results/platos-desktop.png'});
 async function say(text){const modal=await page.locator('#optionsModal').evaluate(e=>e.open);const summary=await page.locator('#summaryModal').evaluate(e=>e.open);const id=modal?'modalText':summary?'summaryText':'chatText';if(id==='chatText'&&await page.locator('#composer').isHidden())await page.locator('#keyboardOpen').click();await page.locator('#'+id).fill(text);await page.locator('#'+id).press('Enter');await page.waitForTimeout(160);await page.waitForFunction(()=>!document.getElementById('sendText').disabled);}
 await say('me apoyo');assert.match(await page.locator('#reply').textContent(),/medio pollo/);assert.equal(await page.locator('#cartCount').textContent(),'0');
 await say('medio pollo');assert.equal(await page.locator('#cartCount').textContent(),'1');assert.match(await page.locator('#reply').textContent(),/Va un medio pollo/);
 assert.match(await page.locator('#reply').textContent(),/para tomar/);await say('sí');await page.locator('.dish[data-product="sprite"]').waitFor();assert.equal(await page.locator('#cartCount').textContent(),'1','el sí a la bebida muestra opciones, no agrega');
 await page.locator('[data-close="optionsModal"]').click();await say('dame unas bebidas');await page.locator('.dish[data-product="pepsi"]').waitFor();
 await say('sin cebolla');assert.match(await page.locator('#reply').textContent(),/sin cebolla/);
 await say('quiero ver los combos');await page.locator('.dish[data-product="combo-personal"]').waitFor();for(const id of ['combo-personal','combo-familiar','combo-pechuga'])await page.locator(`.dish.is-spot[data-product="${id}"]`).waitFor({timeout:15000});assert.equal(await page.locator('.dish.is-spot').count(),1,'Milo nombra e ilumina todos, uno a la vez');assert.match(await page.locator('#reply').textContent(),/combo pechuga/);
 await page.locator('[data-add="combo-alitas"]').click();assert.equal(await page.locator('#cartCount').textContent(),'2');assert.equal(await page.locator('#optionsModal').evaluate(e=>e.open),true,'agregar no cierra el menú');
 await say('muéstrame las bebidas');await say('sí');await page.locator('#summaryModal[open]').waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mesero-brasa-v2-orders')||'[]').length),0,'sí fuera de revisión no envía');
 await page.locator('[data-close="summaryModal"]').click();
 await say('finalizar pedido');await page.locator('#summaryModal[open]').waitFor();await page.locator('[data-close="summaryModal"]').click();
 await say('eso es todo');await page.locator('#summaryModal[open]').waitFor();assert.match(await page.locator('#summaryBody').textContent(),/sin cebolla/);assert.match(await page.locator('#summaryBody').textContent(),/mesa 7/);assert.equal(await page.locator('#customerName').count(),0,'con mesa no se pide nombre');
 await page.waitForTimeout(700);await page.screenshot({path:'test-results/resumen-desktop.png'});
 await page.locator('#confirmButton').click();await cash.locator('.queue-card').waitFor();const card=await cash.locator('.queue-card').textContent();assert.match(card,/Mesa 7/);assert.match(card,/sin cebolla/);assert.match(card,/Combo de alitas/);
 assert.equal(await cash.locator('.queue-card').count(),1);await cash.locator('[data-status="aceptado"][data-order]').click();await cash.locator('.status-pill[data-status="aceptado"]').waitFor();
 const cash2=await ctx.newPage();await cash2.goto('http://localhost:3000/caja.html');await cash2.locator('.status-pill[data-status="aceptado"]').waitFor();
 await cash.locator('[data-status="preparando"][data-order]').click();await cash2.locator('.status-pill[data-status="preparando"]').waitFor();
 await cash.screenshot({path:'test-results/caja-desktop.png',fullPage:true});
 await say('qué me recomiendas');assert.match(await page.locator('#reply').textContent(),/cuántos/);await say('cinco');assert.match(await page.locator('#reply').textContent(),/Para cinco/);assert.equal(await page.locator('#cartCount').textContent(),'0','proponer no agrega');
 await say('sí');assert.equal(await page.locator('#cartCount').textContent(),'2','el sí acepta la propuesta');
 await say('sí, muéstrame el menú');await page.locator('.door').first().waitFor();
 // Sin mesa configurada vuelve el flujo de retiro con nombre.
 await page.goto('http://localhost:3000/?mesa=');await page.locator('#menuOpen:not([disabled])').waitFor();assert.equal(await page.locator('#tableChip').isHidden(),true);
 await say('dos cuartos de pollo');await say('eso es todo');await page.locator('#customerName').waitFor();
 await page.bringToFront();await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:3000/?mesa=3');await page.locator('#menuOpen:not([disabled])').waitFor();await page.screenshot({path:'test-results/home-mobile.png'});
 await page.locator('#menuOpen').click();await page.locator('.door[data-category="Combos"]').click();await page.waitForTimeout(1200);assert.ok(await page.locator('.dish').first().evaluate(e=>getComputedStyle(e).opacity==='1'));await page.screenshot({path:'test-results/combos-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await cash.setViewportSize({width:390,height:844});await cash.screenshot({path:'test-results/caja-mobile.png',fullPage:true});assert.equal(await cash.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: mesa, menú animado, foco de voz, agregar directo, revisión segura, caja en vivo con mesa, retiro con nombre y móvil.');
})().catch(e=>{console.error(e);process.exit(1);});
