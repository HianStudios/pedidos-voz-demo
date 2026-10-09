import {money,total,validateCart,applyOperations,isConfirmation,normalize,describeOps,followUp,amount,parsePeople,suggestForPeople} from './domain.js';
import {navigation,plausibleName,cartSignature} from './conversation.js';
import {foodArt} from './art.js';
import {VoiceController} from './voice.js';
import {listWords} from './speech-text.js';
import {storageKey,ordersKey,readStore,saveOrders} from './order-store.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories={Platos:'los platos',Combos:'los combos',Extras:'los extras',Bebidas:'las bebidas'};
const tableKey=`${storageKey}-mesa`;
// La mesa se fija una vez al instalar el dispositivo: /?mesa=7 (y /?mesa= para quitarla).
function readTable(){
 const q=new URLSearchParams(location.search).get('mesa');const valid=v=>/^\d{1,3}$/.test(v||'')&&Number(v)>0;
 try{if(q!==null){if(valid(q))localStorage.setItem(tableKey,q);else localStorage.removeItem(tableKey);}const saved=localStorage.getItem(tableKey);return valid(saved)?Number(saved):null;}
 catch{return valid(q)?Number(q):null;}
}
const table=readTable();
let menu=[],restaurant,mode='demo',cart=[],history=[],busy=false,epoch=0,request=null,lastId=null,
 customerName='',pending=null,sending=false,sessionActive=false,awaitingName=false,reviewed=null,
 category=null,awaitingCancel=false,drinkOffered=false,spotTimers=[],idleTimer=0,
 asked=null,proposal=null; // pregunta pendiente de Milo y propuesta que espera un «sí»
function saveDraft(){try{localStorage.setItem(storageKey,JSON.stringify({cart,pending,customer:customerName}));}catch{}}
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
const states={off:'Listo para ayudarte',waiting:'Toca a Milo para seguir',listening:'Te escucho',transcribing:'Entendiendo',thinking:'Pensando',speaking:'Milo habla',sending:'Enviando a cocina'};
const voice=new VoiceController({greeting:'¡Hola! Soy Milo. ¿Qué se te antoja hoy?',
 onState:s=>{if(s==='listening')$('voiceHelp').textContent='';$('mascotStage').dataset.state=s;document.body.dataset.state=s;$('voiceState').textContent=states[s]||states.off;$('stopVoice').hidden=!voice.enabled;document.querySelectorAll('[data-talk]').forEach(b=>b.setAttribute('aria-label',s==='listening'?'Terminar frase':s==='speaking'?'Interrumpir a Milo':'Hablar con Milo'));},
 onLevel:v=>document.body.style.setProperty('--level',v.toFixed(3)),
 onText:t=>{$('transcript').textContent=`«${t}»`;},
 onInput:t=>handleInput(t),onError:t=>{$('voiceHelp').textContent=t;},
 onSentence:(s,ms)=>spotlight(s,ms)});
function fresh(el,text){el.textContent=text;el.classList.remove('fresh');void el.offsetWidth;el.classList.add('fresh');}
async function reply(text,next='listen'){
 fresh($('reply'),text);document.querySelectorAll('.dialog-reply').forEach(el=>fresh(el,text));
 if(/para tomar|bebida/i.test(text))drinkOffered=true;
 if(/para cu[aá]ntos|cu[aá]ntas personas|cu[aá]ntos son/i.test(text))asked='people';
 else if(/(para tomar|bebida)[^?]*\?\s*$/i.test(text))asked='drink';
 history.push({role:'assistant',content:text});history=history.slice(-10);
 if(voice.enabled&&sessionActive)await voice.respond(text,next);else{voice.state(voice.enabled?'waiting':'off');spotlight(text);}
}
function interrupt(){epoch++;request?.abort();request=null;voice.pause();busy=false;}
function setCart(next){
 const before=cart.reduce((n,l)=>n+l.qty,0);cart=next;reviewed=null;saveDraft();
 const count=cart.reduce((n,l)=>n+l.qty,0),badge=$('cartCount');badge.textContent=count;badge.classList.toggle('on',count>0);
 if(count>before){badge.classList.remove('bump');void badge.offsetWidth;badge.classList.add('bump');}
}
// Pantalla siempre encendida mientras la app está abierta (Chrome Android, Safari iOS 16.4+).
let wakeLock=null;
async function keepAwake(){try{if(!wakeLock&&navigator.wakeLock&&document.visibilityState==='visible'){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}}catch{}}
function talk(){keepAwake();activity();if(busy||sending)return;if(!sessionActive){sessionActive=true;voice.enable(true);}else if(voice.mode==='listening')voice.finish();else voice.listen();}
function closeModals(){clearSpot();for(const id of ['optionsModal','summaryModal'])if($(id).open)$(id).close();}

