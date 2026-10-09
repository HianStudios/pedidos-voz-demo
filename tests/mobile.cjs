// Celular Android simulado: micrófono falso (voz + silencio), grabación y detección de voz reales.
// Solo se simula la respuesta de /api/transcribe. Requiere `npm run dev` en marcha.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));const assert=require('node:assert/strict');
// WAV de 16 kHz: 3.5 s de silencio, 1.2 s de «voz», 3 s de silencio (Chromium lo repite en bucle).
const wav=path.join(os.tmpdir(),'milo-voz.wav');{const rate=16000,parts=[[3.5,0],[1.2,.5],[3,0]],samples=[];
 for(const [sec,amp] of parts)for(let i=0;i<rate*sec;i++)samples.push(amp?amp*(.6*Math.sin(2*Math.PI*180*i/rate)+.4*(Math.random()*2-1)):(Math.random()*2-1)*.003);
 const b=Buffer.alloc(44+samples.length*2);b.write('RIFF',0);b.writeUInt32LE(36+samples.length*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);
 samples.forEach((v,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));fs.writeFileSync(wav,b);}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+wav+'','--autoplay-policy=no-user-gesture-required']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',permissions:['microphone']});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let uploads=0;await page.route('**/api/menu',async r=>{const res=await r.fetch();const data=await res.json();data.aiAvailable=true;r.fulfill({json:data});});
 await page.route('**/api/transcribe',r=>{uploads++;r.fulfill({json:{text:uploads===1?'muéstrame los combos':'ahora muéstrame las bebidas'}});});
 await page.addInitScript(()=>{window.__recs=0;const R=window.webkitSpeechRecognition;if(R)window.webkitSpeechRecognition=class extends R{start(){window.__recs++;return super.start();}};});
 await page.goto('http://localhost:3000/?mesa=2');await page.locator('#menuOpen:not([disabled])').waitFor();
 await page.locator('#mascot').tap({force:true});
 await page.locator('.dish[data-product="combo-personal"]').waitFor({timeout:30000});
 await page.locator('.dish[data-product="sprite"]').waitFor({timeout:40000});assert.equal(uploads,2,'segundo turno sin tocar a Milo');assert.equal(await page.evaluate(()=>window.__recs),0,'no usa el reconocedor del sistema (sin pitidos)');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS móvil: grabó, detectó la voz, abrió combos y, sin tocar a Milo, en el segundo turno abrió bebidas; reconocedor del sistema sin usar.');
})().catch(e=>{console.error(e);process.exit(1);});
