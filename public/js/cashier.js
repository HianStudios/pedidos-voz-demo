import {money} from './domain.js';
import {ordersKey,readStore,saveOrders,observeOrders} from './order-store.js';
import {consumeEvents} from './live-feed.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='demo',token='',orders=[],filter='active',controller=null,retry=null,generation=0,delay=1000,signature='',changing=new Set();
const next={nuevo:'aceptado',aceptado:'preparando',preparando:'listo',listo:'entregado'};
const labels={aceptado:'Aceptar pedido',preparando:'Pasar a cocina',listo:'Marcar listo',entregado:'Entregar'};
function connection(state,text){$('connection').dataset.state=state;$('connectionText').textContent=text;}
function render(){
 const payload=JSON.stringify({orders,filter,changing:[...changing]});if(payload===signature)return;signature=payload;
 $('newCount').textContent=orders.filter(o=>o.status==='nuevo').length;
 $('preparingCount').textContent=orders.filter(o=>['aceptado','preparando'].includes(o.status)).length;
 $('readyCount').textContent=orders.filter(o=>o.status==='listo').length;
 const shown=orders.filter(o=>filter==='all'||(filter==='done'?['entregado','cancelado'].includes(o.status):!['entregado','cancelado'].includes(o.status)));
 $('queue').innerHTML=shown.length?shown.map(o=>`<article class="queue-card" data-id="${esc(o.id)}"><header><span class="order-number">#${esc(o.number)}</span><span class="status-pill" data-status="${esc(o.status)}">${esc(o.status)}</span></header><h3>${esc(o.customer)}</h3><small class="muted">Retiro · ${new Date(o.createdAt).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</small><div class="ticket-items">${o.items.map(l=>`<p><b>${l.qty} ×</b> ${esc(l.name)}${l.notes?.length?`<small>${l.notes.map(esc).join(', ')}</small>`:''}</p>`).join('')}</div><div class="ticket-total"><span>Total</span><strong>${money(o.total)}</strong></div><div class="queue-actions">${next[o.status]?`<button class="primary-button" data-order="${esc(o.id)}" data-status="${next[o.status]}" ${changing.has(o.id)?'disabled':''}>${labels[next[o.status]]}</button>`:''}${['nuevo','aceptado','preparando'].includes(o.status)?`<button class="text-button danger" data-order="${esc(o.id)}" data-status="cancelado" ${changing.has(o.id)?'disabled':''}>Cancelar</button>`:''}</div></article>`).join(''):'<div class="empty-queue"><span>✦</span><h2>Todo al día.</h2><p>Los pedidos aparecerán aquí automáticamente.</p></div>';
}
function update(nextOrders){orders=nextOrders;render();$('lastUpdate').textContent=`Actualizado ${new Date().toLocaleTimeString('es-EC')}`;}
function stop(){generation++;clearTimeout(retry);retry=null;controller?.abort();controller=null;}
function logout(message='Accede con tu clave'){
 stop();token='';orders=[];signature='';$('queue').replaceChildren();$('workspace').hidden=true;$('staffForm').hidden=false;$('logout').hidden=true;$('loginError').textContent=message;connection('offline','Acceso del personal');
}
async function connect(){
 stop();const own=generation;
 if(document.hidden)return;
 if(mode==='demo'){update(readStore(ordersKey,[]));connection('live','En vivo · este navegador');return;}
 if(!token)return;
 controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(32000)]);connection('connecting','Conectando…');
 try{
  const res=await fetch('/api/order-events',{headers:{Authorization:`Bearer ${token}`},signal});
  if(own!==generation)return;if(res.status===401){logout('Clave incorrecta o acceso vencido.');return;}if(!res.ok)throw new Error('No se pudo conectar');
  await consumeEvents(res,(event,data)=>{
   if(own!==generation)return;
   if(event==='orders'){update(data.orders);delay=1000;connection('live','En vivo');}
   if(event==='heartbeat')connection('live','En vivo');
   if(event==='unavailable')throw new Error(data.message);
  });
  if(own===generation){connection('connecting','Renovando conexión…');retry=setTimeout(connect,250);}
 }catch(e){if(own!==generation)return;connection('offline','Sin conexión · reintentando');retry=setTimeout(connect,delay);delay=Math.min(delay*2,15000);}
}
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();token=$('staffToken').value;$('staffToken').value='';$('loginError').textContent='';
 try{const res=await fetch('/api/orders',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});const data=await res.json();if(!res.ok)throw new Error(data.error||'No se pudo acceder');update(data.orders);$('workspace').hidden=false;$('staffForm').hidden=true;$('logout').hidden=false;connect();}catch(e){token='';$('loginError').textContent=e.message;}
});
$('logout').addEventListener('click',()=>logout(''));$('reconnect').addEventListener('click',connect);
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));render();});
$('queue').addEventListener('click',async e=>{
 const b=e.target.closest('[data-order]');if(!b||changing.has(b.dataset.order))return;
 const {order:id,status}=b.dataset;if(status==='cancelado'&&!confirm('¿Cancelar este pedido?'))return;
 changing.add(id);render();$('queueNotice').textContent='';
 try{
  if(mode==='demo'){const saved=readStore(ordersKey,[]);const order=saved.find(o=>o.id===id);if(!order||!(next[order.status]===status||status==='cancelado'&&['nuevo','aceptado','preparando'].includes(order.status)))throw new Error('El estado cambió. Revisa el pedido.');order.status=status;saveOrders(saved);update(saved);}
  else{const res=await fetch('/api/orders',{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({id,status}),signal:AbortSignal.timeout(12000)});const data=await res.json();if(res.status===401){logout();return;}if(!res.ok)throw new Error(data.error);update(orders.map(o=>o.id===id?data.order:o));connect();}
 }catch(e){$('queueNotice').textContent=e.message;}
 finally{changing.delete(id);render();}
});
observeOrders(()=>{if(mode==='demo')update(readStore(ordersKey,[]));});
window.addEventListener('offline',()=>{stop();connection('offline','Sin conexión');});window.addEventListener('online',connect);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();connection('connecting','En pausa');}else connect();});
window.addEventListener('pagehide',stop);
async function init(){try{const res=await fetch('/api/menu');if(!res.ok)throw new Error();const data=await res.json();mode=data.mode;$('modeBadge').textContent=mode==='demo'?'Caja de prueba':'Caja compartida';$('cashierInfo').textContent=mode==='demo'?'Prueba en vivo entre pestañas de este navegador. Para otros dispositivos, configura caja compartida.':'Pedidos y estados actualizados automáticamente.';if(mode==='demo'){$('workspace').hidden=false;connect();}else logout('');}catch{connection('offline','No pude cargar caja. Recarga para reintentar.');}}
init();
