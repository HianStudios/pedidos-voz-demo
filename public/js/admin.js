import {money} from './domain.js';
import {ordersKey,readStore,observeOrders} from './order-store.js';
import {initMenuEditor} from './menu-editor.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compact=n=>n>=1000?`${(n/1000).toFixed(n>=10000?0:1).replace('.',',')} K`:String(n);

let mode='demo',token='',orders=[],ratings={},menu=[],settings={};
let calYear=new Date().getFullYear(),calMonth=new Date().getMonth(),selectedDay=null;
let metricsDays=7;

// ── Section navigation ──
function showSection(name){
  document.querySelectorAll('.admin-content > section').forEach(s=>s.classList.toggle('active',s.id===`sec-${name}`));
  document.querySelectorAll('.sidebar-nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.section===name)));
  if(name==='dashboard')renderCalendar();
  if(name==='metrics')renderMetrics();
  if(name==='tables')renderTables();
}
document.querySelector('.sidebar-nav').addEventListener('click',e=>{
  const b=e.target.closest('[data-section]');if(!b)return;showSection(b.dataset.section);
});

// ── Chart helpers (shared) ──
function bars(el,rows,{unit='',format=v=>compact(v)}={}){
  if(!rows.length){el.innerHTML='<p class="empty-chart">Sin datos en este periodo.</p>';return;}
  const max=Math.max(...rows.map(r=>r.value));
  el.innerHTML=`<div class="hbars">${rows.map(r=>`<div class="hbar" tabindex="0" data-tip="${esc(r.label)}: ${esc(format(r.value))}${unit}"><span class="hbar-label">${esc(r.label)}</span><span class="hbar-track"><span class="hbar-fill" style="width:${r.value?Math.max(2,r.value/max*100):0}%"></span><span class="hbar-value">${esc(format(r.value))}</span></span></div>`).join('')}</div>${tableHtml(rows,format,unit)}`;
}
function columns(el,rows){
  const max=Math.max(1,...rows.map(r=>r.value));
  if(!rows.some(r=>r.value)){el.innerHTML='<p class="empty-chart">Sin pedidos en este periodo.</p>';return;}
  const ticks=[0,Math.ceil(max/2),max];
  el.innerHTML=`<div class="cols"><div class="cols-grid">${ticks.map(t=>`<span style="bottom:${t/max*100}%"><i>${t}</i></span>`).join('')}</div><div class="cols-plot">${rows.map(r=>`<div class="col" tabindex="0" data-tip="${esc(r.label)}: ${r.value} ${r.value===1?'pedido':'pedidos'}"><span class="col-fill" style="height:${r.value/max*100}%"></span><span class="col-label">${esc(r.short||r.label)}</span></div>`).join('')}</div></div>${tableHtml(rows,v=>v,' pedidos')}`;
}
function tableHtml(rows,format,unit){return `<details class="chart-table"><summary>Ver tabla</summary><table><tbody>${rows.map(r=>`<tr><th scope="row">${esc(r.label)}</th><td>${esc(format(r.value))}${unit}</td></tr>`).join('')}</tbody></table></details>`;}

// ── Tooltip ──
function showTip(el,x,y){const tip=$('tip');tip.textContent=el.dataset.tip;tip.hidden=false;const w=tip.offsetWidth;tip.style.left=`${Math.min(innerWidth-w-12,Math.max(12,x-w/2))}px`;tip.style.top=`${y-44}px`;}
document.addEventListener('pointermove',e=>{const el=e.target.closest('[data-tip]');if(el)showTip(el,e.clientX,e.clientY);else $('tip').hidden=true;});
document.addEventListener('focusin',e=>{const el=e.target.closest('[data-tip]');if(el){const r=el.getBoundingClientRect();showTip(el,r.left+r.width/2,r.top);}});
document.addEventListener('focusout',()=>{$('tip').hidden=true;});

// ── Calendar ──
const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const dayNames=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function ordersForDate(date){
  const ds=date.toDateString();
  return orders.filter(o=>o.status!=='cancelado'&&new Date(o.createdAt).toDateString()===ds);
}

function renderCalendar(){
  $('calTitle').textContent=`${monthNames[calMonth]} ${calYear}`;
  const first=new Date(calYear,calMonth,1);
  let startDay=first.getDay()-1;if(startDay<0)startDay=6;
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();const todayStr=today.toDateString();

  let html=dayNames.map(d=>`<div class="calendar-header">${d}</div>`).join('');
  for(let i=0;i<startDay;i++)html+=`<div class="calendar-day empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const date=new Date(calYear,calMonth,d);
    const ds=date.toDateString();
    const count=ordersForDate(date).length;
    const isToday=ds===todayStr;
    const isSelected=selectedDay&&ds===selectedDay.toDateString();
    html+=`<div class="calendar-day${isToday?' today':''}${isSelected?' selected':''}" data-day="${d}"><span class="day-num">${d}</span>${count?`<span class="day-count">${count} ${count===1?'pedido':'pedidos'}</span>`:''}</div>`;
  }
  $('calGrid').innerHTML=html;
}

$('calGrid').addEventListener('click',e=>{
  const cell=e.target.closest('.calendar-day:not(.empty)');if(!cell)return;
  const d=Number(cell.dataset.day);
  selectedDay=new Date(calYear,calMonth,d);
  renderCalendar();
  showDayDetail(selectedDay);
});
$('calPrev').addEventListener('click',()=>{calMonth--;if(calMonth<0){calMonth=11;calYear--;}selectedDay=null;$('dayDetail').hidden=true;renderCalendar();});
$('calNext').addEventListener('click',()=>{calMonth++;if(calMonth>11){calMonth=0;calYear++;}selectedDay=null;$('dayDetail').hidden=true;renderCalendar();});

function showDayDetail(date){
  const list=ordersForDate(date);
  const delivered=list.filter(o=>o.status==='entregado');
  const sales=delivered.reduce((s,o)=>s+o.total,0);
  const rated=list.map(o=>({order:o,rating:ratings[o.id]||o.rating})).filter(r=>r.rating);
  const avg=rated.length?rated.reduce((s,r)=>s+r.rating.stars,0)/rated.length:0;

  const opts={weekday:'long',day:'numeric',month:'long',year:'numeric'};
  $('dayTitle').textContent=date.toLocaleDateString('es-EC',opts);
  $('dayStats').innerHTML=`
    <div class="day-stat"><span>Pedidos</span><strong>${list.length}</strong></div>
    <div class="day-stat"><span>Ventas</span><strong>${money(sales)}</strong></div>
    <div class="day-stat"><span>Ticket promedio</span><strong>${money(delivered.length?Math.round(sales/delivered.length):0)}</strong></div>
    <div class="day-stat"><span>Experiencia</span><strong>${rated.length?`★ ${avg.toFixed(1).replace('.',',')}`:'—'}</strong></div>`;

  $('dayOrdersBody').innerHTML=list.length?list.map(o=>`<tr>
    <td>#${esc(o.number)}</td><td>${esc(o.customer)}</td><td>${o.table?`Mesa ${esc(o.table)}`:'Retiro'}</td>
    <td>${o.items.map(l=>`${l.qty}× ${esc(l.name)}`).join(', ')}</td><td>${money(o.total)}</td>
    <td><span class="status-pill" data-status="${esc(o.status)}">${esc(o.status)}</span></td>
    <td>${new Date(o.createdAt).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</td></tr>`).join('')
    :'<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">No hubo pedidos este día.</td></tr>';

  const voices=rated.filter(r=>r.rating.comment).sort((a,b)=>Date.parse(b.rating.at)-Date.parse(a.rating.at));
  $('dayRatings').innerHTML=voices.length?`<h3 style="font-size:16px;margin:0 0 12px">Opiniones del día</h3><ul class="voices">${voices.map(r=>`<li><span class="voice-stars" aria-label="${r.rating.stars} estrellas">${'★'.repeat(Math.round(r.rating.stars))}${'☆'.repeat(5-Math.round(r.rating.stars))}</span><q>${esc(r.rating.comment)}</q><small>${r.order.table?`Mesa ${esc(r.order.table)}`:esc(r.order.customer)} · ${new Date(r.rating.at).toLocaleString('es-EC',{weekday:'short',hour:'2-digit',minute:'2-digit'})}</small></li>`).join('')}</ul>`:'';

  $('dayDetail').hidden=false;
}

// ── Metrics ──
function renderMetrics(){
  const now=Date.now();
  const inPeriod=o=>o.status!=='cancelado'&&(now-Date.parse(o.createdAt))<metricsDays*86400000;
  const inPrev=o=>o.status!=='cancelado'&&(now-Date.parse(o.createdAt))>=metricsDays*86400000&&(now-Date.parse(o.createdAt))<metricsDays*2*86400000;
  const current=orders.filter(inPeriod);
  const previous=orders.filter(inPrev);
  const delivered=current.filter(o=>o.status==='entregado');
  const prevDelivered=previous.filter(o=>o.status==='entregado');
  const sales=delivered.reduce((s,o)=>s+o.total,0);
  const prevSales=prevDelivered.reduce((s,o)=>s+o.total,0);
  const avgTicket=delivered.length?Math.round(sales/delivered.length):0;
  const prevAvgTicket=prevDelivered.length?Math.round(prevSales/prevDelivered.length):0;
  const rated=current.map(o=>({order:o,rating:ratings[o.id]||o.rating})).filter(r=>r.rating);
  const prevRated=previous.map(o=>({order:o,rating:ratings[o.id]||o.rating})).filter(r=>r.rating);
  const avg=rated.length?rated.reduce((s,r)=>s+r.rating.stars,0)/rated.length:0;
  const prevAvg=prevRated.length?prevRated.reduce((s,r)=>s+r.rating.stars,0)/prevRated.length:0;

  function pct(curr,prev){if(!prev)return curr>0?{text:'+100%',cls:'up'}:{text:'—',cls:''};const p=Math.round((curr-prev)/prev*100);return{text:`${p>=0?'+':''}${p}%`,cls:p>=0?'up':'down'};}

  const salesChg=pct(sales,prevSales);
  const ordersChg=pct(current.length,previous.length);
  const ticketChg=pct(avgTicket,prevAvgTicket);
  const ratingChg=pct(avg,prevAvg);

  $('metricsKpis').innerHTML=`
    <article class="kpi hero"><span>Ventas</span><strong>${money(sales)}</strong><small class="kpi-change ${salesChg.cls}">${salesChg.text} vs periodo anterior</small></article>
    <article class="kpi"><span>Pedidos</span><strong>${compact(current.length)}</strong><small class="kpi-change ${ordersChg.cls}">${ordersChg.text}</small></article>
    <article class="kpi"><span>Ticket promedio</span><strong>${money(avgTicket)}</strong><small class="kpi-change ${ticketChg.cls}">${ticketChg.text}</small></article>
    <article class="kpi"><span>Experiencia</span><strong>${rated.length?`★ ${avg.toFixed(1).replace('.',',')}`:'—'}</strong><small class="kpi-change ${ratingChg.cls}">${rated.length?ratingChg.text:'sin datos'}</small></article>`;

  const category=id=>menu.find(p=>p.id===id)?.category;
  const revenue=new Map();
  for(const o of current)for(const l of o.items){const p=menu.find(x=>x.id===l.id);if(p)revenue.set(l.id,{name:l.name,val:(revenue.get(l.id)?.val||0)+l.qty*p.price});}
  const ranked=[...revenue.entries()].map(([id,v])=>({id,label:v.name,value:v.val})).sort((a,b)=>b.value-a.value);
  bars(document.querySelector('#mcFood .chart'),ranked.filter(r=>!['Mesa'].includes(category(r.id))).slice(0,8),{format:v=>money(v)});

  const hours=Array.from({length:24},(_,h)=>({label:`${String(h).padStart(2,'0')}:00`,short:String(h),value:current.filter(o=>new Date(o.createdAt).getHours()===h).length}));
  const first=hours.findIndex(h=>h.value),last=hours.findLastIndex(h=>h.value);
  columns(document.querySelector('#mcHours .chart'),hours.slice(first<0?11:Math.min(first,11),(last<0?22:Math.max(last,22))+1));

  bars(document.querySelector('#mcRatings .chart'),[5,4,3,2,1].map(n=>({label:`${n} ${n===1?'estrella':'estrellas'}`,value:rated.filter(r=>Math.round(r.rating.stars)===n).length})).filter(()=>rated.length),{format:v=>v});

  // Daily trend
  const trendDays=Math.min(metricsDays,30);
  const dayBuckets=[];
  for(let i=trendDays-1;i>=0;i--){
    const d=new Date(now-i*86400000);
    const ds=d.toDateString();
    const count=current.filter(o=>new Date(o.createdAt).toDateString()===ds).length;
    dayBuckets.push({label:`${d.getDate()}/${d.getMonth()+1}`,short:`${d.getDate()}`,value:count});
  }
  columns(document.querySelector('#mcTrend .chart'),dayBuckets);

  const voices=rated.filter(r=>r.rating.comment).sort((a,b)=>Date.parse(b.rating.at)-Date.parse(a.rating.at)).slice(0,8);
  $('metricsVoices').innerHTML=voices.length?voices.map(r=>`<li><span class="voice-stars" aria-label="${r.rating.stars} estrellas">${'★'.repeat(Math.round(r.rating.stars))}${'☆'.repeat(5-Math.round(r.rating.stars))}</span><q>${esc(r.rating.comment)}</q><small>${r.order.table?`Mesa ${esc(r.order.table)}`:esc(r.order.customer)} · ${new Date(r.rating.at).toLocaleString('es-EC',{weekday:'short',hour:'2-digit',minute:'2-digit'})}</small></li>`).join(''):'<li class="muted">Aún no hay comentarios en este periodo.</li>';
}

document.querySelector('.metrics-period').addEventListener('click',e=>{
  const b=e.target.closest('[data-mperiod]');if(!b)return;
  metricsDays=Number(b.dataset.mperiod);
  document.querySelectorAll('[data-mperiod]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  renderMetrics();
});

// ── Tables management ──
function renderTables(){
  const count=settings.tables||0;
  $('tablesCount').value=count;
  if(!count){$('tablesGrid').innerHTML='<p class="muted">Configura el número de mesas para ver su estado.</p>';return;}
  const now=Date.now();
  const recent=orders.filter(o=>o.table&&o.status!=='cancelado'&&(now-Date.parse(o.createdAt))<12*3600000);
  let html='';
  for(let i=1;i<=count;i++){
    const tableOrders=recent.filter(o=>o.table===i||o.table===String(i));
    const active=tableOrders.some(o=>!['entregado','cancelado'].includes(o.status));
    const lastOrder=tableOrders.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
    const statusText=active?'Pedido activo':lastOrder?`Último: ${new Date(lastOrder.createdAt).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}`:'Sin actividad';
    html+=`<div class="table-card${active?' active':''}"><div class="table-num">Mesa ${i}</div><div class="table-status">${statusText}</div></div>`;
  }
  $('tablesGrid').innerHTML=html;
}

$('tablesSave').addEventListener('click',async()=>{
  const n=Number($('tablesCount').value);
  if(!Number.isInteger(n)||n<0||n>100){$('tablesNote').textContent='Número inválido (0–100).';return;}
  if(mode==='demo'){settings.tables=n;renderTables();$('tablesNote').textContent='Guardado (modo prueba).';return;}
  try{
    const res=await fetch('/api/menu',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({settings:{tables:n}})});
    const data=await res.json();if(!res.ok)throw new Error(data.error);
    settings={...settings,...(data.settings||{})};renderTables();$('tablesNote').textContent='Número de mesas guardado.';
  }catch(e){$('tablesNote').textContent=e.message;}
});

// ── Settings (promo + pin) ──
$('promoSave').addEventListener('click',async()=>{
  if(mode==='demo'){$('settingsNote').textContent='En modo prueba no se guardan cambios.';return;}
  try{
    const res=await fetch('/api/menu',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({settings:{promo:$('promoText').value}})});
    const data=await res.json();if(!res.ok)throw new Error(data.error);
    settings={...settings,...(data.settings||{})};$('promoText').value=settings.promo||'';
    $('settingsNote').textContent=settings.promo?'Promoción guardada: Milo la dice al saludar.':'Promoción quitada.';
  }catch(e){$('settingsNote').textContent=e.message;}
});

$('pinSave').addEventListener('click',async()=>{
  const pin=$('pinText').value.trim();
  if(!/^\d{4,8}$/.test(pin)){$('settingsNote').textContent='La clave del kiosco debe tener de 4 a 8 números.';return;}
  if(mode==='demo'){$('settingsNote').textContent='En modo prueba no se guardan cambios.';return;}
  try{
    const res=await fetch('/api/menu',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({settings:{pin}})});
    const data=await res.json();if(!res.ok)throw new Error(data.error);
    $('pinText').value='';$('settingsNote').textContent='Clave del kiosco cambiada.';
  }catch(e){$('settingsNote').textContent=e.message;}
});

// ── Data loading ──
async function load(){
  if(mode==='demo'){orders=readStore(ordersKey,[]);ratings={};refresh();return;}
  const headers={Authorization:`Bearer ${token}`};
  const [o,r]=await Promise.all([fetch('/api/orders?limit=1000',{headers}),fetch('/api/ratings',{headers})]);
  if(o.status===401){logout('Clave incorrecta o vencida.');return;}
  const od=await o.json();if(!o.ok)throw new Error(od.error);
  orders=od.orders;ratings=r.ok?(await r.json()).ratings:{};
  refresh();
}

function refresh(){
  renderCalendar();
  if(selectedDay)showDayDetail(selectedDay);
  renderMetrics();
  renderTables();
  $('adminInfo').textContent=mode==='demo'?'Datos de prueba de este navegador.':`Actualizado ${new Date().toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})} · últimos 1.000 pedidos.`;
}

// ── Auth ──
function logout(message=''){
  token='';$('sidebar').hidden=true;
  document.querySelectorAll('.admin-content > section').forEach(s=>s.classList.remove('active'));
  $('staffForm').hidden=false;$('loginError').textContent=message;
}

$('staffForm').addEventListener('submit',async e=>{
  e.preventDefault();token=$('staffToken').value;$('staffToken').value='';
  try{
    await load();if(!token&&mode!=='demo')return;
    $('staffForm').hidden=true;$('sidebar').hidden=false;showSection('dashboard');
  }catch(err){token='';$('loginError').textContent=err.message;}
});
$('logout').addEventListener('click',()=>logout());

// ── Demo observer + auto-refresh ──
observeOrders(()=>{if(mode==='demo')load();});
setInterval(()=>{if(token&&!document.hidden)load().catch(()=>{});},60000);

// ── Menu editor integration ──
const editor=initMenuEditor({getToken:()=>token,getMode:()=>mode,onLogout:m=>logout(m)});

// ── Init ──
async function init(){
  try{
    const res=await fetch('/api/menu');const data=await res.json();
    mode=data.mode;menu=data.menu;
    settings=data.restaurant||{};
    if(data.restaurant?.tables!=null)settings.tables=data.restaurant.tables;
    editor.set(data);
    $('promoText').value=data.restaurant?.promo||'';
    $('modeBadge').textContent=mode==='demo'?'Panel de prueba':'Panel conectado';
    if(mode==='demo'){$('staffForm').hidden=true;$('sidebar').hidden=false;showSection('dashboard');await load();}
    else logout('');
  }catch{$('adminInfo').textContent='No pude cargar el panel. Recarga para reintentar.';}
}
init();
