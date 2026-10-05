// Ejecutar con Playwright instalado: node tests/browser.cjs (servidor local activo).
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3000');await page.locator('.product').first().waitFor();assert.equal(await page.locator('.product').count(),10);
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  async function say(text){await page.locator('#chatText').fill(text);await page.locator('#sendText').click();await page.waitForFunction(()=>!document.getElementById('sendText').disabled);}
  await say('quiero dos cuartos de pollo y una cola');assert.equal(await page.locator('#cartCount').textContent(),'3');
  await say('sin cebolla');assert.equal(await page.locator('#cartCount').textContent(),'3'); // last cola => clarification, no submit
  await say('eso es todo');await page.locator('#cartDialog[open]').waitFor();
  await page.locator('[data-close="cartDialog"]').click();await say('no confirmes todavía');assert.equal(await page.locator('#cartCount').textContent(),'3');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mesero-brasa-v2-orders')||'[]').length),0);
  await say('quita una cola');assert.equal(await page.locator('#cartCount').textContent(),'2');
  await say('sin cebolla'); // lastId cola removed: clarification, no corruption
  await say('mejor tres cuartos de pollo');assert.equal(await page.locator('#cartCount').textContent(),'3');
  await say('sin cebolla');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mesero-brasa-v2')).cart[0].notes[0]),'sin cebolla');
  await page.reload();await page.locator('.product').first().waitFor();assert.equal(await page.locator('#cartCount').textContent(),'3');
  await page.locator('#cartOpen').click();await page.locator('#customerName').fill('Hian');await page.locator('#confirmButton').click();await page.locator('#confirmButton').click();await page.waitForFunction(()=>!document.getElementById('cartDialog').open);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mesero-brasa-v2-orders')).length),1);
  await page.locator('#cashierOpen').click();await page.locator('.queue-card').waitFor();assert.match(await page.locator('.queue-card').textContent(),/Hian/);await page.locator('[data-status="aceptado"]').click();await page.waitForFunction(()=>document.querySelector('.status-pill')?.textContent==='aceptado');
  await page.reload();await page.locator('.product').first().waitFor();await page.locator('#cashierOpen').click();assert.equal(await page.locator('.status-pill').textContent(),'aceptado');await page.locator('[data-close="cashierDialog"]').click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('[data-add="cuarto"]').click();await page.locator('#cartOpen').click();await page.screenshot({path:'test-results/mobile-cart.png'});assert.equal(await page.evaluate(()=>document.getElementById('cartDialog').getBoundingClientRect().width<innerWidth),true);await page.locator('[data-close="cartDialog"]').click();
  assert.deepEqual(errors,[]);console.log('PASS: menú, conversación, negaciones, edición, confirmación, caja, recarga y móvil.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
