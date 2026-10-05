import {money,total,validateCart,applyOperations,isConfirmation,normalize} from './domain.js';
import {foodArt} from './art.js';
import {VoiceController} from './voice.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let menu=[],restaurant,mode='demo',cart=[],revision=0,awaiting=-1,lastId=null,history=[],busy=false,epoch=0,request=null,staffToken='',poll=null,pending=null,sending=false,customerName='';
const storageKey='mesero-brasa-v2';
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function store(key,value){localStorage.setItem(key,JSON.stringify(value));}
function saveDraft(){try{store(storageKey,{cart,pending,customer:customerName});}catch{}}
let toastTimer;function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}

const states={off:'Listo para ayudarte',waiting:'Di «Milo» o toca la mascota',listening:'Te escucho…',transcribing:'Transcribiendo…',thinking:'Estoy pensando…',speaking:'Milo está hablando',sending:'Enviando pedido…'};

const voice=new VoiceController({
  greeting:'¡Hola! ¿Qué se te antoja hoy?',
  onState:state=>{
    $('mascotStage').dataset.state=state;
    $('voiceState').textContent=states[state]||states.off;
  },
  onLevel:value=>$('mascotStage').style.setProperty('--level',value.toFixed(3)),
  onText:text=>$('transcript').textContent=`Tú: ${text}`,
  onInput:text=>handleInput(text),
  onError:text=>{$('voiceHelp').textContent=text;}
});

function reply(text,next='listen'){
  $('reply').textContent=text;
  history.push({role:'assistant',content:text});
  history=history.slice(-8);
  if(voice.enabled) voice.respond(text,next);
  else voice.state('off');
}

function interrupt(){epoch++;request?.abort();request=null;voice.pause();busy=false;}
function setCart(next){cart=next;revision++;awaiting=-1;saveDraft();}

// ---- Modales (pantallas emergentes) ----
function openModal(title, contentHtml){
  $('modalTitle').textContent=title;
  $('modalBody').innerHTML=contentHtml;
  if(!$('optionsModal').open) $('optionsModal').showModal();
  // Scroll suave al inicio
  $('modalBody').scrollTo({top:0,behavior:'smooth'});
}
function closeModal(){if($('optionsModal').open)$('optionsModal').close();}

function showMenuPopup(category=null, ids=[]){
  const items = category ? menu.filter(p=>p.category===category && p.available) : menu.filter(p=>p.available);
  const highlight = new Set(ids);
  const html = items.map(p=>`
    <article class="popup-product ${highlight.has(p.id)?'suggested':''}">
      <div class="popup-art">${foodArt(p)}</div>
      <div class="popup-info">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.desc)}</p>
        <span class="popup-price">${money(p.price)}</span>
      </div>
    </article>`).join('');
  openModal(category||'Nuestro menú', html);
}

function showSummaryPopup(){
  if(!cart.length) return;
  const sum = total(cart,menu);
  const html = cart.map(l=>{
    const p=menu.find(p=>p.id===l.id);
    return `<div class="summary-line">
      <span>${l.qty} × ${esc(p.name)}${l.notes.length?' ('+l.notes.map(esc).join(', ')+')':''}</span>
      <strong>${money(p.price*l.qty)}</strong>
    </div>`;
  }).join('') + `<div class="summary-total"><span>Total</span><strong>${money(sum)}</strong></div>` +
  (customerName ? `<div class="summary-name">A nombre de: <strong>${esc(customerName)}</strong></div>` : '');
  $('summaryBody').innerHTML=html;
  if(!$('summaryModal').open) $('summaryModal').showModal();
}

