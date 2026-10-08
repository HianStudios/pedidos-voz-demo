import {money,total,validateCart,applyOperations,isConfirmation,normalize} from './domain.js';
import {navigation,plausibleName,cartSignature} from './conversation.js';
import {foodArt} from './art.js';
import {VoiceController} from './voice.js';
import {mountCarousel} from './carousel.js';
import {storageKey,ordersKey,readStore,saveOrders} from './order-store.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let menu=[],restaurant,mode='demo',cart=[],history=[],busy=false,epoch=0,request=null,lastId=null,
 customerName='',pending=null,sending=false,sessionActive=false,awaitingName=false,reviewed=null,
 category=null,carousel=null,awaitingCancel=false;
function saveDraft(){try{localStorage.setItem(storageKey,JSON.stringify({cart,pending,customer:customerName}));}catch{}}
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
const states={off:'Listo para ayudarte',waiting:'Toca para continuar',listening:'Te escucho…',transcribing:'Entendiendo tu voz…',thinking:'Un momento…',speaking:'Milo te cuenta',sending:'Registrando pedido…'};
const voice=new VoiceController({greeting:'¡Hola! ¿Qué se te antoja hoy?',
 onState:s=>{$('mascotStage').dataset.state=s;$('voiceState').textContent=states[s]||states.off;carousel?.hold(['listening','thinking','transcribing'].includes(s));$('stopVoice').hidden=!voice.enabled;document.querySelectorAll('[data-talk]').forEach(b=>b.textContent=s==='listening'?'Terminar frase':s==='speaking'?'Interrumpir y hablar':'Hablar con Milo');},
 onLevel:v=>$('mascotStage').style.setProperty('--level',v.toFixed(3)),onText:t=>$('transcript').textContent=`Tú: ${t}`,
 onInput:t=>handleInput(t),onError:t=>{$('voiceHelp').textContent=t;}});
