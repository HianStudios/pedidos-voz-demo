// Modo kiosco para la tablet de la mesa. Una página web no puede impedir que el sistema salga de pantalla
// completa (Esc, gesto de inicio); por eso: se vuelve a cubrir la pantalla al instante, se avisa a caja y
// solo el personal, con la clave, puede desactivarlo. Para un bloqueo total, usar fijación de pantalla
// (Android) o Acceso Guiado (iPad) además de este modo.
import {storageKey,saveAlert} from './order-store.js';
const key=`${storageKey}-kiosco`;
const $=id=>document.getElementById(id);
export function initKiosk({table,mode,toast}){
  let active=false,pinMode='on',pin='',lastAlert={};
  try{active=localStorage.getItem(key)==='1';}catch{}
  const notify=type=>{
    // Un aviso por tipo cada 30 s: un niño tocando la pantalla no debe llenar la caja de avisos.
    const now=Date.now();if(now-(lastAlert[type]||0)<30000||!table)return;lastAlert[type]=now;
    const alert={id:crypto.randomUUID(),table,type,at:new Date().toISOString()};
    if(mode()==='demo'){saveAlert(alert);return;}
    const data=JSON.stringify({table,type});
    if(type==='app-hidden'&&navigator.sendBeacon)navigator.sendBeacon('/api/alerts',new Blob([data],{type:'text/plain'}));
    else fetch('/api/alerts',{method:'POST',headers:{'Content-Type':'application/json'},body:data,keepalive:true}).catch(()=>{});
  };
  const full=()=>document.fullscreenElement||document.webkitFullscreenElement;
  const enterFull=()=>{const el=document.documentElement;(el.requestFullscreen?.({navigationUI:'hide'})||el.webkitRequestFullscreen?.())?.catch?.(()=>{});};
  function cover(show){$('kioskCover').hidden=!show;}
  function apply(){
    document.body.classList.toggle('kiosk',active);
    if(active){if(!full())cover(true);history.pushState({kiosk:1},'');}else cover(false);
  }
  // Teclado numérico del personal.
  function openPad(kind){pinMode=kind;pin='';render();$('pinTitle').textContent=kind==='on'?'Activar modo kiosco':'Salir del modo kiosco';$('pinError').textContent='';$('pinPad').showModal();}
  function render(){$('pinDots').textContent='●'.repeat(pin.length)||'—';}
  async function submit(){
    if(pin.length<4){$('pinError').textContent='La clave tiene al menos 4 dígitos.';return;}
    $('pinError').textContent='Verificando…';
    try{
      const res=await fetch('/api/kiosk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok){pin='';render();$('pinError').textContent=data.error||'Clave incorrecta.';$('pinPad').classList.remove('shake');void $('pinPad').offsetWidth;$('pinPad').classList.add('shake');if(res.status===401)notify('pin-failed');return;}
      $('pinPad').close();
      if(pinMode==='on'){active=true;try{localStorage.setItem(key,'1');}catch{}enterFull();notify('kiosk-on');toast('Modo kiosco activado');}
      else{active=false;try{localStorage.removeItem(key);}catch{}if(full())(document.exitFullscreen||document.webkitExitFullscreen)?.call(document);notify('kiosk-off');toast('Modo kiosco desactivado');}
      apply();
    }catch{$('pinError').textContent='Sin conexión. Intenta de nuevo.';}
  }
  $('pinPad').addEventListener('click',e=>{
    const b=e.target.closest('[data-key]');if(!b)return;const k=b.dataset.key;
    if(k==='del')pin=pin.slice(0,-1);else if(k==='cancel'){$('pinPad').close();return;}else if(k==='ok'){submit();return;}else if(pin.length<12)pin+=k;
    render();
  });
  // Esquina del personal: mantener presionado 3 s (no visible para el cliente).
  // Se detecta por posición (72×72 px arriba a la derecha) para que funcione aunque haya un menú abierto:
  // una ventana modal vuelve inerte al resto de la página.
  let hold=0,start=null;
  const inCorner=e=>e.clientX>=innerWidth-72&&e.clientY<=72;
  addEventListener('pointerdown',e=>{if(!inCorner(e)||$('pinPad').open)return;start={x:e.clientX,y:e.clientY};clearTimeout(hold);hold=setTimeout(()=>{start=null;openPad(active?'off':'on');},3000);},true);
  addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>24){clearTimeout(hold);start=null;}},true);
  for(const ev of ['pointerup','pointercancel'])addEventListener(ev,()=>{clearTimeout(hold);start=null;},true);
  $('staffCorner').addEventListener('contextmenu',e=>e.preventDefault());
  // Con el kiosco activo: tocar la cubierta vuelve a pantalla completa (el cliente puede seguir pidiendo).
  $('kioskCover').addEventListener('click',()=>{enterFull();cover(false);});
  const onFull=()=>{if(!active)return;if(!full()){cover(true);notify('fullscreen-exit');}else cover(false);};
  document.addEventListener('fullscreenchange',onFull);document.addEventListener('webkitfullscreenchange',onFull);
  document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)notify('app-hidden');});
  // Atrás, menú contextual, selección y zoom no sacan al cliente de la app.
  addEventListener('popstate',()=>{if(active)history.pushState({kiosk:1},'');});
  for(const ev of ['contextmenu','selectstart','gesturestart'])document.addEventListener(ev,e=>{if(active)e.preventDefault();});
  addEventListener('beforeunload',e=>{if(active){e.preventDefault();e.returnValue='';}});
  apply();
  return {get active(){return active;}};
}
