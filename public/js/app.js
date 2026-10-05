import {money,total,validateCart,applyOperations,isConfirmation,normalize} from './domain.js';
import {foodArt} from './art.js';
import {VoiceController} from './voice.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let menu=[],restaurant,mode='demo',cart=[],history=[],busy=false,epoch=0,request=null,
    lastId=null,customerName='',pending=null,sending=false,staffToken='',poll=null,
    sessionActive=false,awaitingName=false;
const storageKey='mesero-brasa-v2';
function readStore(key,fb){try{return JSON.parse(localStorage.getItem(key))??fb;}catch{return fb;}}
function store(key,v){localStorage.setItem(key,JSON.stringify(v));}
function saveDraft(){try{store(storageKey,{cart,pending,customer:customerName});}catch{}}
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}

const states={off:'Listo para ayudarte',waiting:'Toca a Milo para empezar',listening:'Te escucho…',transcribing:'Transcribiendo…',thinking:'Pensando…',speaking:'Milo habla',sending:'Enviando pedido…'};

const voice=new VoiceController({
  greeting:'¡Hola! ¿Qué se te antoja hoy?',
  onState:s=>{$('mascotStage').dataset.state=s;$('voiceState').textContent=states[s]||states.off;},
  onLevel:v=>$('mascotStage').style.setProperty('--level',v.toFixed(3)),
  onText:t=>$('transcript').textContent=`Tú: ${t}`,
  onInput:t=>handleInput(t),
  onError:t=>{$('voiceHelp').textContent=t;}
});

function reply(text,next='listen'){
  $('reply').textContent=text;
  history.push({role:'assistant',content:text});
  history=history.slice(-8);
  if(voice.enabled && sessionActive) voice.respond(text,next);
  else voice.state('off');
}

function interrupt(){epoch++;request?.abort();request=null;voice.pause();busy=false;}
function setCart(next){cart=next;saveDraft();}

// ---- Sesión ----
function startSession(){
  sessionActive=true;
  voice.enable(true);
}
function endSession(){
  sessionActive=false;awaitingName=false;
  closeAllModals();
  voice.pause();voice.state('off');
  $('reply').textContent='Toca a Milo cuando quieras pedir.';
  $('voiceHelp').textContent='';
}

// ---- Modales con tarjetas grandes ----
function openModal(title,html){
  $('modalTitle').textContent=title;
  $('modalBody').innerHTML=html;
  if(!$('optionsModal').open) $('optionsModal').showModal();
}
function closeAllModals(){
  if($('optionsModal').open)$('optionsModal').close();
  if($('summaryModal').open)$('summaryModal').close();
}

function showCategoryChoice(){
  openModal('¿Qué prefieres?',`
    <div class="big-cards">
      <button class="big-card" data-say="Quiero ver los platos solos">
        <span class="big-emoji">🍗</span>
        <span class="big-label">Solo</span>
        <span class="big-desc">Platos individuales</span>
      </button>
      <button class="big-card" data-say="Quiero ver los combos">
        <span class="big-emoji">🍱</span>
        <span class="big-label">Combo</span>
        <span class="big-desc">Plato + papas + bebida</span>
      </button>
    </div>`);
  reply('¿Prefieres algo solo o un combo?');
}

function showProductCards(category, title){
  const items = menu.filter(p=>p.category===category && p.available);
  if(!items.length){reply('No hay opciones en esa categoría.');return;}
  const html = `<div class="card-carousel">${items.map(p=>`
    <button class="product-card" data-say="Quiero un ${p.name}">
      <div class="card-art">${foodArt(p)}</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.desc)}</p>
      <span class="card-price">${money(p.price)}</span>
    </button>`).join('')}</div>`;
  openModal(title, html);
}

function showDrinkCards(){
  const drinks = menu.filter(p=>p.category==='Bebidas' && p.available);
  const html = `<div class="card-carousel">${drinks.map(p=>`
    <button class="product-card drink-card" data-say="Quiero una ${p.name}">
      <span class="drink-emoji">${p.emoji}</span>
      <h3>${esc(p.name)}</h3>
      <span class="card-price">${money(p.price)}</span>
    </button>`).join('')}
    <button class="product-card drink-card no-drink" data-say="No quiero bebida">
      <span class="drink-emoji">🚫</span>
      <h3>Sin bebida</h3>
    </button>
  </div>`;
  openModal('¿Qué bebida deseas?', html);
  reply('¿Qué bebida te gustaría? También puedes decir que no quieres.');
}

function showSummary(){
  if(!cart.length) return;
  const sum=total(cart,menu);
  const html=cart.map(l=>{const p=menu.find(p=>p.id===l.id);return `
    <div class="summary-line"><span>${l.qty} × ${esc(p.name)}</span><strong>${money(p.price*l.qty)}</strong></div>`;
  }).join('') + `<div class="summary-total"><span>Total</span><strong>${money(sum)}</strong></div>` +
  (customerName?`<div class="summary-name">A nombre de: <strong>${esc(customerName)}</strong></div>`:'');
  $('summaryBody').innerHTML=html;
  if(!$('summaryModal').open)$('summaryModal').showModal();
}