// ---- Procesamiento de input ----
async function handleInput(raw){
  if(!raw?.trim()||!menu.length) return;
  if(sending||pending){toast('Hay un envío pendiente.');return;}
  if(busy) return;

  interrupt();const turn=epoch;voice.state('thinking');
  $('transcript').textContent=`Tú: ${raw}`;
  history.push({role:'user',content:raw});

  // Nombre del cliente
  const nameMatch=raw.trim().match(/^(?:me llamo|mi nombre es|a nombre de|soy)\s+(.{2,60})$/i);
  if(nameMatch){
    customerName=nameMatch[1].trim();saveDraft();
    if(cart.length){showSummaryPopup();reply(`Perfecto, ${customerName}. ¿Confirmo tu pedido?`);}
    else reply(`Gracias, ${customerName}. ¿Qué deseas pedir?`);
    return;
  }

  // Confirmación
  if(isConfirmation(raw)){
    if(awaiting===revision && cart.length) return await submit();
    if(cart.length){awaiting=revision;showSummaryPopup();reply(`Tienes ${cart.reduce((s,l)=>s+l.qty,0)} productos por ${money(total(cart,menu))}. ¿A qué nombre lo registro?`);}
    else reply('No tienes nada en el pedido todavía. Dime qué se te antoja.');
    return;
  }

  awaiting=-1;
  closeModal();
  busy=true;request=new AbortController();

  try{
    const response=await fetch('/api/match',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({transcript:raw,cart,lastId,history:history.slice(0,-1).slice(-6)}),
      signal:AbortSignal.any([request.signal,AbortSignal.timeout(22000)])
    });
    const result=await response.json();
    if(turn!==epoch) return;
    if(!response.ok) throw new Error(result.error||'No pude interpretar el pedido.');

    // Aplicar ediciones al carrito
    if(result.intent==='edit'){
      setCart(applyOperations(cart,result.operations,menu));
      lastId=result.operations.at(-1)?.id;
    }

    // Mostrar opciones como popup
    if(['menu','recommend','price'].includes(result.intent)){
      const ids = result.suggest_ids||[];
      if(result.intent==='recommend' && ids.length){
        showMenuPopup(null, ids);
      } else {
        showMenuPopup(null, ids);
      }
    }

    // Review
    if(result.intent==='review'){
      if(cart.length){
        showSummaryPopup();
        if(!customerName) reply((result.reply||'') + ' ¿A qué nombre lo registro?');
        else{awaiting=revision;reply((result.reply||'') + ` A nombre de ${customerName}. ¿Confirmo?`);}
      } else reply('Tu pedido está vacío. ¿Qué te gustaría pedir?');
      busy=false;return;
    }

    // Goodbye con carrito
    if(result.intent==='goodbye' && cart.length){
      showSummaryPopup();
      reply('Tienes un pedido pendiente. ¿Lo confirmo o lo cancelo?');
      busy=false;return;
    }

    // Cancel
    if(result.intent==='cancel'){
      setCart([]);closeModal();
      reply('Pedido cancelado. Dime si quieres pedir algo nuevo.');
      busy=false;return;
    }

    reply(result.reply||'¿Qué te gustaría pedir?', result.intent==='goodbye'?'wait':'listen');
  }catch(e){
    if(turn===epoch) reply(e.name==='TimeoutError'?'La respuesta tardó demasiado. Intenta de nuevo.':e.message);
  }finally{
    if(turn===epoch) busy=false;
  }
}

// ---- Envío de pedido ----
async function submit(){
  if(sending||busy||!cart.length) return;
  if(!customerName){
    reply('¿A qué nombre registro el pedido? Dime tu nombre.');
    return;
  }
  closeModal();
  voice.pause();sending=true;voice.state('sending');
  pending=pending||{key:crypto.randomUUID(),items:structuredClone(cart),customer:customerName,confirmed:true};
  saveDraft();

  try{
    let order;
    if(mode==='demo'){
      let orders=readStore(`${storageKey}-orders`,[]);
      order=orders.find(o=>o.id===pending.key);
      if(!order){
        order={id:pending.key,number:pending.key.slice(0,6).toUpperCase(),
          items:pending.items.map(l=>({...l,name:menu.find(p=>p.id===l.id).name,price:menu.find(p=>p.id===l.id).price})),
          total:total(pending.items,menu),customer:pending.customer,status:'nuevo',
          createdAt:new Date().toISOString()};
        orders=[order,...orders].slice(0,200);store(`${storageKey}-orders`,orders);
      }
    } else {
      const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok){if(response.status<500&&response.status!==429){pending=null;saveDraft();}throw new Error(data.error||'No se pudo enviar.');}
      order=data.order;
    }
    pending=null;setCart([]);awaiting=-1;history=[];lastId=null;customerName='';
    toast(mode==='demo'?`Pedido de prueba #${order.number} guardado`:`Pedido #${order.number} enviado a caja`);
    reply(`¡Listo, ${order.customer}! Tu pedido #${order.number} ya está en camino. ¡Buen provecho!`,'wait');
  }catch(e){
    reply(`Hubo un problema: ${e.message}. Intenta de nuevo diciendo "confirmar".`);
    voice.state(voice.enabled?'waiting':'off');
  }finally{sending=false;}
}

