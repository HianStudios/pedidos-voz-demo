// Prueba del flujo UI con respuestas de IA controladas; no usa credenciales ni audio real.
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const original='dos personales, tres familiares y cuatro combos de esos pequeños';
 let calls=0;
 await page.route('**/api/match',async route=>{
  const data=route.request().postDataJSON();calls++;
  if(calls===1){assert.equal(data.transcript,original);await route.fulfill({json:{intent:'edit',operations:[{type:'add',id:'combo-personal',qty:2},{type:'add',id:'combo-familiar',qty:3}],reply:'Anoté dos personales y tres familiares. ¿Los cuatro restantes de alitas?',memory:{turns:[original],question:'¿Los cuatro restantes de alitas?'}}});}
  else {assert.equal(data.transcript,'sí');assert.equal(data.memory.turns[0],original);assert.equal(data.cart.reduce((n,l)=>n+l.qty,0),5);await route.fulfill({json:{intent:'edit',operations:[{type:'add',id:'combo-alitas',qty:4}],reply:'Anoté cuatro combos de alitas. ¿Algo más, o cerramos?',memory:null}});}
 });
 await page.goto('http://localhost:3000/?mesa=7&teclado=1');await page.waitForFunction(()=>!document.getElementById('menuOpen').disabled);
 await page.evaluate(text=>window.__miloInput(text),original);
 assert.equal(await page.locator('#cartCount').textContent(),'5');
 // Con la aclaración pendiente la factura se ve, pero Milo recuerda lo que falta y no envía.
 await page.locator('#cartOpen').click();assert.match(await page.locator('#reply').textContent(),/restantes de alitas/);await page.locator('[data-close="summaryModal"]').click();
 await page.reload();await page.waitForFunction(()=>!document.getElementById('menuOpen').disabled);
 await page.evaluate(()=>window.__miloInput('sí'));
 assert.equal(await page.locator('#cartCount').textContent(),'9');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mesero-brasa-v2-orders')||'[]').length),0);
 await page.locator('#cartOpen').click();assert.equal(await page.locator('#summaryModal').evaluate(e=>e.open),true);
 await page.locator('#customerName').fill('Pérez');await page.locator('#confirmButton').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mesero-brasa-v2-orders')||'[]').length===1);
 // La clave se toma del módulo para comprobar el borrado del contexto tras enviar.
 const draft=await page.evaluate(async()=>{const {storageKey}=await import('/public/js/order-store.js');return JSON.parse(localStorage.getItem(storageKey));});
 assert.equal(draft.memory,null);assert.deepEqual(draft.cart,[]);assert.deepEqual(errors,[]);
 console.log('Memoria UI: cantidades, recarga, bloqueo de envío y limpieza correctos.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
