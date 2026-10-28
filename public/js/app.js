import {readMemory} from './order-memory.js';
import {money,total,validateCart,applyOperations,isConfirmation,isFinish,finishIntent,closingAnswer,normalize,describeOps,followUp,amount,parsePeople,suggestForPeople,soundsLike,parseRating,removalsFor,serveFor} from './domain.js';
import {navigation,extractCustomerName,cleanCustomerName,cartSignature} from './conversation.js';
import {foodArt} from './art.js';
import {VoiceController} from './voice.js';
import {initKiosk} from './kiosk.js';
import {staffRequest,statusLine} from './service.js';
import {listWords,numberWords} from './speech-text.js';
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
 customerName='',memory=null,pending=null,sending=false,sessionActive=false,awaitingName=false,reviewed=null,
 category=null,awaitingCancel=false,drinkOffered=false,spotTimers=[],idleTimer=0,
 asked=null,proposal=null, // pregunta pendiente de Milo y propuesta que espera un «sí»
 choices=null, // opciones que Milo acaba de ofrecer («el primero», «la segunda»)
 rating=null, // pedido recién enviado que espera calificación
 detail=null, // ficha abierta: {id, notes:Set}
 upsold=false,roundNote=false,kiosk=null,
 onScreen=[],mentioned=null; // tarjetas en pantalla y el último producto que Milo nombró // sugerencia de acompañante (una vez), aviso de pedido aparte, avisos a caja