// Click en tarjetas → se procesa como si lo hubiera dicho por voz
$('modalBody').addEventListener('click',e=>{
  const card=e.target.closest('[data-say]');
  if(card && !busy){closeAllModals();handleInput(card.dataset.say);}
});

// ---- Procesamiento ----
async function handleInput(raw){
  if(!raw?.trim()||!menu.length||busy) return;
  if(sending){toast('Hay un envío en curso.');return;}
  interrupt();const turn=epoch;voice.state('thinking');
  $('transcript').textContent=`Tú: ${raw}`;
  history.push({role:'user',content:raw});
  const n=normalize(raw);

  // Nombre
  const nameMatch=raw.trim().match(/^(?:me llamo|mi nombre es|a nombre de|soy)\s+(.{2,60})$/i);
  if(nameMatch||awaitingName){
    customerName=(nameMatch?nameMatch[1]:raw).trim();
    awaitingName=false;saveDraft();
    if(cart.length){showSummary();reply(`Perfecto, ${customerName}. ¿Confirmo el pedido?`);}
    else reply(`Gracias, ${customerName}. ¿Qué deseas pedir?`);
    return;
  }

  // Confirmación
  if(isConfirmation(raw)&&cart.length){
    if(!customerName){awaitingName=true;reply('¿A qué nombre registro el pedido?');return;}
    await submit();return;
  }

  // No quiere bebida
  if(/\b(no quiero bebida|sin bebida|no deseo bebida|no gracias)\b/i.test(raw)){
    closeAllModals();
    if(cart.length){
      if(!customerName){awaitingName=true;reply('¡Buena elección! ¿A qué nombre va el pedido?');}
      else{showSummary();reply(`Tienes ${cart.reduce((s,l)=>s+l.qty,0)} productos. ¿Confirmo?`);}
    } else reply('¿Qué deseas pedir?');
    return;
  }

  // Despedida
  if(/^(gracias|chao|adios|hasta luego)$/i.test(n)&&!cart.length){
    reply('¡Que tengas buen día! Tócame cuando quieras pedir.','wait');
    endSession();return;
  }

  closeAllModals();
  busy=true;request=new AbortController();

  try{
    const response=await fetch('/api/match',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({transcript:raw,cart,lastId,history:history.slice(0,-1).slice(-6)}),
      signal:AbortSignal.any([request.signal,AbortSignal.timeout(22000)])
    });
    const result=await response.json();
    if(turn!==epoch)return;
    if(!response.ok) throw new Error(result.error||'No pude entender.');

    if(result.intent==='edit'&&result.operations?.length){
      setCart(applyOperations(cart,result.operations,menu));
      lastId=result.operations.at(-1)?.id;
      // Después de agregar comida, preguntar por bebida si no tiene
      const hasDrink=cart.some(l=>menu.find(p=>p.id===l.id)?.category==='Bebidas');
      if(!hasDrink){
        reply((result.reply||'¡Agregado!')+ ' ¿Deseas agregar una bebida?');
        setTimeout(()=>showDrinkCards(),800);
        busy=false;return;
      }
      // Si ya tiene bebida, ir a confirmación
      if(!customerName){awaitingName=true;reply((result.reply||'¡Listo!')+ ' ¿A qué nombre va el pedido?');busy=false;return;}
      showSummary();reply((result.reply||'¡Listo!')+ ' ¿Confirmo el pedido?');
      busy=false;return;
    }

    if(result.intent==='menu'||/\b(menu|carta|que tienes|qué tienes)\b/i.test(n)){
      showCategoryChoice();busy=false;return;
    }

    if(result.intent==='recommend'){
      const ids=result.suggest_ids||[];
      if(ids.length){
        const items=ids.map(id=>menu.find(p=>p.id===id)).filter(Boolean);
        const html=`<div class="card-carousel">${items.map(p=>`
          <button class="product-card" data-say="Quiero un ${p.name}">
            <div class="card-art">${foodArt(p)}</div>
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.desc)}</p>
            <span class="card-price">${money(p.price)}</span>
          </button>`).join('')}</div>`;
        openModal('Te recomiendo',html);
      }
      reply(result.reply||'¿Qué te gustaría?');busy=false;return;
    }

    // Ver platos solos
    if(/\b(platos? solos?|solos?|individual)\b/i.test(n)){
      showProductCards('Pollo','Nuestros platos');busy=false;return;
    }
    // Ver combos
    if(/\b(combos?)\b/i.test(n)){
      showProductCards('Combos','Nuestros combos');busy=false;return;
    }
    // Ver bebidas
    if(/\b(bebidas?|gaseosas?|tomar)\b/i.test(n)){
      showDrinkCards();busy=false;return;
    }

    if(result.intent==='review'&&cart.length){
      if(!customerName){awaitingName=true;reply('¿A qué nombre va el pedido?');busy=false;return;}
      showSummary();reply('¿Confirmo el pedido?');busy=false;return;
    }

    if(result.intent==='cancel'){setCart([]);reply('Pedido cancelado. ¿Empezamos de nuevo?');busy=false;return;}
    if(result.intent==='goodbye'){
      if(cart.length){showSummary();reply('Tienes un pedido pendiente. ¿Lo confirmo?');busy=false;return;}
      reply('¡Que tengas buen provecho! Tócame cuando necesites algo.','wait');
      endSession();busy=false;return;
    }

    reply(result.reply||'Dime qué se te antoja.');
  }catch(e){
    if(turn===epoch) reply(e.name==='TimeoutError'?'Tardó mucho. Intenta de nuevo.':e.message);
  }finally{if(turn===epoch) busy=false;}
}

