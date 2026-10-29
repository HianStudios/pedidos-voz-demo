import {money} from './domain.js';
import {ordersKey,readStore,saveOrders,observeOrders} from './order-store.js';
import {consumeEvents} from './live-feed.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='demo',token='',orders=[],controller=null,retry=null,generation=0,delay=1000,signature='',changing=new Set();
const next={nuevo:'aceptado',aceptado:'preparando',preparando:'listo',listo:'entregado'};
const labels={aceptado:'Aceptar',preparando:'A cocina',listo:'Listo para llevar',entregado:'Entregado ✓'};
function connection(state,text){$('connection').dataset.state=state;$('connectionText').textContent=text;}
function toast(text){const el=$('toast');el.textContent=text;el.classList.add('visible');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('visible'),2600);}
function render(){
  const active=orders.filter(o=>!['entregado','cancelado'].includes(o.status));
  const payload=JSON.stringify({active,changing:[...changing]});if(payload===signature)return;signature=payload;
  $('newCount').textContent=active.filter(o=>o.status==='nuevo').length;
  $('preparingCount').textContent=active.filter(o=>['aceptado','preparando'].includes(o.status)).length;
  $('readyCount').textContent=active.filter(o=>o.status==='listo').length;
  $('orders').innerHTML=active.length?active.map(o=>`<article class="order-card" data-id="${esc(o.id)}">
    <header><span class="status-pill" data-status="${esc(o.status)}">${esc(o.status)}</span><span class="order-meta">#${esc(o.number)} · ${new Date(o.createdAt).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</span></header>
    <h3>${esc(o.customer)}${o.table?` · Mesa ${esc(o.table)}`:''}</h3>
    <div class="order-items">${o.items.map(l=>`<p><b>${l.qty} ×</b> ${esc(l.name)}${l.notes?.length?`<small>${l.notes.map(esc).join(', ')}</small>`:''}</p>`).join('')}</div>
    <div class="order-total"><span>Total</span><strong>${money(o.total)}</strong></div>
    <div class="order-actions">${next[o.status]?`<button class="primary-button" data-order="${esc(o.id)}" data-status="${next[o.status]}" ${changing.has(o.id)?'disabled':''}>${labels[next[o.status]]}</button>`:''}${['nuevo','aceptado','preparando'].includes(o.status)?`<button class="text-button danger" data-order="${esc(o.id)}" data-status="cancelado" ${changing.has(o.id)?'disabled':''}>Cancelar</button>`:''}</div>
  </article>`).join(''):'<div class="empty-mesero"><span>✦</span><h2>Sin pedidos activos.</h2><p>Los pedidos nuevos aparecerán aquí automáticamente.</p></div>';
}
function update(nextOrders){orders=nextOrders;render();}
function stop(){generation++;clearTimeout(retry);retry=null;controller?.abort();controller=null;}
function logout(message=''){stop();token='';orders=[];signature='';$('orders').replaceChildren();$('workspace').hidden=true;$('staffForm').hidden=false;$('logout').hidden=true;$('loginError').textContent=message;connection('offline','Sin conexión');}
async function connect(){
  stop();const own=generation;if(document.hidden)return;
  if(mode==='demo'){update(readStore(ordersKey,[]));connection('live','En vivo · este navegador');return;}
  if(!token)return;
  controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(32000)]);connection('connecting','Conectando…');
  try{
    const res=await fetch('/api/order-events',{headers:{Authorization:`Bearer ${token}`},signal});
    if(own!==generation)return;if(res.status===401){logout('Clave incorrecta o acceso vencido.');return;}if(!res.ok)throw new Error('No se pudo conectar');
    await consumeEvents(res,(event,data)=>{if(own!==generation)return;if(event==='orders'){update(data.orders);delay=1000;connection('live','En vivo');}if(event==='heartbeat')connection('live','En vivo');});
    if(own===generation){connection('connecting','Renovando…');retry=setTimeout(connect,250);}
  }catch{if(own!==generation)return;connection('offline','Sin conexión · reintentando');retry=setTimeout(connect,delay);delay=Math.min(delay*2,15000);}
}
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();token=$('staffToken').value;$('staffToken').value='';$('loginError').textContent='';
  try{const res=await fetch('/api/orders',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});const data=await res.json();if(!res.ok)throw new Error(data.error||'No se pudo acceder');update(data.orders);$('workspace').hidden=false;$('staffForm').hidden=true;$('logout').hidden=false;connect();}catch(e){token='';$('loginError').textContent=e.message;}
});
$('logout').addEventListener('click',()=>logout(''));
$('orders').addEventListener('click',async e=>{
  const b=e.target.closest('[data-order]');if(!b||changing.has(b.dataset.order))return;
  const {order:id,status}=b.dataset;if(status==='cancelado'&&!confirm('¿Cancelar este pedido?'))return;
  changing.add(id);render();$('queueNotice').textContent='';
  try{
    if(mode==='demo'){const saved=readStore(ordersKey,[]);const order=saved.find(o=>o.id===id);if(!order)throw new Error('Pedido no encontrado.');order.status=status;saveOrders(saved);update(saved);toast(`Pedido #${order.number}: ${status}`);}
    else{const res=await fetch('/api/orders',{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({id,status}),signal:AbortSignal.timeout(12000)});const data=await res.json();if(res.status===401){logout();return;}if(!res.ok)throw new Error(data.error);update(orders.map(o=>o.id===id?data.order:o));toast(`Pedido: ${status}`);connect();}
  }catch(e){$('queueNotice').textContent=e.message;}
  finally{changing.delete(id);render();}
});
observeOrders(()=>{if(mode==='demo')update(readStore(ordersKey,[]));});
window.addEventListener('offline',()=>{stop();connection('offline','Sin conexión');});
window.addEventListener('online',connect);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();connection('connecting','En pausa');}else connect();});
window.addEventListener('pagehide',stop);
async function init(){try{const res=await fetch('/api/menu');if(!res.ok)throw new Error();const data=await res.json();mode=data.mode;$('modeBadge').textContent=mode==='demo'?'Mesero de prueba':'Mesero en vivo';if(mode==='demo'){$('workspace').hidden=false;connect();}else logout('');}catch{connection('offline','No pude cargar. Recarga para reintentar.');}}
init();