// ---------- Menú animado ----------
function setTab(cat){
 const tabs=$('tabs');let active=null;
 for(const b of tabs.querySelectorAll('[data-category]')){const on=b.dataset.category===cat;b.setAttribute('aria-current',String(on));if(on)active=b;}
 tabs.style.setProperty('--x',`${active?active.offsetLeft:0}px`);tabs.style.setProperty('--w',`${active?active.offsetWidth:0}px`);
}
function openSheet(title,html,cat=null){
 if($('summaryModal').open)$('summaryModal').close();
 clearSpot();$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modalBody').scrollTop=0;
 if(!$('optionsModal').open)$('optionsModal').showModal();
 requestAnimationFrame(()=>setTab(cat));
}
function showCategories(){
 category=null;
 openSheet('Menú',`<div class="doors">${Object.keys(categories).map((c,i)=>{const items=menu.filter(p=>p.category===c&&p.available);const hero=items.find(p=>p.tag)||items[0];return hero?`<button class="door" style="--i:${i}" data-category="${c}"><span class="art">${foodArt(hero)}</span><strong>${c}</strong><span>${items.length} opciones</span></button>`:'';}).join('')}</div>`);
}
function showProducts(items,title,cat=null){
 category=cat;
 if(!items.length){reply('Ahora mismo no hay productos disponibles aquí.');return;}
 openSheet(title,`<p class="shelf-hint">Dile a Milo cuál quieres, o toca «Agregar».</p><div class="shelf" tabindex="0" aria-label="${esc(title)}">${items.map((p,i)=>`<article class="dish" style="--i:${i}" data-product="${p.id}"><div class="art">${foodArt(p)}</div><span class="tag">${esc(p.tag||'')}</span><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><footer><span class="price">${money(p.price)}</span><button class="add" data-add="${p.id}" aria-label="Agregar ${esc(p.name)}">Agregar</button></footer></article>`).join('')}</div>`,cat);
}
function showCategory(cat){showProducts(menu.filter(p=>p.category===cat&&p.available),cat,cat);}
const spokenName=p=>p.category==='Bebidas'?p.name:p.name.charAt(0).toLowerCase()+p.name.slice(1);
// Presentación oral de toda la categoría, en el mismo orden que las tarjetas.
function categoryPitch(cat){
 const items=menu.filter(p=>p.category===cat&&p.available);
 return `Aquí tienes ${categories[cat]}. Tenemos ${listWords(items.map(p=>p.one||spokenName(p)))}. ¿Cuál te provoca?`;
}
function clearSpot(){spotTimers.forEach(clearTimeout);spotTimers=[];document.querySelectorAll('.dish.is-spot').forEach(c=>c.classList.remove('is-spot'));}
// Mientras Milo nombra un producto, su tarjeta se ilumina y se centra, en el momento en que lo dice:
// el retraso se reparte según la posición del nombre en la frase y la duración de la locución.
function spotlight(sentence,durationMs){
 if(!$('optionsModal').open)return;
 const n=` ${normalize(sentence)} `;const cards=[...$('modalBody').querySelectorAll('.dish')];
 const hits=cards.map(card=>{const p=menu.find(x=>x.id===card.dataset.product);const at=Math.min(...[p.name,...p.aliases].map(a=>{const i=n.indexOf(` ${normalize(a)} `);return i<0?Infinity:i;}));return {card,at};}).filter(h=>h.at<Infinity).sort((a,b)=>a.at-b.at);
 if(!hits.length)return;
 spotTimers.forEach(clearTimeout);spotTimers=[];
 const total=durationMs||n.length*68,smooth=matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
 hits.forEach(({card,at})=>spotTimers.push(setTimeout(()=>{cards.forEach(c=>c.classList.toggle('is-spot',c===card));card.scrollIntoView({behavior:smooth,block:'nearest',inline:'center'});},Math.max(0,at/n.length*total-150))));
}
// ---------- Resumen ----------
function renderSummary(){
 if(table)customerName=`Mesa ${table}`;
 $('summaryBody').innerHTML=cart.length?`<div class="ticket">${cart.map((l,i)=>{const p=menu.find(p=>p.id===l.id);return `<div class="line" style="--i:${i}"><span class="qty">${l.qty}</span><span><b>${esc(p.name)}</b><small>${l.notes.map(esc).join(' · ')}</small></span><strong>${money(p.price*l.qty)}</strong></div>`;}).join('')}<div class="total"><span>Total</span><strong>${money(total(cart,menu))}</strong></div>${table?`<p class="where">Para la mesa ${table}${mode==='demo'?' · pedido de prueba':''}</p>`:`<label class="field">Nombre para retirar<input id="customerName" ${pending?'disabled':''} value="${esc(customerName)}" maxlength="60" autocomplete="given-name" placeholder="Tu nombre"></label><p class="where">${mode==='demo'?'Pedido de prueba · no llega a un restaurante real.':'Para retirar en el restaurante.'}</p>`}<button class="send" id="confirmButton">${pending?'Reintentar el mismo envío':'Enviar a cocina'}</button></div>`:'<p class="empty">Todavía no hay nada aquí.</p>';
}
function review(){
 if($('optionsModal').open)$('optionsModal').close();
 if(!cart.length){reply('Todavía no has pedido nada. ¿Qué se te antoja?');return;}
 renderSummary();if(!$('summaryModal').open)$('summaryModal').showModal();
 reviewed=cartSignature(cart,customerName);awaitingName=!table&&!customerName;
 const lines=cart.map(l=>{const p=menu.find(p=>p.id===l.id);return amount(p,l.qty)+(l.notes.length?` ${l.notes.join(' y ')}`:'');});
 reply(`Tienes ${listWords(lines)}. Son ${money(total(cart,menu))}. ${table?'¿Lo envío a cocina?':customerName?'¿Lo envío?':'¿A nombre de quién va?'}`);
}
function addDirect(id){
 interrupt();activity();const operations=[{type:'add',id,qty:1}];
 try{const before=cart;setCart(applyOperations(cart,operations,menu));lastId=id;$('modalBody').querySelector(`.dish[data-product="${id}"]`)?.classList.add('added');reply(`${describeOps(operations,menu)} ${followUp(before,operations,menu,drinkOffered)}`);}
 catch(e){reply(e.message);}
}

