import {money} from './domain.js';
import {ordersKey,readStore,observeOrders} from './order-store.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='demo',token='',orders=[],ratings={},menu=[],days=1;
const compact=n=>n>=1000?`${(n/1000).toFixed(n>=10000?0:1).replace('.',',')} K`:String(n);
// Barras horizontales: una serie, un color, valor en la punta; tooltip al pasar el cursor; tabla accesible.
function bars(el,rows,{unit='',format=v=>compact(v)}={}){
  if(!rows.length){el.innerHTML='<p class="empty-chart">Sin datos en este periodo.</p>';return;}
  const max=Math.max(...rows.map(r=>r.value));
  el.innerHTML=`<div class="hbars">${rows.map(r=>`<div class="hbar" tabindex="0" data-tip="${esc(r.label)}: ${esc(format(r.value))}${unit}"><span class="hbar-label">${esc(r.label)}</span><span class="hbar-track"><span class="hbar-fill" style="width:${r.value?Math.max(2,r.value/max*100):0}%"></span><span class="hbar-value">${esc(format(r.value))}</span></span></div>`).join('')}</div>${table(rows,format,unit)}`;
}
// Columnas por hora: una serie, eje con horas, tooltip por columna.
function columns(el,rows){
  const max=Math.max(1,...rows.map(r=>r.value));
  if(!rows.some(r=>r.value)){el.innerHTML='<p class="empty-chart">Sin pedidos en este periodo.</p>';return;}
  const ticks=[0,Math.ceil(max/2),max];
  el.innerHTML=`<div class="cols"><div class="cols-grid">${ticks.map(t=>`<span style="bottom:${t/max*100}%"><i>${t}</i></span>`).join('')}</div><div class="cols-plot">${rows.map(r=>`<div class="col" tabindex="0" data-tip="${esc(r.label)}: ${r.value} ${r.value===1?'pedido':'pedidos'}"><span class="col-fill" style="height:${r.value/max*100}%"></span><span class="col-label">${esc(r.short)}</span></div>`).join('')}</div></div>${table(rows,v=>v,' pedidos')}`;
}
function table(rows,format,unit){return `<details class="chart-table"><summary>Ver tabla</summary><table><tbody>${rows.map(r=>`<tr><th scope="row">${esc(r.label)}</th><td>${esc(format(r.value))}${unit}</td></tr>`).join('')}</tbody></table></details>`;}
function inRange(o){return Date.now()-Date.parse(o.createdAt)<days*86400000&&(days!==1||new Date(o.createdAt).toDateString()===new Date().toDateString());}
function render(){
  const list=orders.filter(o=>o.status!=='cancelado'&&inRange(o));
  const sales=list.reduce((s,o)=>s+o.total,0);
  $('kpiSales').textContent=money(sales);$('kpiOrders').textContent=compact(list.length);
  $('kpiTicket').textContent=money(list.length?Math.round(sales/list.length):0);
  $('kpiSalesNote').textContent=days===1?'hoy':`últimos ${days} días`;
  const cancelled=orders.filter(o=>o.status==='cancelado'&&inRange(o)).length;$('kpiOrdersNote').textContent=cancelled?`${cancelled} cancelados aparte`:'sin cancelados';
  const rated=list.map(o=>({order:o,rating:ratings[o.id]||o.rating})).filter(r=>r.rating);
  const avg=rated.length?rated.reduce((s,r)=>s+r.rating.stars,0)/rated.length:0;
  $('kpiRating').textContent=rated.length?`★ ${avg.toFixed(1).replace('.',',')}`:'—';
  $('kpiRatingNote').textContent=rated.length?`${rated.length} ${rated.length===1?'calificación':'calificaciones'}`:'sin calificaciones';
  // Unidades por producto, separadas en comida y bebidas.
  const units=new Map();for(const o of list)for(const l of o.items)units.set(l.id,{name:l.name,qty:(units.get(l.id)?.qty||0)+l.qty});
  const category=id=>menu.find(p=>p.id===id)?.category;
  const ranked=[...units.entries()].map(([id,v])=>({id,label:v.name,value:v.qty})).sort((a,b)=>b.value-a.value);
  bars(chart('food'),ranked.filter(r=>category(r.id)!=='Bebidas').slice(0,8),{unit:' u.'});
  bars(chart('drinks'),ranked.filter(r=>category(r.id)==='Bebidas').slice(0,6),{unit:' u.'});
  const hours=Array.from({length:24},(_,h)=>({label:`${String(h).padStart(2,'0')}:00`,short:String(h),value:list.filter(o=>new Date(o.createdAt).getHours()===h).length}));
  // Horario base 11:00–22:00, ampliado si hubo pedidos fuera de él.
  const first=hours.findIndex(h=>h.value),last=hours.findLastIndex(h=>h.value);
  columns(chart('hours'),hours.slice(first<0?11:Math.min(first,11),(last<0?22:Math.max(last,22))+1));
  bars(chart('ratings'),[5,4,3,2,1].map(n=>({label:`${n} ${n===1?'estrella':'estrellas'}`,value:rated.filter(r=>Math.round(r.rating.stars)===n).length})).filter(()=>rated.length),{format:v=>v});
  const tables=new Map();for(const o of list)if(o.table)tables.set(o.table,(tables.get(o.table)||0)+1);
  bars(chart('tables'),[...tables.entries()].map(([t,v])=>({label:`Mesa ${t}`,value:v})).sort((a,b)=>b.value-a.value).slice(0,8),{format:v=>v,unit:' ped.'});
  const voices=rated.filter(r=>r.rating.comment).sort((a,b)=>Date.parse(b.rating.at)-Date.parse(a.rating.at)).slice(0,6);
  $('voices').innerHTML=voices.length?voices.map(r=>`<li><span class="voice-stars" aria-label="${r.rating.stars} estrellas">${'★'.repeat(Math.round(r.rating.stars))}${'☆'.repeat(5-Math.round(r.rating.stars))}</span><q>${esc(r.rating.comment)}</q><small>${r.order.table?`Mesa ${esc(r.order.table)}`:esc(r.order.customer)} · ${new Date(r.rating.at).toLocaleString('es-EC',{weekday:'short',hour:'2-digit',minute:'2-digit'})}</small></li>`).join(''):'<li class="muted">Aún no hay comentarios en este periodo.</li>';
  $('adminInfo').textContent=mode==='demo'?'Datos de prueba de este navegador.':`Actualizado ${new Date().toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})} · últimos 1.000 pedidos (se guardan 30 días).`;
}
const chart=name=>document.querySelector(`[data-chart="${name}"] .chart`);
// Tooltip compartido: sigue al puntero o al foco de teclado; el texto va por textContent.
function showTip(el,x,y){const tip=$('tip');tip.textContent=el.dataset.tip;tip.hidden=false;const w=tip.offsetWidth;tip.style.left=`${Math.min(innerWidth-w-12,Math.max(12,x-w/2))}px`;tip.style.top=`${y-44}px`;}
document.addEventListener('pointermove',e=>{const el=e.target.closest('[data-tip]');if(el)showTip(el,e.clientX,e.clientY);else $('tip').hidden=true;});
document.addEventListener('focusin',e=>{const el=e.target.closest('[data-tip]');if(el){const r=el.getBoundingClientRect();showTip(el,r.left+r.width/2,r.top);}});
document.addEventListener('focusout',()=>{$('tip').hidden=true;});
async function load(){
  if(mode==='demo'){orders=readStore(ordersKey,[]);ratings={};render();return;}
  const headers={Authorization:`Bearer ${token}`};
  const [o,r]=await Promise.all([fetch('/api/orders?limit=1000',{headers}),fetch('/api/ratings',{headers})]);
  if(o.status===401){logout('Clave incorrecta o vencida.');return;}
  const od=await o.json();if(!o.ok)throw new Error(od.error);orders=od.orders;ratings=r.ok?(await r.json()).ratings:{};render();
}
function logout(message=''){token='';$('dashboard').hidden=true;$('staffForm').hidden=false;$('logout').hidden=true;$('loginError').textContent=message;}
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();token=$('staffToken').value;$('staffToken').value='';try{await load();if(!token)return;$('dashboard').hidden=false;$('staffForm').hidden=true;$('logout').hidden=false;}catch(err){token='';$('loginError').textContent=err.message;}});
$('logout').addEventListener('click',()=>logout());
$('refresh').addEventListener('click',()=>load().catch(err=>{$('adminInfo').textContent=err.message;}));
for(const b of document.querySelectorAll('[data-range]'))b.addEventListener('click',()=>{days=Number(b.dataset.range);document.querySelectorAll('[data-range]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
observeOrders(()=>{if(mode==='demo')load();});
setInterval(()=>{if(token&&!document.hidden)load().catch(()=>{});},60000);
async function init(){
  try{const res=await fetch('/api/menu');const data=await res.json();mode=data.mode;menu=data.menu;
    $('modeBadge').textContent=mode==='demo'?'Panel de prueba':'Panel conectado';
    if(mode==='demo'){$('dashboard').hidden=false;await load();}else logout('');}
  catch{$('adminInfo').textContent='No pude cargar el panel. Recarga para reintentar.';}
}
init();
