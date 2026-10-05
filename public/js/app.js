import {money,total,validateCart,applyOperations,isConfirmation,normalize} from './domain.js';
import {foodArt} from './art.js';
import {VoiceController} from './voice.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let menu=[],restaurant,mode='demo',cart=[],revision=0,awaiting=-1,lastId=null,history=[],busy=false,epoch=0,request=null,staffToken='',poll=null,pending=null,sending=false;
let category='Todo',suggested=[];
const storageKey='mesero-brasa-v2';
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function store(key,value){localStorage.setItem(key,JSON.stringify(value));}
function saveDraft(){try{store(storageKey,{cart,pending,customer:$('customerName').value});}catch{toast('Tu navegador no permite guardar el borrador. Mantén esta página abierta.');}}
let toastTimer;function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
const states={off:'Listo para ayudarte',waiting:'Di «mesero» o toca a Milo',listening:'Te escucho…',transcribing:'Transcribiendo tu pedido…',thinking:'Estoy pensando…',speaking:'Milo está hablando',sending:'Enviando pedido…'};
const voice=new VoiceController({greeting:'Dígame, señor. ¿Qué desea pedir?',onState:state=>{$('mascotStage').dataset.state=state;$('voiceState').textContent=states[state]||states.off;$('voiceEnable').textContent=voice.enabled?(state==='listening'?'Terminar de hablar':'Hablar con Milo'):'◉ Activar voz';$('voiceStop').hidden=!voice.enabled&&!voice.activatePending;},onLevel:value=>$('mascotStage').style.setProperty('--level',value.toFixed(3)),onText:text=>$('transcript').textContent=`Tú: ${text}`,onInput:text=>handleInput(text),onError:text=>{$('voiceHelp').textContent=text;}});
function reply(text,next='listen'){$('reply').textContent=text;history.push({role:'assistant',content:text});history=history.slice(-8);if(voice.enabled)voice.respond(text,next);else voice.state('off');}
function setBusy(value){busy=value;$('sendText').disabled=value;$('chatText').disabled=value;$('confirmButton').disabled=value||sending||!cart.length;}
function interrupt(){epoch++;request?.abort();request=null;voice.pause();setBusy(false);}
function editable(){if(pending){toast('Hay un envío pendiente. Reinténtalo antes de modificar el pedido.');openCart();return false;}if(busy||sending){toast('Espera un momento mientras termino.');return false;}return true;}
function setCart(next){cart=next;revision++;awaiting=-1;saveDraft();renderCart();}
function change(operations){if(!editable())return;try{const next=applyOperations(cart,operations,menu);setCart(next);lastId=operations.at(-1)?.id;toast('Pedido actualizado');}catch(e){toast(e.message);}}
function renderMenu(){
  $('categories').innerHTML=['Todo',...new Set(menu.map(p=>p.category))].map(c=>`<button data-category="${esc(c)}" class="${category===c?'active':''}" aria-pressed="${category===c}">${esc(c)}</button>`).join('');
  const items=menu.filter(p=>category==='Todo'||p.category===category);
  $('menuGrid').innerHTML=items.map(p=>`<article class="product ${suggested.includes(p.id)?'suggested':''}"><div class="product-art ${p.category.toLowerCase()}">${foodArt(p)}${p.tag?`<span class="product-tag">${esc(p.tag)}</span>`:''}</div><div class="product-body"><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><div class="product-bottom"><span class="product-price">${money(p.price)}</span><button class="add-button" data-add="${p.id}" aria-label="Agregar ${esc(p.name)}" ${!p.available?'disabled':''}>+</button></div></div></article>`).join('');
}
function renderCart(){
  const sum=total(cart,menu);$('cartCount').textContent=cart.reduce((s,l)=>s+l.qty,0);$('cartTotal').textContent=money(sum);$('drawerTotal').textContent=money(sum);$('cartOpen').hidden=!cart.length;
  $('cartItems').innerHTML=cart.length?cart.map(l=>{const p=menu.find(p=>p.id===l.id);return `<div class="cart-item"><div class="cart-item-top"><div><h3>${esc(p.name)}</h3><small>${money(p.price)} por unidad${l.notes.length?' · '+l.notes.map(esc).join(', '):''}</small></div><strong>${money(p.price*l.qty)}</strong></div><div class="qty-controls"><button data-qty="${l.id}" data-delta="-1" aria-label="Quitar una unidad de ${esc(p.name)}">−</button><span>${l.qty}</span><button data-qty="${l.id}" data-delta="1" aria-label="Agregar una unidad de ${esc(p.name)}">+</button><button class="remove" data-remove="${l.id}">Eliminar</button></div><div class="notes-control">${p.options.map(note=>`<button data-note="${l.id}" data-value="${esc(note)}" aria-pressed="${l.notes.includes(note)}">${esc(note)}</button>`).join('')}</div></div>`;}).join(''):'<p class="muted">Tu pedido está vacío. Elige algo del menú para empezar.</p>';
  $('customerName').disabled=Boolean(pending)||sending;$('clearButton').disabled=Boolean(pending)||sending;
  $('confirmButton').disabled=!cart.length||busy||sending;
  $('confirmButton').textContent=pending?'Reintentar el mismo envío':awaiting===revision?(mode==='demo'?'Confirmar pedido de prueba':'Confirmar y enviar a caja'):'Revisar el pedido';
  $('confirmHelp').textContent=mode==='demo'?'Modo demo: se guarda en este navegador. No se envía a un restaurante.':'El pedido se enviará al mostrador para retiro. Confirma solo cuando el resumen esté correcto.';
}
function openCart(){renderCart();if(!$('cartDialog').open)$('cartDialog').showModal();}
function showMenu(ids=[]){suggested=ids;category='Todo';renderMenu();if($('cartDialog').open)$('cartDialog').close();$('menuPanel').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
function review(){
  if(!cart.length){reply('Tu pedido está vacío. ¿Qué te gustaría pedir?');return;}
  awaiting=revision;openCart();
  const summary=cart.map(l=>`${l.qty} ${menu.find(p=>p.id===l.id).name}${l.notes.length?', '+l.notes.join(', '):''}`).join('; ');
  reply(`${summary}. Total: ${money(total(cart,menu))}. ${mode==='demo'?'Es un pedido de prueba. ':''}¿Confirmas el pedido?`);
}
async function handleInput(raw){
  if(!raw?.trim()||!menu.length)return;
  if(sending||pending){toast('Primero resuelve el envío pendiente.');openCart();return;}
  if(busy)return;
  interrupt();const turn=epoch;voice.state('thinking');$('transcript').textContent=`Tú: ${raw}`;history.push({role:'user',content:raw});
  const nameMatch=raw.trim().match(/^(?:me llamo|mi nombre es|a nombre de)\s+(.{2,60})$/i);
  if(nameMatch){$('customerName').value=nameMatch[1].trim();saveDraft();if(cart.length)review();else reply('Gracias. ¿Qué deseas pedir?');return;}
  if(isConfirmation(raw)){if(awaiting===revision&&cart.length)await submit();else review();return;}
  // No dar al modelo autoridad para enviar. Cualquier otra frase invalida la confirmación.
  awaiting=-1;renderCart();setBusy(true);request=new AbortController();
  try{
    const response=await fetch('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:raw,cart,lastId,history:history.slice(0,-1).slice(-6)}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(22000)])});
    const result=await response.json();if(turn!==epoch)return;if(!response.ok)throw new Error(result.error||'No pude interpretar el pedido.');
    if(result.intent==='edit'){setCart(applyOperations(cart,result.operations,menu));lastId=result.operations.at(-1)?.id;}
    if(result.intent==='review'){review();return;}
    if(result.intent==='cancel'){openCart();$('clearConfirm').hidden=false;}
    if(['menu','recommend','price'].includes(result.intent))showMenu(result.suggest_ids||[]);
    if(result.intent==='goodbye'&&cart.length){review();return;}
    reply(result.reply||'¿Qué te gustaría pedir?',result.intent==='goodbye'?'wait':'listen');
  }catch(e){if(turn===epoch)reply(e.name==='TimeoutError'?'La respuesta tardó demasiado. Tu pedido sigue aquí; puedes usar el menú.':e.message);}
  finally{if(turn===epoch){setBusy(false);renderCart();}}
}
async function submit(){
  if(sending||busy||!cart.length)return;
  const customer=$('customerName').value.trim();if(customer.length<2){$('orderError').textContent='Escribe tu nombre para retirar el pedido.';openCart();$('customerName').focus();reply('Antes de confirmar, escribe tu nombre para retirar el pedido.');return;}
  if(awaiting!==revision&&!pending){review();return;}
  voice.pause();sending=true;$('orderError').textContent='';
  pending=pending||{key:crypto.randomUUID(),items:structuredClone(cart),customer,confirmed:true};saveDraft();renderCart();voice.state('sending');
  try{
    let order;
    if(mode==='demo'){
      let orders=readStore(`${storageKey}-orders`,[]);order=orders.find(o=>o.id===pending.key);
      if(!order){order={id:pending.key,number:pending.key.slice(0,6).toUpperCase(),items:pending.items.map(l=>({...l,name:menu.find(p=>p.id===l.id).name,price:menu.find(p=>p.id===l.id).price})),total:total(pending.items,menu),customer:pending.customer,status:'nuevo',createdAt:new Date().toISOString()};orders=[order,...orders].slice(0,200);store(`${storageKey}-orders`,orders);}
    }else{
      const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(15000)});
      const data=await response.json();if(!response.ok){if(response.status<500&&response.status!==429){pending=null;saveDraft();}throw new Error(data.error||'No se pudo enviar.');}order=data.order;
    }
    pending=null;setCart([]);awaiting=-1;history=[];lastId=null;$('cartDialog').close();
    toast(mode==='demo'?`Pedido de prueba #${order.number} guardado`:`Pedido #${order.number} enviado a caja`);
    reply(mode==='demo'?'Tu pedido de prueba está guardado. Puedes verlo en Caja. Gracias por probar a Milo.':`Pedido ${order.number} enviado. Retíralo con el nombre ${customer}. Gracias.`,'wait');
  }catch(e){$('orderError').textContent=`${e.message} ${pending?'Conservamos el envío para reintentarlo sin duplicarlo.':''}`;voice.state(voice.enabled?'waiting':'off');}
  finally{sending=false;renderCart();}
}
async function loadQueue(){
  const queue=$('queue');
  try{
    let orders;
    if(mode==='demo')orders=readStore(`${storageKey}-orders`,[]);
    else{if(!staffToken)return;const res=await fetch('/api/orders',{headers:{Authorization:`Bearer ${staffToken}`},signal:AbortSignal.timeout(12000)});const data=await res.json();if(!res.ok){if(res.status===401){staffToken='';$('staffForm').hidden=false;$('staffLogout').hidden=true;clearInterval(poll);}throw new Error(data.error);}orders=data.orders;}
    const next={nuevo:'aceptado',aceptado:'preparando',preparando:'listo',listo:'entregado'};
    queue.innerHTML=orders.length?orders.map(o=>`<article class="queue-card"><header><h3>#${esc(o.number)} · ${esc(o.customer)}</h3><span class="status-pill">${esc(o.status)}</span></header><p>${o.items.map(l=>`${l.qty} × ${esc(l.name)}${l.notes?.length?' ('+l.notes.map(esc).join(', ')+')':''}`).join('<br>')}</p><strong>${money(o.total)}</strong><small class="muted"> · ${new Date(o.createdAt).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</small><div class="queue-actions">${next[o.status]?`<button class="secondary-button" data-status="${next[o.status]}" data-order="${o.id}">Marcar ${next[o.status]}</button>`:''}${['nuevo','aceptado','preparando'].includes(o.status)?`<button class="text-button danger" data-status="cancelado" data-order="${o.id}">Cancelar pedido</button>`:''}</div></article>`).join(''):'<p class="muted">Todavía no hay pedidos. Los nuevos aparecerán aquí.</p>';
  }catch(e){queue.textContent=e.message;}
}
function startPolling(){clearInterval(poll);poll=setInterval(()=>{if($('cashierDialog').open&&!document.hidden)loadQueue();},5000);}
$('categories').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){category=b.dataset.category;renderMenu();}});
$('menuGrid').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(b)change([{type:'add',id:b.dataset.add,qty:1}]);});
$('cartItems').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.qty)change([{type:Number(b.dataset.delta)>0?'add':'remove',id:b.dataset.qty,qty:1}]);
  if(b.dataset.remove)change([{type:'set',id:b.dataset.remove,qty:0}]);
  if(b.dataset.note&&editable()){const next=structuredClone(cart),line=next.find(l=>l.id===b.dataset.note);line.notes=line.notes.includes(b.dataset.value)?line.notes.filter(n=>n!==b.dataset.value):[...line.notes,b.dataset.value];setCart(validateCart(next,menu));}
});
$('chatForm').addEventListener('submit',e=>{e.preventDefault();const value=$('chatText').value.trim();if(value&&!busy){$('chatText').value='';handleInput(value);}});
for(const b of document.querySelectorAll('[data-prompt]'))b.addEventListener('click',()=>handleInput(b.dataset.prompt));
$('voiceEnable').addEventListener('click',()=>{if(busy||sending)return;if(voice.mode==='listening')voice.finish();else if(voice.enabled)voice.call();else voice.enable();});
$('mascot').addEventListener('click',()=>{if(busy||sending)return;if(voice.mode==='listening')voice.finish();else voice.call();});
$('voiceStop').addEventListener('click',()=>{interrupt();voice.disable();$('voiceHelp').textContent='Micrófono apagado. Puedes seguir por texto o con el menú.';});
$('cartOpen').addEventListener('click',openCart);
$('confirmButton').addEventListener('click',()=>{if(pending||awaiting===revision)submit();else review();});
$('customerName').addEventListener('input',saveDraft);
$('clearButton').addEventListener('click',()=>{if(editable())$('clearConfirm').hidden=false;});
$('clearNo').addEventListener('click',()=>$('clearConfirm').hidden=true);
$('clearYes').addEventListener('click',()=>{if(editable()){setCart([]);$('clearConfirm').hidden=true;reply('Borrador vacío. Puedes empezar de nuevo.');}});
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
$('cartDialog').addEventListener('close',()=>{$('clearConfirm').hidden=true;});
$('cashierOpen').addEventListener('click',()=>{interrupt();voice.disable();$('cashierInfo').textContent=mode==='demo'?'Caja de prueba. Comparte pedidos entre pestañas de este navegador; no entre dispositivos.':'Pedidos para retiro. Actualización automática cada 5 segundos; historial de los últimos 30 días (hasta 200 pedidos).';$('staffForm').hidden=mode==='demo'||Boolean(staffToken);$('cashierDialog').showModal();loadQueue();startPolling();});
$('cashierDialog').addEventListener('close',()=>clearInterval(poll));
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();staffToken=$('staffToken').value;$('staffToken').value='';$('staffForm').hidden=true;$('staffLogout').hidden=false;await loadQueue();if(staffToken)startPolling();});
$('staffLogout').addEventListener('click',()=>{staffToken='';$('queue').textContent='';$('staffForm').hidden=false;$('staffLogout').hidden=true;clearInterval(poll);});
$('refreshOrders').addEventListener('click',loadQueue);
$('queue').addEventListener('click',async e=>{
  const b=e.target.closest('[data-order]');if(!b)return;b.disabled=true;
  try{if(mode==='demo'){const orders=readStore(`${storageKey}-orders`,[]);const order=orders.find(o=>o.id===b.dataset.order);if(order)order.status=b.dataset.status;store(`${storageKey}-orders`,orders);}
  else{const res=await fetch('/api/orders',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${staffToken}`},body:JSON.stringify({id:b.dataset.order,status:b.dataset.status}),signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error((await res.json()).error);}
  await loadQueue();}catch(error){toast(error.message);b.disabled=false;}
});
window.addEventListener('storage',e=>{if(e.key===`${storageKey}-orders`&&$('cashierDialog').open)loadQueue();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){interrupt();voice.disable();}else if($('cashierDialog').open)loadQueue();});
window.addEventListener('pagehide',()=>voice.disable());
async function init(){
  try{const res=await fetch('/api/menu');const data=await res.json();if(!res.ok)throw new Error(data.error);({menu,restaurant,mode}=data);voice.greeting=restaurant.greeting;$('brandName').textContent=restaurant.name.toLowerCase();$('modeBadge').textContent=mode==='demo'?'Demo interactiva':'Pedidos conectados';
    const saved=readStore(storageKey,{});try{cart=validateCart(saved.cart||[],menu);pending=saved.pending||null;if(pending){pending.items=validateCart(pending.items,menu);cart=pending.items;}}catch{cart=[];pending=null;}
    $('customerName').value=pending?.customer||saved.customer||'';renderMenu();renderCart();if(pending)toast('Hay un envío pendiente. Abre tu pedido para reintentarlo.');
    if(!data.aiAvailable)$('voiceHelp').textContent='Demo sin IA configurada: prueba «dos cuartos de pollo» o usa el menú. La voz del navegador depende de compatibilidad.';
  }catch(e){$('menuGrid').textContent='No se pudo cargar el menú. Recarga la página para intentar de nuevo.';$('reply').textContent=e.message;$('voiceEnable').disabled=true;$('mascot').disabled=true;$('sendText').disabled=true;}
}
init();