// ---- Envío ----
async function submit(){
  if(sending||!cart.length||!customerName) return;
  closeAllModals();voice.pause();sending=true;voice.state('sending');
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
          total:total(pending.items,menu),customer:pending.customer,status:'nuevo',createdAt:new Date().toISOString()};
        orders=[order,...orders].slice(0,200);store(`${storageKey}-orders`,orders);
      }
    }else{
      const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(15000)});
      const data=await res.json();if(!res.ok)throw new Error(data.error);order=data.order;
    }
    pending=null;setCart([]);history=[];lastId=null;customerName='';awaitingName=false;
    toast(`Pedido #${order.number} enviado ✓`);
    reply(`¡Listo, ${order.customer}! Tu pedido #${order.number} ya está en camino. ¡Buen provecho!`,'wait');
    setTimeout(()=>endSession(),3000);
  }catch(e){reply(`Error: ${e.message}. Di "confirmar" para reintentar.`);voice.state('off');}
  finally{sending=false;}
}

// ---- Cajero ----
async function loadQueue(){
  const queue=$('queue');
  try{
    let orders;
    if(mode==='demo') orders=readStore(`${storageKey}-orders`,[]);
    else{if(!staffToken)return;const res=await fetch('/api/orders',{headers:{Authorization:`Bearer ${staffToken}`},signal:AbortSignal.timeout(12000)});const data=await res.json();if(!res.ok)throw new Error(data.error);orders=data.orders;}
    const next={nuevo:'aceptado',aceptado:'preparando',preparando:'listo',listo:'entregado'};
    queue.innerHTML=orders.length?orders.map(o=>`<article class="queue-card"><header><h3>#${esc(o.number)} · ${esc(o.customer)}</h3><span class="status-pill">${esc(o.status)}</span></header><p>${o.items.map(l=>`${l.qty} × ${esc(l.name)}`).join('<br>')}</p><strong>${money(o.total)}</strong><small class="muted"> · ${new Date(o.createdAt).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</small><div class="queue-actions">${next[o.status]?`<button class="secondary-button" data-status="${next[o.status]}" data-order="${o.id}">Marcar ${next[o.status]}</button>`:''}${['nuevo','aceptado','preparando'].includes(o.status)?`<button class="text-button danger" data-status="cancelado" data-order="${o.id}">Cancelar</button>`:''}</div></article>`).join(''):'<p class="muted">Sin pedidos.</p>';
  }catch(e){queue.textContent=e.message;}
}
function startPolling(){clearInterval(poll);poll=setInterval(()=>{if($('cashierDialog').open&&!document.hidden)loadQueue();},5000);}

// ---- Eventos ----
$('mascot').addEventListener('click',()=>{
  if(busy||sending)return;
  if(sessionActive){if(voice.mode==='listening')voice.finish();else voice.call();}
  else startSession();
});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',()=>$(b.dataset.close).close());
$('cashierOpen').addEventListener('click',()=>{
  $('cashierInfo').textContent=mode==='demo'?'Caja de prueba.':'Pedidos conectados.';
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
    if(mode==='demo'){const orders=readStore(`${storageKey}-orders`,[]);const o=orders.find(o=>o.id===b.dataset.order);if(o)o.status=b.dataset.status;store(`${storageKey}-orders`,orders);}
    else{const res=await fetch('/api/orders',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${staffToken}`},body:JSON.stringify({id:b.dataset.order,status:b.dataset.status}),signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error((await res.json()).error);}
    await loadQueue();
  }catch(er){toast(er.message);b.disabled=false;}
});
window.addEventListener('storage',e=>{if(e.key===`${storageKey}-orders`&&$('cashierDialog').open)loadQueue();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){interrupt();voice.disable();sessionActive=false;}else if($('cashierDialog').open)loadQueue();});

// ---- Init ----
async function init(){
  try{
    const res=await fetch('/api/menu');const data=await res.json();
    if(!res.ok)throw new Error(data.error);
    ({menu,restaurant,mode}=data);
    voice.greeting=restaurant.greeting;
    $('brandName').textContent=restaurant.name.toLowerCase();
    $('modeBadge').textContent=mode==='demo'?'Demo interactiva':'Conectado';
    const saved=readStore(storageKey,{});
    try{cart=validateCart(saved.cart||[],menu);pending=saved.pending||null;}catch{cart=[];pending=null;}
    customerName=saved.customer||'';
  }catch(e){$('reply').textContent='Error cargando. Recarga la página.';$('mascot').disabled=true;}
}
init();