function saveDraft(){try{localStorage.setItem(storageKey,JSON.stringify({cart,pending,memory,customer:customerName}));}catch{}}
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
// Si Milo iba a decir exactamente lo mismo que acaba de decir, el cliente está atascado: se le da otra salida.
function unstick(text){
 const prev=history.filter(h=>h.role==='assistant').at(-1)?.content;
 if(!prev||normalize(prev)!==normalize(text))return text;
 // Volver a mostrar un menú que se pidió otra vez no es atasco; sí lo es repetir la misma pregunta o el mismo «no entendí».
 if(!($('summaryModal').open&&cart.length)&&!/hielo|botella|cu[aá]nt|puedes decir|entend|repet|pedido nada|¿cu[aá]l te anoto/i.test(text))return text;
 if($('summaryModal').open&&cart.length)return 'Para mandarlo a cocina dime «sí» o «envíalo». Si quieres cambiar algo, dime qué.';
 if(/hielo|botella/.test(text))return '¿Cómo la quieres: con hielo, sin hielo o solo la botella?';
 if(/cu[aá]ntos/.test(text))return 'Dime solo el número, por ejemplo «dos». ¿Para cuántas personas es?';
 return cart.length?'Puedes pedirme otro plato, preguntarme qué trae algo, o decir «eso es todo» para cerrar.':'Puedes decirme un plato, por ejemplo «un cuarto de pollo», o pedirme «muéstrame el menú».';
}
async function reply(text,next='listen'){
 text=unstick(text);
 // Segunda ronda: lo nuevo se envía como otro pedido para la misma mesa.
 if(roundNote&&/^(Va|Van) /.test(text)){roundNote=false;text=text.replace(/\s*(¿[^¿]*\?)\s*$/,' Lo mando como un pedido aparte para tu mesa. $1');}
 fresh($('reply'),text);document.querySelectorAll('.dialog-reply').forEach(el=>fresh(el,text));
 // Solo cuenta la última pregunta de la frase («Aquí tienes las bebidas… ¿Cuál te provoca?» no es ofrecer bebida).
 const question=text.match(/¿([^¿?]*)\?\s*$/)?.[1]||'';
 if(/para cu[aá]ntos|cu[aá]ntas personas|cu[aá]ntos son/i.test(question))asked='people';
 else if(/para tomar|bebida/i.test(question)){asked='drink';drinkOffered=true;}
 else if(/algo m[aá]s|qu[eé] m[aá]s te anoto|finalizamos|cerramos|lo env[ií]o a cocina|lo env[ií]o as[ií]/i.test(question)&&!$('summaryModal').open)asked='more';
 else if(/qu[eé] trae|el precio/i.test(question))asked=/precio/.test(question)?'price':'detail';
 // Si Milo nombra un solo producto («Lo que más sale es el combo personal»), ese es «ese» para el cliente.
 const named=productsIn(text);if(named.length)mentioned=named.length===1?named[0]:null;
 history.push({role:'assistant',content:text});history=history.slice(-10);
 if(voice.enabled&&sessionActive)await voice.respond(text,next);else{voice.state(voice.enabled?'waiting':'off');spotlight(text);}
}
// «El primero», «la segunda», «el último»: posición de la tarjeta en pantalla.
function ordinal(n,named=0){
 return /\b(primer[oa]?|el uno|la uno)\b/.test(n)?0:/\b(segund[oa]|el dos|la dos)\b/.test(n)?1:/\b(tercer[oa]?)\b/.test(n)?2:!named&&/\b(cuart[oa])\b/.test(n)&&!/cuarto de pollo/.test(n)?3:/\b(quint[oa])\b/.test(n)?4:/\b(ultim[oa])\b/.test(n)?onScreen.length-1:-1;
}
function productsIn(text){
 const n=` ${normalize(text)} `;
 return [...new Set(menu.filter(p=>p.available&&[p.name,...(p.aliases||[])].some(a=>a.length>3&&n.includes(` ${normalize(a)} `))).map(p=>p.id))];
}
// De qué producto se habla cuando el cliente no lo nombra: la ficha abierta, la única tarjeta en pantalla o,
// con varias, la que Milo acaba de nombrar (si no, se pregunta cuál). Sin menú abierto: lo último nombrado o pedido.
function focusId(){
 if(detail&&$('detailSheet').open)return detail.id;
 if($('optionsModal').open&&onScreen.length){if(onScreen.length===1)return onScreen[0];return onScreen.includes(mentioned)?mentioned:null;}
 return mentioned||lastId;
}
function interrupt(){epoch++;request?.abort();request=null;voice.pause();busy=false;}
function setCart(next){
 const before=cart.reduce((n,l)=>n+l.qty,0);cart=next;reviewed=null;saveDraft();
 const count=cart.reduce((n,l)=>n+l.qty,0);if(!before&&count&&menu.length&&tab().orders.length&&!tab().billed)roundNote=true;
 const badge=$('cartCount');badge.textContent=count;badge.classList.toggle('on',count>0);
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
// Letrerito sobre el menú: un consejo según lo que se está viendo.
function menuSign(cat){
 const drinks=cat==='Bebidas';
 // La promoción del día (panel) va en el letrerito de la portada del menú.
 if(cat==='promo'&&restaurant?.promo)return `<div class="menu-sign promo" role="note"><span class="sign-pin" aria-hidden="true"></span><span class="sign-icon" aria-hidden="true">⭐</span><p><b>Hoy:</b> ${esc(restaurant.promo)}</p></div>`;
 const text=drinks?'¿La quieres en botella, con hielo o sin hielo? Solo dímelo al pedir y queda anotado.':'Recuerda: antes de pedir, pregúntame «¿qué trae?» y te muestro sus ingredientes.';
 return `<div class="menu-sign" role="note"><span class="sign-pin" aria-hidden="true"></span><span class="sign-icon" aria-hidden="true">${drinks?'🥤':'🍗'}</span><p>${text}</p></div>`;
}
function showCategories(){
 category=null;onScreen=[];
 openSheet('Menú',`${menuSign(restaurant?.promo?'promo':null)}<div class="doors">${Object.keys(categories).map((c,i)=>{const items=menu.filter(p=>p.category===c&&p.available);const hero=items.find(p=>p.tag)||items[0];return hero?`<button class="door" style="--i:${i}" data-category="${c}"><span class="art">${foodArt(hero)}</span><strong>${c}</strong><span>${items.length} opciones</span></button>`:'';}).join('')}</div>`);
}
function showProducts(items,title,cat=null){
 category=cat;onScreen=items.map(p=>p.id);
 if(!items.length){reply('Ahora mismo no hay productos disponibles aquí.');return;}
 openSheet(title,`${menuSign(cat||(items.every(p=>p.category==='Bebidas')?'Bebidas':null))}<div class="shelf" tabindex="0" aria-label="${esc(title)}">${items.map((p,i)=>`<article class="dish${p.available?'':' soldout'}" style="--i:${i}" data-product="${p.id}"><div class="art">${foodArt(p)}</div><span class="tag">${esc(p.available?p.tag||'':'Agotado hoy')}</span><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><footer><span class="price">${money(p.price)}</span>${p.ingredients?.length>1?`<button class="info" data-detail="${p.id}">Qué trae</button>`:''}${p.available?`<button class="add" data-add="${p.id}" aria-label="Agregar ${esc(p.name)}">Agregar</button>`:'<span class="soldout-note">Agotado</span>'}</footer></article>`).join('')}</div>`,cat);
}
// Los agotados se ven en gris al final (así el cliente sabe que hoy no hay), pero Milo no los ofrece.
function showCategory(cat){const items=menu.filter(p=>p.category===cat);showProducts([...items.filter(p=>p.available),...items.filter(p=>!p.available)],cat,cat);}
const spokenName=p=>p.category==='Bebidas'?p.name:p.name.charAt(0).toLowerCase()+p.name.slice(1);
// Presentación oral de toda la categoría, en el mismo orden que las tarjetas.
let pitchTurn=0;
function categoryPitch(cat){
 const items=menu.filter(p=>p.category===cat&&p.available);
 const list=listWords(items.map(p=>p.one||spokenName(p))),c=cat.toLowerCase();
 // Misma información, distinta forma de decirla: Milo no suena a grabación.
 return [`Aquí tienes el menú de ${c}. Tenemos ${list}. ¿Cuál te provoca?`,`Mira, en el menú de ${c} hay ${list}. ¿Qué se te antoja?`,`Te muestro el menú de ${c}: ${list}. ¿Cuál te llama?`][pitchTurn++%3];
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
 $('summaryBody').innerHTML=cart.length?`<div class="ticket">${cart.map((l,i)=>{const p=menu.find(p=>p.id===l.id);return `<div class="line" style="--i:${i}"><span class="qty">${l.qty}</span><span><b>${esc(p.name)}</b><small>${l.notes.map(esc).join(' · ')}</small></span><strong>${(p.price?money(p.price*l.qty):'Sin costo')}</strong></div>`;}).join('')}<div class="total"><span>Total</span><strong>${money(total(cart,menu))}</strong></div><label class="field">${table?'¿A nombre de quién va?':'Nombre para retirar'}<input id="customerName" ${pending?'disabled':''} value="${esc(customerName)}" maxlength="60" autocomplete="given-name" placeholder="Tu nombre"></label>${table?`<p class="where">Mesa ${table}${mode==='demo'?' · pedido de prueba':''}</p>`:`<p class="where">${mode==='demo'?'Pedido de prueba · no llega a un restaurante real.':'Para retirar en el restaurante.'}</p>`}<button class="send" id="confirmButton">${pending?'Reintentar el mismo envío':'Enviar a cocina'}</button></div>`:'<p class="empty">Todavía no hay nada aquí.</p>';
}
let reviewTurn=0;
// «¿Algo más, o cerramos?» → «ya, no quiero nada más»: se muestra la factura y se envía de una, diciendo qué va.
function sendNow(){
 if(memory){memory=null;saveDraft();}
 if(!customerName){review();return;}
 if($('optionsModal').open)$('optionsModal').close();
 renderSummary();if(!$('summaryModal').open)$('summaryModal').showModal();
 reviewed=cartSignature(cart,customerName);
 submit(`Va así: ${summaryLines()}. Son ${money(total(cart,menu))}.`);
}
// Lo que se pidió, como lo diría un mesero: «dos cuartos de pollo sin cebolla y una Coca-Cola en botella».
const summaryLines=()=>listWords(cart.map(l=>{const p=menu.find(p=>p.id===l.id);return amount(p,l.qty)+(l.notes.length?` ${l.notes.join(' y ')}`:'');}));
function review(){
 // Con una aclaración pendiente la factura se muestra igual (ya no se repite «falta aclarar» en bucle):
 // Milo recuerda qué falta y que «así está bien» lo envía sin eso.
 const pendingNote=memory?` Antes de enviarlo: ${memory.question} Si no, dime «así está bien» y lo mando a cocina.`:'';
 if($('optionsModal').open)$('optionsModal').close();
 if(!cart.length){reply('Todavía no has pedido nada. ¿Qué se te antoja?');return;}
 renderSummary();if(!$('summaryModal').open)$('summaryModal').showModal();
 reviewed=cartSignature(cart,customerName);awaitingName=!customerName&&!memory;
 if(!customerName&&!pendingNote){
  reply(`Son ${money(total(cart,menu))}. ¿A nombre de quién va el pedido?`);
 }else{
  const open=['Llevas','Te confirmo:','Va así:'][reviewTurn++%3];
  reply(`${open} ${summaryLines()}. Son ${money(total(cart,menu))}.${pendingNote||' ¿Lo envío a cocina?'}`);
 }
}
// ---------- Servicio de mesa: llamar al personal, la cuenta y cómo va el pedido ----------
const tabKey=`${storageKey}:mesa`;
function tab(){const t=readStore(tabKey,{orders:[]});return Date.now()-(t.at||0)<6*3600000?t:{orders:[]};}
function saveTab(t){try{localStorage.setItem(tabKey,JSON.stringify({...t,at:Date.now()}));}catch{}}
async function tabOrders(){
 const ids=tab().orders;if(!ids.length)return [];
 if(mode==='demo'){const all=readStore(ordersKey,[]);return ids.map(id=>all.find(o=>o.id===id)).filter(Boolean);}
 const res=await fetch(`/api/orders?ids=${ids.join(',')}`,{signal:AbortSignal.timeout(8000)});const data=await res.json();if(!res.ok)throw new Error(data.error);return data.orders;
}
const payWords={efectivo:'en efectivo',tarjeta:'con tarjeta',transferencia:'por transferencia'};
async function serveTable(req){
 busy=true;
 try{return await _serveTable(req);}finally{busy=false;}
}
async function _serveTable(req){
 if(req.type==='waiter'){
  if(!table){reply('Para eso acércate a caja, por favor. ¿Te ayudo con algo del menú?');return;}
  const sent=await kiosk?.notify('waiter',req.need?{need:req.need}:{});
  if(!sent){reply('No pude avisar al personal. Por favor, llama a un mesero directamente.');return;}
  reply(req.need?`Listo, ya le avisé al personal que necesitas ${req.need}. En un momento te lo traen.`:'Listo, ya le avisé al personal. En un momento se acerca alguien.');return;
 }
 if(req.type==='bill'){
  if(!table){reply('La cuenta se paga en caja al retirar tu pedido.');return;}
  // Con cosas sin enviar, primero el resumen (ahí ya va el total y la pregunta de enviarlo).
  if(cart.length){review();return;}
  let orders=[];try{orders=(await tabOrders()).filter(o=>o.status!=='cancelado');}catch{}
  const due=orders.reduce((a,o)=>a+o.total,0);
  const sent=await kiosk?.notify('bill',{...(req.pay?{pay:req.pay}:{}),...(orders.length?{total:due}:{})});
  if(!sent){reply('No pude enviar el aviso de la cuenta. Por favor, pide ayuda al personal.');return;}
  saveTab({...tab(),billed:true});
  reply(orders.length?`Listo, ya pedí tu cuenta: son ${money(due)}. ${req.pay?`Le avisé que pagas ${payWords[req.pay]}.`:'Puedes pagar en efectivo, con tarjeta o por transferencia.'} En un momento se acerca alguien.`:'Listo, ya le avisé al personal que quieres la cuenta. En un momento se acerca alguien.');return;
 }
 // Estado del pedido según lo que marca caja.
 let orders;
 try{orders=await tabOrders();}catch{kiosk?.notify('waiter',{need:'pregunta por su pedido'});reply('No pude ver tu pedido ahora, así que le avisé al personal para que te cuente.');return;}
 if(!orders.length){if(cart.length){review();return;}reply('Todavía no has enviado ningún pedido desde esta mesa. ¿Qué se te antoja?');return;}
 const last=[...orders].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
 let text=statusLine[last.status]||'Tu pedido está en camino.';
 if(req.complaint||last.status==='cancelado'){kiosk?.notify('waiter',{need:'pregunta por su pedido'});text+=' Igual le avisé al personal para que lo revise.';}
 reply(text);
}
// Un buen mesero sugiere un acompañante una sola vez: lo que el plato no trae (arroz si ya trae papas).
function upsellStep(ops,text){
 if(upsold||/para tomar/i.test(text))return text;
 const plate=ops.filter(o=>o.type==='add').map(o=>menu.find(p=>p.id===o.id)).find(p=>p?.category==='Platos');
 if(!plate||cart.some(l=>['Extras','Combos'].includes(menu.find(p=>p.id===l.id)?.category)))return text;
 const has=normalize([plate.desc,...(plate.ingredients||[])].join(' '));
 const side=['papas','arroz','ensalada'].map(id=>menu.find(p=>p.id===id&&p.available)).find(p=>p&&!has.includes(normalize(p.name).split(' ')[0]));
 if(!side)return text;
 upsold=true;proposal={operations:[{type:'add',id:side.id,qty:1}],no:'Listo. ¿Algo más, o cerramos el pedido?'};
 return `${text.replace(/\s*¿[^¿]*\?\s*$/,'')} ¿Le sumo ${side.one||side.name}? Va muy bien con ${(plate.one||plate.name).replace(/^(un|una|unas|unos) /,a=>({'un ':'el ','una ':'la ','unas ':'las ','unos ':'los '})[a])}.`;
}
// Bebida suelta: si el cliente dijo cómo la quiere («una coca en botella», «sin hielo») se anota y sale en la factura.
function serveStep(ops,said,text){
 // Solo si el cliente lo dijo («una coca en botella»): Milo no pregunta por el hielo.
 const how=serveFor(said);if(!how)return text;
 const op=[...ops].reverse().find(o=>o.type==='add'&&menu.find(p=>p.id===o.id)?.serve?.includes(how));
 if(!op)return text;const p=menu.find(x=>x.id===op.id);
 if(cart.find(l=>l.id===op.id)?.notes.some(n=>p.serve.includes(n)))return text;
 try{setCart(applyOperations(cart,[{type:'note',id:op.id,note:how}],menu));}catch{return text;}
 return text.replace(/\.(\s|$)/,` ${how}.$1`);
}
function addDirect(id){
 if(busy)return;
 interrupt();activity();
 const sold=menu.find(x=>x.id===id&&!x.available);if(sold){reply(`Uy, hoy ya no nos queda ${sold.name.toLowerCase()}. ¿Te muestro otra opción?`);return;}const operations=[{type:'add',id,qty:1}];
 try{const before=cart;setCart(applyOperations(cart,operations,menu));lastId=id;$('modalBody').querySelector(`.dish[data-product="${id}"]`)?.classList.add('added');reply(upsellStep(operations,serveStep(operations,'',`${describeOps(operations,menu)} ${followUp(before,operations,menu,drinkOffered)}`)));}
 catch(e){reply(e.message);}
}

async function handleInput(raw){
 raw=raw?.trim();if(!raw||!menu.length||busy||sending)return;
 // «said» es lo que se oyó (se muestra y va a la IA); «raw» queda corregido para entenderlo («piatos» → platos).
 const said=raw;raw=soundsLike(said,menu);
 activity();interrupt();const turn=epoch;voice.state('thinking');$('transcript').textContent=`«${said}»`;$('voiceHelp').textContent='';history.push({role:'user',content:said});const n=raw;
 if(pending){if(isConfirmation(raw))return submit();reply('Hay un envío pendiente de comprobar. Reintenta el mismo pedido desde el resumen.');return;}
 if(awaitingCancel){awaitingCancel=false;if(isConfirmation(raw)){memory=null;history=[];setCart([]);drinkOffered=false;closeModals();reply('Listo, empezamos de cero. ¿Qué se te antoja?');return;}if(/^(no|no gracias)$/.test(n)){reply('Perfecto, lo dejo como está.');return;}}
 // Cerrar va antes que cualquier aclaración pendiente: «ya, sí, no quiero nada más» envía aunque la IA haya
 // dejado una pregunta abierta. Frente a la factura o a «¿Algo más, o cerramos?» se envía directo.
 // Con una pregunta pendiente, un «sí» suelto la contesta; solo «no quiero nada más», «así está bien»… cierran.
 const declines=/\b(?:no|nada|asi esta bien|asi nomas|eso es todo|seria todo|ya esta|con eso|suficiente|hasta ahi|solo eso|no mas|ya estuvo|ya quedo|hecho)\b/.test(n);
 const closing=cart.length&&!productsIn(said).length&&(!memory||declines)?closingAnswer(said):null;
 if(closing==='send'&&$('summaryModal').open){if(customerName&&reviewed===cartSignature(cart,customerName))return submit();}
 // A «¿Algo más, o cerramos?» un «sí» o «dale» solos son ambiguos (¿sí, algo más?): se pregunta. «Ya», «listo»,
 // «no quiero nada más» o «mándalo» sí cierran.
 if(closing==='send'&&asked==='more'&&!$('summaryModal').open){
  if(/^(?:si|claro|dale|bueno|ok|okey|aja|si si|claro que si|va|vale)$/.test(n)){reply('¿Qué más te anoto, o lo envío así?');return;}
  asked=null;return sendNow();
 }
 if(memory&&declines&&cart.length&&!productsIn(said).length&&(isFinish(raw)||finishIntent(said))){memory=null;saveDraft();review();return;}
 // El nombre tiene prioridad sobre la IA; no borra aclaraciones de productos.
 const captured=cart.length&&!isConfirmation(raw)&&!isFinish(raw)&&!declines
   ?extractCustomerName(said,{awaiting:awaitingName}):null;
 if(captured){customerName=captured;awaitingName=false;saveDraft();
  if(cart.length&&!memory){renderSummary();if(!$('summaryModal').open)$('summaryModal').showModal();reviewed=cartSignature(cart,customerName);await submit(`Perfecto, a nombre de ${customerName}.`);return;}
  review();return;
 }
 if(memory&&cart.length&&/^(?:asi esta bien|asi nomas|eso es todo|no agregues eso|ignora esa parte|descarta esa parte|sin eso)$/.test(n)){
   memory=null;saveDraft();review();return;
 }
 if(memory)return matchInput(said,turn);
 // Ficha abierta: quitar/poner ingredientes por voz, «agrégalo» para anotarlo, cualquier otra cosa la cierra.
 if(detail&&$('detailSheet').open){
  const p=menu.find(x=>x.id===detail.id);const {remove,restore}=removalsFor(said,p);
  if(remove.length||restore.length){remove.forEach(o=>detail.notes.add(o));restore.forEach(o=>detail.notes.delete(o));renderDetail();
   reply(`${remove.length?`Listo, ${listWords(remove)}`:`Listo, ${listWords(restore.map(o=>o.replace(/^sin /,'con ')))}`}. ¿Te lo anoto así?`);return;}
  // «Cierra», «no», «nada» cierran la ficha sin anotar (aunque «cierra» también sirva para cerrar el pedido).
  if(/^(?:no|no gracias|nada|cierra|cierralo|cierra eso|cerrar|despues|ahora no|asi no|mejor no)$/.test(n)){detail=null;$('detailSheet').close();reply('Listo. ¿Qué más te provoca?');return;}
  if(isConfirmation(raw)||/\b(agregalo|agregamelo|anotalo|anotamelo|ponlo|ponmelo|damelo|damela|dame ese|dame eso|lo quiero|la quiero|me lo llevo|me quedo con (?:ese|esa)|asi esta bien|asi nomas|dale|guardalo|de una|simon)\b/.test(n)){commitDetail();return;}
  detail=null;$('detailSheet').close();
  if(/^(no|no gracias|nada|cierra|cerrar|despues)$/.test(n)){reply('Listo. ¿Qué más te provoca?');return;}
 }
 // Calificación pendiente: «cuatro y media», «excelente», «ahora no».
 if(rating){
  const stars=parseRating(said);
  if(stars){finishRating(stars,said);return;}
  const other=staffRequest(said);
  if(!other&&/^(no|ahora no|despues|luego|no gracias|nada|paso)\b/.test(n)){finishRating(null);reply('Sin problema. ¡Buen provecho!','wait');return;}
  if(!other&&n.split(' ').length<=2&&rating.tries++<1){reply('¿De una a cinco, cuántas estrellas me das?');return;}
  // Ya está pidiendo otra cosa («otra coca», «la cuenta»): se deja la calificación y se le atiende.
  finishRating(null);
 }
 const service=staffRequest(said);
 // Con un pedido en curso, lo de la mesa (vasos, servilletas, cubiertos…) se anota en el pedido, sin costo, y sale
 // en la factura; si además nombra comida o bebida, todo va junto. Sin pedido en curso, se avisa al personal.
 const namedNow=productsIn(raw),mesaNow=namedNow.filter(id=>menu.find(p=>p.id===id)?.category==='Mesa');
 const toCart=service?.type==='waiter'&&service.need&&(namedNow.some(id=>!mesaNow.includes(id))||(cart.length&&mesaNow.length>=service.need.split(', ').length));
 if(service&&!toCart){
  asked=null;proposal=null;choices=null;await serveTable(service);return;
 }
 // Respuestas a lo último que Milo preguntó o propuso.
 const lastAsked=asked,offer=proposal,options=choices;asked=null;proposal=null;choices=null;
 // «¿Algo más, o cerramos el pedido?»: «no», «nada», «así está bien» → sale la factura para enviar a cocina.
 if(lastAsked==='more'&&cart.length&&/^(?:no|nada|nada mas|no gracias|ya no|asi esta bien|asi nomas|eso|eso nomas|no nada mas|no ya esta|no eso es todo|cerremos|cerramos|finalizamos|finalizar|ya|con eso|suficiente|hasta ahi|solo eso|ya estuvo|ya quedo|hecho|asi mero|dale nomas|seria todo)$/.test(n)){review();return;}
 if(lastAsked==='more'&&/^(?:si|claro|bueno|dale|ok|si quiero|si algo mas|si mas)$/.test(n)){reply('¡Dale! ¿Qué más te anoto?');return;}
 // «¿De cuál quieres saber qué trae?» → «el familiar», «el segundo»: se abre su ficha, no se agrega.
 if(lastAsked==='detail'){
  const named=productsIn(raw);const pick=named.length===1?named[0]:onScreen[ordinal(n,named.length)];
  if(pick&&!/\b(dame|ponme|quiero|agrega|anota|traeme)\b/.test(n)){openDetail(pick);return;}
 }
 if(lastAsked==='price'){
  const named=productsIn(raw);const p=menu.find(x=>x.id===(named.length===1?named[0]:onScreen[ordinal(n,named.length)]));
  if(p&&!/\b(dame|ponme|quiero|agrega|anota|traeme)\b/.test(n)){mentioned=p.id;reply(`${p.name} cuesta ${money(p.price)}. ¿Te lo anoto?`);proposal={operations:[{type:'add',id:p.id,qty:1}]};return;}
 }
  // Con tarjetas en pantalla: «qué trae la segunda», «cuánto cuesta el primero», «dame el último».
 if($('optionsModal').open&&onScreen.length>1&&!productsIn(raw).length){
  const p=menu.find(x=>x.id===onScreen[ordinal(n)]);
  if(p&&/\b(que (?:trae|tiene|lleva|incluye)|ingredientes|de que es)\b/.test(n)){openDetail(p.id);return;}
  if(p&&/\b(cuanto|precio|cuesta|vale)\b/.test(n)){mentioned=p.id;reply(`${p.name} cuesta ${money(p.price)}. ¿Te lo anoto?`);proposal={operations:[{type:'add',id:p.id,qty:1}]};return;}
  if(p&&/\b(dame|ponme|quiero|anotame|agregame|agrega|traeme|me das|regalame|pasame|me llevo|me quedo con)\b/.test(n)){addDirect(p.id);return;}
 }
 // «La coca en botella», «que sea sin hielo» después de pedirla: se anota en esa bebida y sale en la factura.
 const how=serveFor(raw),drinks=cart.filter(l=>menu.find(p=>p.id===l.id)?.serve?.includes(how));
 if(how&&drinks.length&&!productsIn(raw).some(id=>!drinks.some(l=>l.id===id))&&!/\b(dame|quiero|ponme|otra|otro)\b/.test(n)){
  const target=productsIn(raw).find(id=>drinks.some(l=>l.id===id))||(drinks.some(l=>l.id===lastId)?lastId:drinks.at(-1).id);
  setCart(applyOperations(cart,[{type:'note',id:target,note:how}],menu));if($('summaryModal').open)renderSummary();
  reply(`Listo, ${menu.find(p=>p.id===target).name} ${how}. ¿Algo más, o cerramos el pedido?`);return;
 }
 if(options){
  const pick=/\b(primer[oa]?|el uno|la uno|la de arriba|el de arriba)\b/.test(n)?0:/\b(segund[oa]|el dos|la dos|el otro|la otra|ultim[oa]|el de abajo|la de abajo)\b/.test(n)?1:/\b(tercer[oa]?)\b/.test(n)?2:-1;
  if(pick>=0&&options[pick]){addDirect(options[pick]);return;}
  if(isConfirmation(raw)&&!offer){choices=options;reply(`¿Cuál te anoto: ${listWords(options.map(id=>menu.find(p=>p.id===id)).filter(Boolean).map(p=>p.one||p.name)).replace(/ y ([^,]*)$/,' o $1')}?`);return;}
 }
 if(offer&&isConfirmation(raw)&&!$('summaryModal').open){
  try{const before=cart;setCart(applyOperations(cart,offer.operations,menu));lastId=offer.operations.at(-1).id;reply(serveStep(offer.operations,said,`${describeOps(offer.operations,menu)} ${followUp(before,offer.operations,menu,drinkOffered)}`));}catch(e){reply(e.message);}
  return;
 }
 if(offer&&/^(no|no gracias|mejor no|nada|todavia no|asi nomas|asi esta bien|no asi esta bien)$/.test(n)){reply(offer.no||'Sin problema. ¿Qué se te antoja entonces?');return;}
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
 // Cerrar el pedido: «sí, envíalo», pero también «gracias», «eso es todo», «mándalo a la cocina»…
 // Con el resumen vigente en pantalla se envía; si no, primero se muestra el resumen.
 // Con ruido alrededor («jajaja ya finaliza el pedido») también cuenta, si no nombra productos nuevos.
 // Frente a la factura, un «sí» que llega con charla detrás («sí sí, oye pásame…») también envía; nunca si
 // pone condiciones («sí, pero quita la cola») o nombra productos.
 const summaryYes=$('summaryModal').open&&/^(?:si|ya|dale|listo|ok|okey|claro|de una|simon|bueno)\b/.test(n)&&!/\b(pero|no|quita|quitale|cambia|agrega|agregale|sin|otro|otra|falta|espera|aunque)\b/.test(n)&&!productsIn(said).length;
 if(isConfirmation(raw)||summaryYes||(cart.length&&(isFinish(raw)||(finishIntent(said)&&!productsIn(said).length)))){
  if(cart.length&&customerName&&reviewed===cartSignature(cart,customerName))return submit();
  if(awaitingName&&!customerName){reply('Primero dime tu nombre. Por ejemplo: «a nombre de Pérez».');return;}
  review();return;
 }
 const nav=navigation(raw);
 if(nav){awaitingName=false;reviewed=null;if(nav==='all'){showCategories();reply('Este es el menú: platos, combos, extras y bebidas. ¿Por dónde empezamos?');}else{showCategory(nav);reply(categoryPitch(nav));}return;}
 if(/^(no quiero bebida|sin bebida|no deseo bebida|no gracias)$/.test(n)){reviewed=null;awaitingName=false;drinkOffered=true;reply('Sin bebida, entonces. ¿Algo más, o cerramos el pedido?');return;}
 return matchInput(said,turn);
}
async function matchInput(said,turn){
 reviewed=null;awaitingName=false;busy=true;$('sendText').disabled=true;request=new AbortController();
 try{
  const res=await fetch('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:said,cart,memory,lastId,category,table,drinkOffered,focus:focusId(),shown:$('optionsModal').open?onScreen:[],history:history.slice(0,-1).slice(-6)}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(22000)])});
  const result=await res.json();if(turn!==epoch)return;if(!res.ok)throw new Error(result.error||'No pude entender.');
  memory=readMemory(result.memory);saveDraft();
  if(detail&&$('detailSheet').open&&result.intent!=='detail'){detail=null;$('detailSheet').close();}
  if(result.intent==='edit'){
   setCart(applyOperations(cart,result.operations,menu));lastId=result.operations.at(-1)?.id;
   if($('summaryModal').open)renderSummary();
   reply(memory?result.reply:upsellStep(result.operations,serveStep(result.operations,said,result.reply||'Listo. ¿Algo más, o cerramos el pedido?')));
  }else if(result.intent==='menu'&&result.source==='fallback'&&$('optionsModal').open){reply(result.reply.replace(/Te muestro el menú: |Aquí tienes el menú, /,''));
  }else if(result.intent==='menu'){
   // Categoría concreta: siempre la presentación completa (nombra todo y sincroniza el foco de las tarjetas).
   if(result.category&&result.category!=='all'){showCategory(result.category);reply(categoryPitch(result.category));}else{showCategories();reply(result.reply||'Este es el menú. ¿Por dónde empezamos?');}
  }else if(result.intent==='recommend'){
   const items=(result.suggest_ids||[]).map(id=>menu.find(p=>p.id===id&&p.available)).filter(Boolean);if(items.length)showProducts(items,'Para ti');
   // Si la recomendación trae propuesta concreta, un «sí» la anota.
   if(result.proposal?.length)proposal={operations:result.proposal};
   else if(items.length>=2&&items.length<=4)choices=items.map(p=>p.id);
   else if(result.suggest_ids?.length===1&&/anot/i.test(result.reply))proposal={operations:[{type:'add',id:result.suggest_ids[0],qty:1}]};
   reply(result.reply);
  }else if(result.intent==='detail'&&result.suggest_ids?.[0]){openDetail(result.suggest_ids[0]);
  }else if(result.intent==='review')review();
  else if(result.intent==='cancel'){awaitingCancel=true;reply('¿Borro todo el pedido y empezamos de cero?');}
  else if(result.intent==='goodbye'&&!cart.length){await reply(result.reply||'¡Gracias! Aquí estaré.','wait');sessionActive=false;voice.disable();}
  else reply(result.reply||'¿Qué te provoca?');
 }catch(e){if(turn===epoch){if(memory)memory=readMemory(memory);saveDraft();}if(turn===epoch)reply(e.name==='TimeoutError'?'Me tardé demasiado. Tu pedido sigue igual; dímelo otra vez, por favor.':e.message);}
 finally{if(turn===epoch){busy=false;$('sendText').disabled=false;}}
}
async function submit(intro=''){
 if(sending||!cart.length||!customerName)return;
 if(memory){reply(`Todavía falta aclarar esta parte: ${memory.question} Puedes contestar o decir «así está bien» para dejarla fuera.`);return;}
 if(!pending&&reviewed!==cartSignature(cart,customerName)){review();return;}
 closeModals();voice.pause();sending=true;voice.state('sending');
 pending=pending||{key:crypto.randomUUID(),items:structuredClone(cart),customer:customerName,...(table?{table}:{}),confirmed:true};saveDraft();
 try{
  let order;
  if(mode==='demo'){
   const orders=readStore(ordersKey,[]);order=orders.find(o=>o.id===pending.key);
   if(!order){order={id:pending.key,number:pending.key.slice(0,6).toUpperCase(),items:pending.items.map(l=>({...l,name:menu.find(p=>p.id===l.id).name,price:menu.find(p=>p.id===l.id).price})),total:total(pending.items,menu),customer:pending.customer,...(pending.table?{table:pending.table}:{}),fulfillment:pending.table?'mesa':'retiro',status:'nuevo',createdAt:new Date().toISOString()};saveOrders([order,...orders].slice(0,200));}
  }else{const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(15000)});const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error||'No pude enviar el pedido.'),{status:res.status});order=data.order;}
  const t=tab();saveTab({orders:[...(t.billed?[]:t.orders),order.id].slice(-10),billed:false});
  pending=null;memory=null;customerName='';setCart([]);lastId=null;mentioned=null;awaitingName=false;drinkOffered=false;upsold=false;roundNote=false;history=[];
  toast(`Pedido ${mode==='demo'?'de prueba ':''}#${order.number} registrado`);
  const done=mode==='demo'?'Listo, tu pedido de prueba quedó registrado.'
   :order.table?`Listo, la orden de ${order.customer} ya está en cocina. Que tengan una excelente velada. Cualquier cosa, estoy para atenderles.`
   :`Listo, ${order.customer}. Tu pedido es el número ${order.number}. La orden ha sido enviada.`;
  startRating(order);await reply(`${intro?`${intro} `:''}${done}`,'listen');
 }catch(e){
  if([400,409].includes(e.status)){
   pending=null;reviewed=null;saveDraft();
   try{
    const response=await fetch('/api/menu');if(response.ok){
     const data=await response.json();menu=data.menu;
     const available=cart.filter(l=>menu.some(p=>p.id===l.id&&p.available));
     if(available.length!==cart.length)setCart(available);
    }
   }catch{}
   if(cart.length){renderSummary();if(!$('summaryModal').open)$('summaryModal').showModal();}
   reply(`No pude enviar el pedido: ${e.message} Puedes corregirlo y volver a confirmar.`);
  }else reply(`No pude confirmar el envío. Guardé el mismo pedido para reintentar. ${e.message}`);
 }
 finally{sending=false;}
}