async function handleInput(raw){
 raw=raw?.trim();if(!raw||!menu.length||busy||sending)return;
 activity();interrupt();const turn=epoch;voice.state('thinking');$('transcript').textContent=`«${raw}»`;$('voiceHelp').textContent='';history.push({role:'user',content:raw});const n=normalize(raw);
 if(pending){if(isConfirmation(raw))return submit();reply('Hay un envío pendiente de comprobar. Reintenta el mismo pedido desde el resumen.');return;}
 if(awaitingCancel){awaitingCancel=false;if(isConfirmation(raw)){setCart([]);drinkOffered=false;closeModals();reply('Listo, empezamos de cero. ¿Qué se te antoja?');return;}if(/^(no|no gracias)$/.test(n)){reply('Perfecto, lo dejo como está.');return;}}
 // Respuestas a lo último que Milo preguntó o propuso.
 const lastAsked=asked,offer=proposal;asked=null;proposal=null;
 if(offer&&isConfirmation(raw)&&!$('summaryModal').open){
  try{const before=cart;setCart(applyOperations(cart,offer.operations,menu));lastId=offer.operations.at(-1).id;reply(`${describeOps(offer.operations,menu)} ${followUp(before,offer.operations,menu,drinkOffered)}`);}catch(e){reply(e.message);}
  return;
 }
 if(offer&&/^(no|no gracias|mejor no|nada|todavia no)$/.test(n)){reply('Sin problema. ¿Qué se te antoja entonces?');return;}
 // «¿Algo para tomar?» → «sí» muestra las bebidas; «no» no vuelve a ofrecerlas.
 if(lastAsked==='drink'&&/^(si|sí|claro|dale|ya|bueno|ok|okey|si por favor|si porfa|de una|obvio)$/.test(n)){showCategory('Bebidas');reply(categoryPitch('Bebidas'));return;}
 if(lastAsked==='drink'&&/^(no|no gracias|nada|nada de tomar|sin bebida|asi esta bien|no gracias asi esta bien)$/.test(n)){drinkOffered=true;reply('Sin bebida, entonces. ¿Algo más, o cerramos el pedido?');return;}
 const people=parsePeople(raw,lastAsked==='people');
 if(people){
  const plan=suggestForPeople(people,menu);
  if(!plan){reply('Para un grupo tan grande, mejor que el personal te ayude a armarlo. ¿Te muestro los combos mientras tanto?');return;}
  proposal=plan;showProducts(plan.operations.map(o=>menu.find(p=>p.id===o.id)),'Para ti');reply(plan.reply);return;
 }
 if(/^(cierra|cierra eso|cierra la ventana|cerrar)$/.test(n)){closeModals();reviewed=null;reply('Listo.');return;}
 if(isConfirmation(raw)){
  if(cart.length&&customerName&&reviewed===cartSignature(cart,customerName))return submit();
  review();return;
 }
 const nav=navigation(raw);
 if(nav){awaitingName=false;reviewed=null;if(nav==='all'){showCategories();reply('Este es el menú: platos, combos, extras y bebidas. ¿Por dónde empezamos?');}else{showCategory(nav);reply(categoryPitch(nav));}return;}
 const explicit=raw.match(/^(?:me llamo|mi nombre es|a nombre de)\s+(.{2,60})$/i);
 if(!table&&((explicit&&plausibleName(explicit[1]))||(awaitingName&&plausibleName(raw)))){customerName=(explicit?explicit[1]:raw).trim();awaitingName=false;saveDraft();review();return;}
 if(/^(no quiero bebida|sin bebida|no deseo bebida|no gracias)$/.test(n)){reviewed=null;awaitingName=false;drinkOffered=true;reply('Sin bebida, entonces. ¿Algo más, o cerramos el pedido?');return;}
 reviewed=null;awaitingName=false;busy=true;$('sendText').disabled=true;request=new AbortController();
 try{
  const res=await fetch('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:raw,cart,lastId,category,table,drinkOffered,history:history.slice(0,-1).slice(-6)}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(22000)])});
  const result=await res.json();if(turn!==epoch)return;if(!res.ok)throw new Error(result.error||'No pude entender.');
  if(result.intent==='edit'){
   setCart(applyOperations(cart,result.operations,menu));lastId=result.operations.at(-1)?.id;
   if($('summaryModal').open)renderSummary();
   reply(result.reply||'Listo. ¿Algo más, o cerramos el pedido?');
  }else if(result.intent==='menu'&&result.source==='fallback'&&$('optionsModal').open){reply(result.reply.replace(/Te muestro el menú: |Aquí tienes el menú, /,''));
  }else if(result.intent==='menu'){
   if(result.category&&result.category!=='all'){showCategory(result.category);reply(result.reply||categoryPitch(result.category));}else{showCategories();reply(result.reply||'Este es el menú. ¿Por dónde empezamos?');}
  }else if(result.intent==='recommend'){
   const items=(result.suggest_ids||[]).map(id=>menu.find(p=>p.id===id&&p.available)).filter(Boolean);if(items.length)showProducts(items,'Para ti');
   // Si la recomendación trae propuesta concreta, un «sí» la anota.
   if(result.proposal?.length)proposal={operations:result.proposal};
   else if(result.suggest_ids?.length===1&&/anot/i.test(result.reply))proposal={operations:[{type:'add',id:result.suggest_ids[0],qty:1}]};
   reply(result.reply);
  }else if(result.intent==='review')review();
  else if(result.intent==='cancel'){awaitingCancel=true;reply('¿Borro todo el pedido y empezamos de cero?');}
  else if(result.intent==='goodbye'&&!cart.length){await reply(result.reply||'¡Gracias! Aquí estaré.','wait');sessionActive=false;voice.disable();}
  else reply(result.reply||'¿Qué te provoca?');
 }catch(e){if(turn===epoch)reply(e.name==='TimeoutError'?'Me tardé demasiado. Tu pedido sigue igual; dímelo otra vez, por favor.':e.message);}
 finally{if(turn===epoch){busy=false;$('sendText').disabled=false;}}
}
async function submit(){
 if(sending||!cart.length||!customerName)return;
 if(!pending&&reviewed!==cartSignature(cart,customerName)){review();return;}
 closeModals();voice.pause();sending=true;voice.state('sending');
 pending=pending||{key:crypto.randomUUID(),items:structuredClone(cart),customer:customerName,...(table?{table}:{}),confirmed:true};saveDraft();
 try{
  let order;
  if(mode==='demo'){
   const orders=readStore(ordersKey,[]);order=orders.find(o=>o.id===pending.key);
   if(!order){order={id:pending.key,number:pending.key.slice(0,6).toUpperCase(),items:pending.items.map(l=>({...l,name:menu.find(p=>p.id===l.id).name,price:menu.find(p=>p.id===l.id).price})),total:total(pending.items,menu),customer:pending.customer,...(pending.table?{table:pending.table}:{}),fulfillment:pending.table?'mesa':'retiro',status:'nuevo',createdAt:new Date().toISOString()};saveOrders([order,...orders].slice(0,200));}
  }else{const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(15000)});const data=await res.json();if(!res.ok)throw new Error(data.error);order=data.order;}
  pending=null;customerName='';setCart([]);lastId=null;awaitingName=false;drinkOffered=false;history=[];
  toast(`Pedido ${mode==='demo'?'de prueba ':''}#${order.number} registrado`);
  const done=mode==='demo'?'Listo, tu pedido de prueba quedó registrado.':order.table?'¡Listo! Tu pedido ya está en cocina. ¡Buen provecho!':`¡Listo, ${order.customer}! Tu pedido es el número ${order.number}.`;
  await reply(done,'wait');
 }catch(e){reply(`No pude confirmar el envío. Guardé el mismo pedido para reintentar. ${e.message}`);}
 finally{sending=false;}
}