async function reply(text,next='listen'){
 $('reply').textContent=text;document.querySelectorAll('.dialog-reply').forEach(el=>el.textContent=text);
 history.push({role:'assistant',content:text});history=history.slice(-10);
 if(voice.enabled&&sessionActive)await voice.respond(text,next);else voice.state('off');
}
function interrupt(){epoch++;request?.abort();request=null;voice.pause();busy=false;}
function setCart(next){cart=next;reviewed=null;saveDraft();$('cartCount').textContent=cart.reduce((n,l)=>n+l.qty,0);}
function talk(){if(busy||sending)return;if(!sessionActive){sessionActive=true;voice.enable(true);}else if(voice.mode==='listening')voice.finish();else voice.listen();}
function closeModals(){carousel?.destroy();carousel=null;for(const id of ['optionsModal','summaryModal'])if($(id).open)$(id).close();}
function openModal(title,html){closeModals();$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('optionsModal').showModal();}
function showCategories(){category=null;openModal('¿Qué se te antoja?',`<div class="big-cards">${[['Platos','Solo','Platos a tu manera','🍗'],['Combos','Combo','Todo en un solo pedido','🍱'],['Extras','Extras','Un poco más de sabor','🍟'],['Bebidas','Bebidas','Algo para acompañar','🥤']].map(([c,n,d,e])=>`<button class="big-card" data-category="${c}"><span class="big-emoji">${e}</span><span class="big-label">${n}</span><span class="big-desc">${d}</span></button>`).join('')}</div>`);}
function showProducts(items,title,cat=null){
 category=cat;
 if(!items.length){reply('No hay productos disponibles en esta categoría.');return;}
 openModal(title,`<p class="runway-hint">Mira con calma. <strong>Dime el nombre de lo que prefieres.</strong></p><section class="runway" aria-label="Pasarela de productos" aria-roledescription="carrusel"><div class="runway-viewport" tabindex="0" aria-label="Productos; desliza para explorar"><div class="runway-track">${items.map(p=>`<article class="runway-card" data-product="${p.id}"><div class="runway-art">${foodArt(p)}</div><div class="runway-copy"><span class="runway-category">${esc(p.category)}</span><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><div class="runway-bottom"><strong>${money(p.price)}</strong><button class="add-product" data-add="${p.id}" aria-label="Agregar ${esc(p.name)}">Agregar +</button></div></div></article>`).join('')}</div></div><div class="runway-controls"><button data-carousel="prev" aria-label="Producto anterior">←</button><button data-carousel="pause" aria-pressed="false">Pausar</button><button data-carousel="next" aria-label="Producto siguiente">→</button></div></section>`);
 carousel=mountCarousel($('modalBody').querySelector('.runway'));carousel.hold(voice.mode==='listening');
}
function showCategory(cat){showProducts(menu.filter(p=>p.category===cat&&p.available),{Platos:'Algo solo, a tu gusto',Combos:'Más para compartir',Extras:'Ese extra que provoca',Bebidas:'Para acompañar'}[cat],cat);}
function review(){
 closeModals();if(!cart.length){reply('Todavía no tienes productos. ¿Qué se te antoja?');return;}
 $('summaryBody').innerHTML=cart.map(l=>{const p=menu.find(p=>p.id===l.id);return `<div class="summary-line"><span>${l.qty} × ${esc(p.name)}<small>${l.notes.map(esc).join(', ')}</small></span><strong>${money(p.price*l.qty)}</strong></div>`;}).join('')+`<div class="summary-total"><span>Total</span><strong>${money(total(cart,menu))}</strong></div><div class="customer-field"><label for="customerName">Nombre para retirar</label><input id="customerName" ${pending?'disabled':''} value="${esc(customerName)}" maxlength="60" autocomplete="given-name" placeholder="Tu nombre"></div><p class="muted">${mode==='demo'?'Pedido de prueba · no llega a un restaurante real.':'Para retirar en el restaurante.'}</p><button class="primary-button wide" id="confirmButton">${pending?'Reintentar el mismo envío':'Confirmar pedido'}</button>`;
 $('summaryModal').showModal();reviewed=cartSignature(cart,customerName);awaitingName=!customerName;
 reply(customerName?`Tu pedido suma ${money(total(cart,menu))}. ¿Lo envío?`:'¿A qué nombre va el pedido?');
}
async function handleInput(raw){
 raw=raw?.trim();if(!raw||!menu.length||busy||sending)return;
 interrupt();const turn=epoch;voice.state('thinking');$('transcript').textContent=`Tú: ${raw}`;history.push({role:'user',content:raw});const n=normalize(raw);
 if(pending){if(isConfirmation(raw))return submit();reply('Hay un envío pendiente de comprobar. Reintenta el mismo pedido desde el resumen.');return;}
 if(awaitingCancel){awaitingCancel=false;if(isConfirmation(raw)){setCart([]);closeModals();reply('Borrador borrado. ¿Qué se te antoja?');return;}if(/^(no|no gracias)$/.test(n)){reply('Conservo tu pedido.');return;}}
 if(/^(cierra|cierra eso|cierra la ventana|cerrar)$/.test(n)){closeModals();reviewed=null;reply('Listo.');return;}
 if(isConfirmation(raw)){
  if(cart.length&&customerName&&reviewed===cartSignature(cart,customerName))return submit();
  review();return;
 }
 const nav=navigation(raw);
 if(nav){awaitingName=false;reviewed=null;if(nav==='all'){showCategories();reply('Puedes elegir platos solos, combos, extras o bebidas.');}else{showCategory(nav);reply(`Aquí tienes ${nav==='Platos'?'los platos solos':nav.toLowerCase()}. Dime cuál prefieres.`);}return;}
 const explicit=raw.match(/^(?:me llamo|mi nombre es|a nombre de)\s+(.{2,60})$/i);
 if((explicit&&plausibleName(explicit[1]))||(awaitingName&&plausibleName(raw))){customerName=(explicit?explicit[1]:raw).trim();awaitingName=false;saveDraft();review();return;}
 if(/^(no quiero bebida|sin bebida|no deseo bebida|no gracias)$/.test(n)){reviewed=null;awaitingName=false;reply('De acuerdo. Dime si quieres algo más o revisar tu pedido.');return;}
 reviewed=null;awaitingName=false;busy=true;$('sendText').disabled=true;request=new AbortController();
 try{
  const res=await fetch('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:raw,cart,lastId,category,history:history.slice(0,-1).slice(-6)}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(22000)])});
  const result=await res.json();if(turn!==epoch)return;if(!res.ok)throw new Error(result.error||'No pude entender.');
  if(result.intent==='edit'){
   setCart(applyOperations(cart,result.operations,menu));lastId=result.operations.at(-1)?.id;
   closeModals();reply(result.reply||'Pedido actualizado. ¿Algo más?');
  }else if(result.intent==='menu'){
   if(result.category&&result.category!=='all')showCategory(result.category);else showCategories();reply(result.reply||'Dime qué prefieres.');
  }else if(result.intent==='recommend'){
   const items=(result.suggest_ids||[]).map(id=>menu.find(p=>p.id===id&&p.available)).filter(Boolean);if(items.length)showProducts(items,'Para ti');reply(result.reply);
  }else if(result.intent==='review')review();
  else if(result.intent==='cancel'){awaitingCancel=true;reply('¿Quieres borrar todo el borrador?');}
  else if(result.intent==='goodbye'&&!cart.length){await reply('Hasta pronto. Aquí estaré.','wait');sessionActive=false;voice.disable();}
  else reply(result.reply||'¿Qué producto prefieres?');
 }catch(e){if(turn===epoch)reply(e.name==='TimeoutError'?'Tardé demasiado. Conservé tu pedido; puedes intentarlo otra vez.':e.message);}
 finally{if(turn===epoch){busy=false;$('sendText').disabled=false;}}
}
async function submit(){
 if(sending||!cart.length||!customerName)return;
 if(!pending&&reviewed!==cartSignature(cart,customerName)){review();return;}
 closeModals();voice.pause();sending=true;voice.state('sending');
 pending=pending||{key:crypto.randomUUID(),items:structuredClone(cart),customer:customerName,confirmed:true};saveDraft();
 try{
  let order;
  if(mode==='demo'){
   const orders=readStore(ordersKey,[]);order=orders.find(o=>o.id===pending.key);
   if(!order){order={id:pending.key,number:pending.key.slice(0,6).toUpperCase(),items:pending.items.map(l=>({...l,name:menu.find(p=>p.id===l.id).name,price:menu.find(p=>p.id===l.id).price})),total:total(pending.items,menu),customer:pending.customer,status:'nuevo',createdAt:new Date().toISOString()};saveOrders([order,...orders].slice(0,200));}
  }else{const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(15000)});const data=await res.json();if(!res.ok)throw new Error(data.error);order=data.order;}
  pending=null;customerName='';setCart([]);lastId=null;awaitingName=false;history=[];
  toast(`Pedido ${mode==='demo'?'de prueba ':''}#${order.number} registrado`);
  await reply(mode==='demo'?`Listo, ${order.customer}. Tu pedido de prueba quedó registrado.`:`Listo, ${order.customer}. Tu pedido quedó registrado con el número ${order.number}.`,'wait');
 }catch(e){reply(`No pude confirmar el registro. Conservé el mismo envío para reintentar. ${e.message}`);}
 finally{sending=false;}
}
$('mascot').addEventListener('click',talk);document.querySelectorAll('[data-talk]').forEach(b=>b.addEventListener('click',talk));
$('stopVoice').addEventListener('click',()=>{sessionActive=false;voice.disable();});
$('voiceRate').addEventListener('change',e=>{voice.rate=Number(e.target.value);});
$('menuOpen').addEventListener('click',()=>handleInput('ver menú'));
$('cartOpen').addEventListener('click',()=>{interrupt();review();});
for(const form of document.querySelectorAll('[data-chat]'))form.addEventListener('submit',e=>{e.preventDefault();const input=form.querySelector('input');const text=input.value;input.value='';handleInput(text);});
$('modalBody').addEventListener('click',e=>{const cat=e.target.closest('[data-category]');const add=e.target.closest('[data-add]');if(cat)handleInput(`ver ${cat.dataset.category}`);if(add)handleInput(`Dame un ${menu.find(p=>p.id===add.dataset.add)?.name||''}`);});
$('summaryBody').addEventListener('click',e=>{if(e.target.id==='confirmButton'){const value=$('customerName').value.trim();if(value.length<2){$('customerName').focus();toast('Escribe un nombre para retirar.');return;}customerName=value;reviewed=cartSignature(cart,customerName);saveDraft();submit();}});
$('summaryBody').addEventListener('input',()=>{reviewed=null;});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
$('optionsModal').addEventListener('close',()=>{if(!$('optionsModal').open){carousel?.destroy();carousel=null;}});
$('summaryModal').addEventListener('close',()=>{if(!$('summaryModal').open){reviewed=null;awaitingName=false;}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){interrupt();voice.disable();sessionActive=false;}});
async function init(){try{const res=await fetch('/api/menu');const data=await res.json();if(!res.ok)throw new Error(data.error);({menu,restaurant,mode}=data);$('brandName').textContent=restaurant.name.toLowerCase();$('modeBadge').textContent=mode==='demo'?'Demo interactiva':'Conectado';const saved=readStore(storageKey,{});try{cart=validateCart(saved.cart||[],menu);pending=saved.pending||null;}catch{cart=[];pending=null;}customerName=saved.customer||'';setCart(cart);$('menuOpen').disabled=false;}catch{$('reply').textContent='No pude cargar el menú. Recarga la página.';$('mascot').disabled=true;}}
init();