// ---------- Ficha del producto ----------
const lower=t=>t.charAt(0).toLowerCase()+t.slice(1);
function renderDetail(){
 const p=menu.find(x=>x.id===detail.id);const removed=detail.notes;
 // Se tacha el ingrediente quitado entero («sin ensalada»); si se quita una parte («sin tomate»), se anota debajo.
 const words=[...removed].map(o=>normalize(o).replace(/^sin /,''));
 $('detailIngredients').innerHTML=(p.ingredients||[p.desc]).map(i=>{const ni=normalize(i);const off=words.some(w=>ni.startsWith(w));const part=off?[]:words.filter(w=>new RegExp(`\\b${w}\\b`).test(ni));
  return `<li class="${off?'off':''}">${esc(i)}${part.length?` <small class="detail-minus">sin ${esc(part.join(' ni '))}</small>`:''}</li>`;}).join('');
 $('detailRemoveBox').hidden=!p.options.length;
 $('detailChips').innerHTML=p.options.map(o=>`<button data-note="${esc(o)}" aria-pressed="${removed.has(o)}">${esc(o.charAt(0).toUpperCase()+o.slice(1))}</button>`).join('');
 const inCart=cart.some(l=>l.id===p.id);$('detailAdd').textContent=inCart?'Guardar cambios':'Agregar al pedido';
}
function openDetail(id,{speak=true}={}){
 const p=menu.find(x=>x.id===id&&x.available);if(!p)return;
 detail={id,notes:new Set(cart.find(l=>l.id===id)?.notes||[])};lastId=id;
 $('detailArt').innerHTML=foodArt(p);$('detailTag').textContent=p.tag||'';$('detailName').textContent=p.name;$('detailDesc').textContent=p.desc;$('detailPrice').textContent=money(p.price);
 renderDetail();if(!$('detailSheet').open)$('detailSheet').showModal();
 if(speak)reply(`${p.name} trae ${listWords((p.ingredients||[p.desc]).map(lower))}.${p.options.length?' ¿Le quitamos algo o te lo anoto así?':' ¿Te lo anoto?'}`);
}
function commitDetail(){
 if(!detail)return;const {id,notes}=detail;detail=null;if($('detailSheet').open)$('detailSheet').close();
 const line=cart.find(l=>l.id===id);
 const operations=line?[...[...notes].filter(n=>!line.notes.includes(n)).map(note=>({type:'note',id,note})),...line.notes.filter(n=>!notes.has(n)).map(note=>({type:'unnote',id,note}))]:[{type:'add',id,qty:1},...[...notes].map(note=>({type:'note',id,note}))];
 if(!operations.length){reply('Lo dejo como está. ¿Algo más?');return;}
 try{const before=cart;setCart(applyOperations(cart,operations,menu));lastId=id;const p=menu.find(x=>x.id===id);
  reply(line?`Listo, ${p.name.toLowerCase()}${notes.size?` ${listWords([...notes])}`:' como viene'}. ${followUp(before,[],menu,drinkOffered)}`:`${describeOps(operations,menu)} ${followUp(before,operations,menu,drinkOffered)}`);}
 catch(e){reply(e.message);}
}
// ---------- Calificación ----------
function paintStars(value){document.querySelectorAll('#stars [data-star]').forEach((b,i)=>{const fill=Math.max(0,Math.min(1,value-i));b.style.setProperty('--fill',`${fill*100}%`);b.style.setProperty('--i',i);b.classList.toggle('lit',fill>0);b.setAttribute('aria-checked',String(Math.ceil(value)===i+1));});}
function startRating(order){rating={id:order.id,tries:0,timer:setTimeout(()=>finishRating(null),45000)};paintStars(0);$('rateCaption').textContent='Dímelo con tu voz o toca las estrellas';if(!$('rateSheet').open)$('rateSheet').showModal();}
async function finishRating(stars,comment=''){
 if(!rating)return;const {id,timer}=rating;rating=null;clearTimeout(timer);
 if(stars==null){if($('rateSheet').open)$('rateSheet').close();voice.wait();return;}
 paintStars(stars);const label=Number.isInteger(stars)?numberWords(stars):`${numberWords(Math.floor(stars))} y media`;
 $('rateCaption').textContent=`¡Gracias por tus ${String(stars).replace('.',',')} estrellas!`;
 try{if(mode==='demo'){const orders=readStore(ordersKey,[]);const o=orders.find(o=>o.id===id);if(o&&!o.rating){o.rating={stars,comment,at:new Date().toISOString()};saveOrders(orders);}}
  else await fetch('/api/ratings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,stars,comment})});}catch{}
 await reply(stars>=4?`¡Gracias por las ${label} estrellas! Buen provecho.`:`Gracias por decírmelo, me sirve para mejorar. ¡Buen provecho!`,'wait');
 setTimeout(()=>{if($('rateSheet').open)$('rateSheet').close();},1800);
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
$('optionsModal').addEventListener('click',e=>{const info=e.target.closest('[data-detail]');if(info){interrupt();activity();openDetail(info.dataset.detail);return;}const cat=e.target.closest('[data-category]');const add=e.target.closest('[data-add]');if(cat)handleInput(`ver ${cat.dataset.category}`);if(add)addDirect(add.dataset.add);});
$('summaryBody').addEventListener('click',e=>{if(e.target.id!=='confirmButton')return;const value=cleanCustomerName($('customerName').value);if(!extractCustomerName(value,{awaiting:true})){$('customerName').focus();toast('Escribe tu nombre para enviar el pedido.');return;}customerName=value;reviewed=cartSignature(cart,customerName);saveDraft();submit();});
$('summaryBody').addEventListener('input',e=>{
 if(e.target.id==='customerName'){customerName=cleanCustomerName(e.target.value);saveDraft();}
 reviewed=null;
});
$('stars').addEventListener('click',e=>{const b=e.target.closest('[data-star]');if(!b||!rating)return;const r=b.getBoundingClientRect();const half=(e.clientX||r.right)-r.left<r.width/2;finishRating(Math.max(1,Number(b.dataset.star)-(half?.5:0)));});
$('rateSkip').addEventListener('click',()=>finishRating(null));
$('detailChips').addEventListener('click',e=>{const b=e.target.closest('[data-note]');if(!b||!detail)return;const o=b.dataset.note;detail.notes.has(o)?detail.notes.delete(o):detail.notes.add(o);renderDetail();});
$('detailAdd').addEventListener('click',()=>{interrupt();commitDetail();});
$('detailSheet').addEventListener('close',()=>{detail=null;});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
$('optionsModal').addEventListener('close',()=>{clearSpot();category=null;onScreen=[];});
$('summaryModal').addEventListener('close',()=>{reviewed=null;if(customerName)awaitingName=false;});
addEventListener('resize',()=>{if($('optionsModal').open)setTab(category);});
addEventListener('pointerdown',activity);addEventListener('keydown',activity);
document.addEventListener('visibilitychange',()=>{if(document.hidden){interrupt();voice.disable();sessionActive=false;}else keepAwake();});
addEventListener('pointerdown',keepAwake,{once:true});
async function init(){
 keepAwake();if(table){$('tableNumber').textContent=table;$('tableChip').hidden=false;}
 kiosk=initKiosk({table,mode:()=>mode,toast});
 // Sin teclado para el cliente: solo voz. «?teclado=1» lo habilita para el personal y las pruebas.
 if(/[?&]teclado=1\b/.test(location.search)){window.__miloInput=handleInput;$('keyboardOpen').hidden=false;document.querySelectorAll('.inline-chat[data-typing]').forEach(f=>f.hidden=false);}
 try{const res=await fetch('/api/menu');const data=await res.json();if(!res.ok)throw new Error(data.error);({menu,restaurant,mode}=data);voice.greeting=restaurant.greeting;voice.neural=data.voice==='neural';
 voice.preferRecorder=data.aiAvailable&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)&&!/[?&]voz=nativa\b/.test(location.search);const saved=readStore(storageKey,{});try{cart=validateCart((saved.cart||[]).filter(l=>menu.find(p=>p.id===l.id)?.available),menu);pending=saved.pending||null;memory=readMemory(saved.memory);}catch{cart=[];pending=null;}customerName=saved.customer||'';setCart(cart);$('menuOpen').disabled=false;}
 catch{$('reply').textContent='No pude cargar el menú. Recarga la página.';$('mascot').disabled=true;}
}
// Caja puede marcar agotados y el dueño cambiar el menú: la mesa lo vuelve a leer cada minuto.
async function refreshMenu(){
 if(busy||sending||document.hidden)return;
 try{const res=await fetch('/api/menu');const data=await res.json();if(!res.ok)return;menu=data.menu;restaurant=data.restaurant;voice.greeting=restaurant.greeting;
  const kept=cart.filter(l=>menu.find(p=>p.id===l.id)?.available);
  if(kept.length!==cart.length){const gone=cart.filter(l=>!kept.includes(l)).map(l=>menu.find(p=>p.id===l.id)?.name||l.id);setCart(kept);if($('summaryModal').open)renderSummary();toast(`Se acabó ${listWords(gone)}: lo quité de tu pedido.`);}
 }catch{}
}
// Aviso sin que el cliente pregunte: cuando caja marca el pedido como listo, Milo lo dice.
async function watchReady(){
 if(document.hidden||!tab().orders.length)return;
 let orders;try{orders=await tabOrders();}catch{return;}
 const t=tab(),told=new Set(t.told||[]);const ready=orders.filter(o=>o.status==='listo'&&!told.has(o.id));
 if(!ready.length)return;
 if(busy||sending||['listening','speaking','thinking','transcribing'].includes(voice.mode))return; // se dice en la próxima vuelta
 saveTab({...t,told:[...told,...ready.map(o=>o.id)].slice(-20)});
 toast('¡Tu pedido está listo!');reply(ready.length>1?'¡Tus pedidos ya están listos! En un momento te los traen.':'¡Tu pedido ya está listo! En un momento te lo traen.','wait');
}
setInterval(refreshMenu,60000);setInterval(watchReady,20000);
init();