// Kiosco: tras un rato sin uso, Milo vuelve a su pantalla inicial y apaga el micrófono.
function activity(){clearTimeout(idleTimer);idleTimer=setTimeout(idle,120000);}
function idle(){
 if(busy||sending||['listening','speaking','thinking','transcribing'].includes(voice.mode)){activity();return;}
 closeModals();if(sessionActive){sessionActive=false;voice.disable();}
 $('transcript').textContent='';$('voiceHelp').textContent='';fresh($('reply'),cart.length?'Tu pedido sigue guardado. Toca a Milo para seguir.':'Toca a Milo para hablar');
}

$('mascot').addEventListener('click',talk);document.querySelectorAll('[data-talk]').forEach(b=>b.addEventListener('click',talk));
$('stopVoice').addEventListener('click',()=>{sessionActive=false;voice.disable();});
$('menuOpen').addEventListener('click',()=>handleInput('ver menú'));
$('cartOpen').addEventListener('click',()=>{interrupt();activity();review();});
$('keyboardOpen').addEventListener('click',()=>{const c=$('composer');c.hidden=!c.hidden;$('keyboardOpen').setAttribute('aria-expanded',String(!c.hidden));if(!c.hidden)$('chatText').focus();});
for(const form of document.querySelectorAll('[data-chat]'))form.addEventListener('submit',e=>{e.preventDefault();const input=form.querySelector('input');const text=input.value;input.value='';handleInput(text);});
$('optionsModal').addEventListener('click',e=>{const cat=e.target.closest('[data-category]');const add=e.target.closest('[data-add]');if(cat)handleInput(`ver ${cat.dataset.category}`);if(add)addDirect(add.dataset.add);});
$('summaryBody').addEventListener('click',e=>{if(e.target.id!=='confirmButton')return;if(!table){const value=$('customerName').value.trim();if(value.length<2){$('customerName').focus();toast('Escribe un nombre para retirar.');return;}customerName=value;}reviewed=cartSignature(cart,customerName);saveDraft();submit();});
$('summaryBody').addEventListener('input',()=>{reviewed=null;});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
$('optionsModal').addEventListener('close',()=>{clearSpot();category=null;});
$('summaryModal').addEventListener('close',()=>{reviewed=null;awaitingName=false;});
addEventListener('resize',()=>{if($('optionsModal').open)setTab(category);});
addEventListener('pointerdown',activity);addEventListener('keydown',activity);
document.addEventListener('visibilitychange',()=>{if(document.hidden){interrupt();voice.disable();sessionActive=false;}else keepAwake();});
addEventListener('pointerdown',keepAwake,{once:true});
async function init(){
 keepAwake();if(table){$('tableNumber').textContent=table;$('tableChip').hidden=false;}
 try{const res=await fetch('/api/menu');const data=await res.json();if(!res.ok)throw new Error(data.error);({menu,restaurant,mode}=data);voice.greeting=restaurant.greeting;voice.neural=data.voice==='neural';
 voice.preferRecorder=data.aiAvailable&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)&&!/[?&]voz=nativa\b/.test(location.search);const saved=readStore(storageKey,{});try{cart=validateCart(saved.cart||[],menu);pending=saved.pending||null;}catch{cart=[];pending=null;}customerName=saved.customer||'';setCart(cart);$('menuOpen').disabled=false;}
 catch{$('reply').textContent='No pude cargar el menú. Recarga la página.';$('mascot').disabled=true;}
}
init();