// ---- Cajero (se mantiene igual) ----
async function loadQueue(){
  const queue=$('queue');
  try{
    let orders;
    if(mode==='demo') orders=readStore(`${storageKey}-orders`,[]);
    else{if(!staffToken)return;const res=await fetch('/api/orders',{headers:{Authorization:`Bearer ${staffToken}`},signal:AbortSignal.timeout(12000)});const data=await res.json();if(!res.ok){if(res.status===401){staffToken='';$('staffForm').hidden=false;$('staffLogout').hidden=true;clearInterval(poll);}throw new Error(data.error);}orders=data.orders;}
    const next={nuevo:'aceptado',aceptado:'preparando',preparando:'listo',listo:'entregado'};
    queue.innerHTML=orders.length?orders.map(o=>`<article class="queue-card"><header><h3>#${esc(o.number)} · ${esc(o.customer)}</h3><span class="status-pill">${esc(o.status)}</span></header><p>${o.items.map(l=>`${l.qty} × ${esc(l.name)}${l.notes?.length?' ('+l.notes.map(esc).join(', ')+')':''}`).join('<br>')}</p><strong>${money(o.total)}</strong><small class="muted"> · ${new Date(o.createdAt).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</small><div class="queue-actions">${next[o.status]?`<button class="secondary-button" data-status="${next[o.status]}" data-order="${o.id}">Marcar ${next[o.status]}</button>`:''}${['nuevo','aceptado','preparando'].includes(o.status)?`<button class="text-button danger" data-status="cancelado" data-order="${o.id}">Cancelar pedido</button>`:''}</div></article>`).join(''):'<p class="muted">Todavía no hay pedidos.</p>';
  }catch(e){queue.textContent=e.message;}
}
function startPolling(){clearInterval(poll);poll=setInterval(()=>{if($('cashierDialog').open&&!document.hidden)loadQueue();},5000);}

// ---- Eventos ----
$('mascot').addEventListener('click',()=>{
  if(busy||sending)return;
  if(voice.mode==='listening') voice.finish();
  else voice.call();
});

for(const button of document.querySelectorAll('[data-close]'))
  button.addEventListener('click',()=>$(button.dataset.close).close());

$('cashierOpen').addEventListener('click',()=>{
  interrupt();
  $('cashierInfo').textContent=mode==='demo'?'Caja de prueba. Pedidos en este navegador.':'Pedidos para retiro.';
  $('staffForm').hidden=mode==='demo'||Boolean(staffToken);
  $('cashierDialog').showModal();loadQueue();startPolling();
});
$('cashierDialog').addEventListener('close',()=>clearInterval(poll));
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();staffToken=$('staffToken').value;$('staffToken').value='';$('staffForm').hidden=true;$('staffLogout').hidden=false;await loadQueue();if(staffToken)startPolling();});
$('staffLogout').addEventListener('click',()=>{staffToken='';$('queue').textContent='';$('staffForm').hidden=false;$('staffLogout').hidden=true;clearInterval(poll);});
$('refreshOrders').addEventListener('click',loadQueue);
$('queue').addEventListener('click',async e=>{
  const b=e.target.closest('[data-order]');if(!b)return;b.disabled=true;
  try{
    if(mode==='demo'){const orders=readStore(`${storageKey}-orders`,[]);const order=orders.find(o=>o.id===b.dataset.order);if(order)order.status=b.dataset.status;store(`${storageKey}-orders`,orders);}
    else{const res=await fetch('/api/orders',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${staffToken}`},body:JSON.stringify({id:b.dataset.order,status:b.dataset.status}),signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error((await res.json()).error);}
    await loadQueue();
  }catch(error){toast(error.message);b.disabled=false;}
});
window.addEventListener('storage',e=>{if(e.key===`${storageKey}-orders`&&$('cashierDialog').open)loadQueue();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){interrupt();voice.disable();}else if($('cashierDialog').open)loadQueue();});
window.addEventListener('pagehide',()=>voice.disable());

// ---- Init ----
async function init(){
  try{
    const res=await fetch('/api/menu');const data=await res.json();
    if(!res.ok) throw new Error(data.error);
    ({menu,restaurant,mode}=data);
    voice.greeting=restaurant.greeting;
    $('brandName').textContent=restaurant.name.toLowerCase();
    $('modeBadge').textContent=mode==='demo'?'Demo interactiva':'Pedidos conectados';
    const saved=readStore(storageKey,{});
    try{cart=validateCart(saved.cart||[],menu);pending=saved.pending||null;if(pending){pending.items=validateCart(pending.items,menu);cart=pending.items;}}catch{cart=[];pending=null;}
    customerName=pending?.customer||saved.customer||'';
    if(pending) toast('Hay un envío pendiente. Di "confirmar" para reintentarlo.');
    // Auto-activar voz
    voice.enable();
  }catch(e){
    $('reply').textContent='No se pudo cargar. Recarga la página.';
    $('mascot').disabled=true;
  }
}
init();
