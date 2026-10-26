// Menú editable y agotados con la caja compartida. Requiere el servidor en modo en vivo:
// REDIS_URL, STAFF_TOKEN=prueba-staff-token-1234567890ab, SESSION_SECRET (32+), KIOSK_PIN=1234 y Redis vacío.
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});const ctx=await b.newContext({viewport:{width:1280,height:900}});const errors=[];
const admin=await ctx.newPage();admin.on('pageerror',e=>errors.push(e.message));admin.on('dialog',d=>d.accept());
await admin.goto('http://localhost:3000/admin.html');await admin.locator('#staffForm:not([hidden])').waitFor();
await admin.fill('#staffToken','prueba-staff-token-1234567890ab');await admin.locator('#staffForm button[type=submit], #staffForm button').first().click();
await admin.locator('#dashboard:not([hidden])').waitFor();await admin.locator('#menuRows .menu-row').first().waitFor();
// nuevo producto
await admin.click('#menuAdd');await admin.fill('#pfName','Salchipapa');await admin.selectOption('#pfCategory','Extras');await admin.fill('#pfPrice','3,50');await admin.selectOption('#pfArticle','una');
await admin.fill('#pfDesc','Papas con salchicha.');await admin.fill('#pfIngredients','Papas doradas, salchicha, mayonesa');await admin.fill('#pfRemove','mayonesa');await admin.fill('#pfAliases','salchi');
await admin.click('#productForm button[type=submit]');await admin.locator('#productForm').waitFor({state:'hidden'});
assert.match(await admin.locator('#menuNote').textContent(),/Salchipapa/);assert.ok(await admin.locator('.menu-row',{hasText:'Salchipapa'}).count());
// cambiar precio de cuarto
await admin.click('[data-menu-tab="Platos"]');await admin.click('[data-edit="cuarto"]');await admin.fill('#pfPrice','4.75');await admin.click('#productForm button[type=submit]');await admin.locator('#productForm').waitFor({state:'hidden'});
assert.match(await admin.locator('.menu-row[data-id="cuarto"]').textContent(),/4,75/);
// promo y clave
await admin.fill('#promoText','combo familiar a $16 hasta las 6 pm');await admin.click('#promoSave');await admin.waitForTimeout(400);
await admin.fill('#pinText','5678');await admin.click('#pinSave');await admin.waitForTimeout(400);
await admin.screenshot({path:'test-results/admin-menu.png',fullPage:true});
// caja: agotar alitas
const cash=await ctx.newPage();cash.on('pageerror',e=>errors.push(e.message));await cash.goto('http://localhost:3000/caja.html');await cash.locator('#staffForm:not([hidden])').waitFor();
await cash.fill('#staffToken','prueba-staff-token-1234567890ab');await cash.locator('#staffForm button').first().click();await cash.locator('#workspace:not([hidden])').waitFor();
await cash.locator('#soldoutPanel summary').click();await cash.click('[data-soldout="alitas"]');await cash.locator('[data-soldout="alitas"][aria-pressed="true"]').waitFor();
await cash.screenshot({path:'test-results/caja-agotados.png'});
// mesa
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:3000/?mesa=3&teclado=1');await page.locator('#menuOpen:not([disabled])').waitFor();
const say=async t=>{await page.evaluate(t=>window.__miloInput(t),t);await page.waitForTimeout(1200);const r=await page.locator('#reply').textContent();console.log(`«${t}» → ${r}`);return r;};
assert.match(await say('una salchipapa sin mayonesa'),/salchipapa sin mayonesa/i);
assert.match(await say('cuánto cuesta el cuarto de pollo'),/4,75/);
assert.match(await say('unas alitas'),/ya no nos quedan alitas/i);
assert.match(await say('un cuarto de pollo y unas alitas'),/ya no nos quedan alitas.*cuarto/i);
await say('muéstrame los platos');await page.locator('.dish.soldout[data-product="alitas"]').waitFor();
await page.screenshot({path:'test-results/mesa-agotado.png'});
// kiosco con clave nueva
const r=await page.evaluate(async()=>{const a=await fetch('/api/kiosk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'1234'})});const b=await fetch('/api/kiosk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'5678'})});return [a.status,b.status];});
assert.deepEqual(r,[401,200],'la clave nueva reemplaza a la de Vercel');
const greet=await page.evaluate(async()=>(await (await fetch('/api/menu')).json()).restaurant.greeting);assert.match(greet,/combo familiar a \$16/);
assert.deepEqual(errors,[]);console.log('PASS editor');await b.close();})().catch(e=>{console.error(e);process.exit(1);});
