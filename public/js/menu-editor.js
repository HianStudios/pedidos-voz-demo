// Editor del menú en el panel: platos, precios, qué trae, qué se puede quitar, agotados, promoción del día
// y la clave del modo kiosco. Guarda en el servidor; Milo, la mesa y caja lo usan en menos de un minuto.
import {money} from './domain.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cats=['Platos','Combos','Extras','Bebidas'];
// Producto del catálogo → lo que se ve y edita en el formulario.
const toRaw=p=>({id:p.id,name:p.name,category:p.category,price:p.price,desc:p.desc||'',ingredients:p.ingredients||[],
  remove:(p.options||[]).map(o=>o.replace(/^sin /,'')),aliases:(p.aliases||[]).filter(a=>a!==p.name.toLowerCase()),
  tag:p.tag||'',feel:p.feel||'',article:(p.one||'un').split(' ')[0],available:p.available!==false});

export function initMenuEditor({getToken,getMode,onLogout}){
  let menu=[],tab='Platos',editing=null,promo='';
  const editable=()=>getMode()!=='demo';
  async function call(method,body){
    const res=await fetch('/api/menu',{method,headers:{Authorization:`Bearer ${getToken()}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const data=await res.json().catch(()=>({}));
    if(res.status===401){onLogout('Clave incorrecta o vencida.');throw new Error('Sesión vencida.');}
    if(!res.ok)throw new Error(data.error||'No se pudo guardar.');
    return data;
  }
  function note(text,error=false){$('menuNote').textContent=text;$('menuNote').classList.toggle('form-error',error);}
  function render(){
    document.querySelectorAll('[data-menu-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.menuTab===tab)));
    const list=menu.filter(p=>p.category===tab);
    $('menuRows').innerHTML=list.length?list.map(p=>`<div class="menu-row${p.available?'':' off'}" data-id="${esc(p.id)}">
      <span class="menu-emoji" aria-hidden="true">${esc(p.emoji||'🍗')}</span>
      <div class="menu-main"><b>${esc(p.name)}</b><small>${esc((p.ingredients||[]).join(', ')||p.desc)}</small></div>
      <strong class="menu-price">${money(p.price)}</strong>
      <label class="switch"><input type="checkbox" data-toggle="${esc(p.id)}" ${p.available?'checked':''} ${editable()?'':'disabled'}><span>${p.available?'Disponible':'Agotado'}</span></label>
      <button class="secondary-button" data-edit="${esc(p.id)}">Editar</button></div>`).join(''):'<p class="muted">No hay productos en esta categoría.</p>';
    $('promoText').value=promo;
    for(const el of [$('menuAdd'),$('menuReset'),$('promoSave'),$('pinSave'),$('promoText'),$('pinText')])el.disabled=!editable();
    if(!editable())note('En el panel de prueba el menú solo se ve. Para editarlo hace falta la caja compartida.');
  }
  function openForm(p){
    editing=p?.id||null;const r=p?toRaw(p):{name:'',category:tab,price:0,desc:'',ingredients:[],remove:[],aliases:[],tag:'',feel:'',article:'un',available:true};
    $('pfTitle').textContent=p?`Editar ${p.name}`:'Nuevo producto';
    $('pfName').value=r.name;$('pfCategory').value=r.category;$('pfPrice').value=(r.price/100).toFixed(2);$('pfDesc').value=r.desc;
    $('pfIngredients').value=r.ingredients.join(', ');$('pfRemove').value=r.remove.join(', ');$('pfAliases').value=r.aliases.join(', ');
    $('pfTag').value=r.tag;$('pfFeel').value=r.feel;$('pfArticle').value=r.article;$('pfAvailable').checked=r.available;
    $('pfDelete').hidden=!p;$('pfError').textContent='';$('productForm').showModal();$('pfName').focus();
  }
  async function saveAll(next,done){
    try{const data=await call('PUT',{menu:next.filter(p=>p.category!=='Mesa').map(p=>p.__raw||toRaw(p))});menu=data.menu;render();note(done);return true;}
    catch(e){note(e.message,true);return false;}
  }
  $('menuTabs').addEventListener('click',e=>{const b=e.target.closest('[data-menu-tab]');if(!b)return;tab=b.dataset.menuTab;render();});
  $('menuRows').addEventListener('click',e=>{const id=e.target.closest('[data-edit]')?.dataset.edit;if(id)openForm(menu.find(p=>p.id===id));});
  $('menuRows').addEventListener('change',async e=>{
    const id=e.target.dataset.toggle;if(!id)return;const p=menu.find(x=>x.id===id);e.target.disabled=true;
    try{const data=await call('PATCH',{id,available:e.target.checked});menu=data.menu;note(`${p.name}: ${e.target.checked?'disponible':'agotado'}.`);}
    catch(err){note(err.message,true);}
    render();
  });
  $('menuAdd').addEventListener('click',()=>openForm(null));
  $('menuReset').addEventListener('click',async()=>{
    if(!confirm('¿Volver al menú original? Se pierden los cambios hechos aquí.'))return;
    try{const data=await call('PUT',{reset:true});menu=data.menu;render();note('Menú original restaurado.');}catch(e){note(e.message,true);}
  });
  $('pfClose').addEventListener('click',()=>$('productForm').close());
  $('pfDelete').addEventListener('click',async()=>{
    const p=menu.find(x=>x.id===editing);if(!p||!confirm(`¿Quitar «${p.name}» del menú?`))return;
    if(await saveAll(menu.filter(x=>x.id!==editing),`«${p.name}» se quitó del menú.`))$('productForm').close();
  });
  $('productForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const price=Math.round(Number(String($('pfPrice').value).replace(',','.'))*100);
    if(!$('pfName').value.trim()){$('pfError').textContent='Escribe el nombre.';return;}
    if(!Number.isFinite(price)||price<0){$('pfError').textContent='Revisa el precio.';return;}
    const split=v=>v.split(',').map(s=>s.trim()).filter(Boolean);
    const raw={id:editing||undefined,name:$('pfName').value.trim(),category:$('pfCategory').value,price,desc:$('pfDesc').value.trim(),
      ingredients:split($('pfIngredients').value),remove:split($('pfRemove').value),aliases:split($('pfAliases').value),
      tag:$('pfTag').value.trim(),feel:$('pfFeel').value,article:$('pfArticle').value,available:$('pfAvailable').checked};
    const next=editing?menu.map(p=>p.id===editing?{...p,__raw:raw}:p):[...menu,{category:raw.category,__raw:raw}];
    if(await saveAll(next,`«${raw.name}» guardado. Milo ya lo conoce.`)){tab=raw.category;render();$('productForm').close();}
    else $('pfError').textContent=$('menuNote').textContent;
  });
  $('promoSave').addEventListener('click',async()=>{
    try{const data=await call('PUT',{settings:{promo:$('promoText').value}});promo=data.settings.promo;note(promo?'Promoción guardada: Milo la dice al saludar.':'Promoción quitada.');}catch(e){note(e.message,true);}
  });
  $('pinSave').addEventListener('click',async()=>{
    const pin=$('pinText').value.trim();if(!/^\d{4,8}$/.test(pin)){note('La clave del kiosco debe tener de 4 a 8 números.',true);return;}
    try{await call('PUT',{settings:{pin}});$('pinText').value='';note('Clave del kiosco cambiada. Úsala desde ahora en todas las mesas.');}catch(e){note(e.message,true);}
  });
  return {set(data){menu=data.menu||[];promo=data.restaurant?.promo||'';render();}};
}
