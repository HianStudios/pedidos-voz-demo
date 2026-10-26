import {restaurant} from '../server/catalog.js';
import {neuralVoice} from './speak.js';
import {getState,publicSettings,saveMenu,setAvailable,resetMenu,saveSettings} from '../server/menu-store.js';
import {endpoint,guard,json,body,liveOrders,session,rateLimit,staff,fail} from '../server/http.js';
// GET: menú vigente para la mesa, caja y panel. PATCH (caja): agotado o disponible. PUT (panel): menú completo,
// promoción del día, clave del kiosco o volver al menú original.
export default endpoint(async(req,res)=>{
  guard(req,['GET','PATCH','PUT']);
  if(req.method==='GET'){
    await rateLimit(req,'menu',90);if(liveOrders())session(req,res);
    const {menu,settings}=await getState();const promo=publicSettings(settings).promo;
    // Con promoción del día, Milo la menciona al saludar.
    const greeting=promo?restaurant.greeting.replace('¿Qué se te antoja hoy?',`Hoy tenemos ${promo.replace(/[.!]+$/,'')}. ¿Qué se te antoja?`):restaurant.greeting;
    return json(res,200,{restaurant:{...restaurant,greeting,promo},menu,mode:liveOrders()?'live':'demo',editable:liveOrders(),aiAvailable:Boolean(process.env.GROQ_API_KEY),voice:neuralVoice()?'neural':'browser'});
  }
  await rateLimit(req,'menu-edit',60);staff(req);
  const data=await body(req,200000);
  if(req.method==='PATCH'){
    if(typeof data.id!=='string'||typeof data.available!=='boolean')throw fail('Cambio inválido.');
    return json(res,200,{menu:await setAvailable(data.id,data.available)});
  }
  if(data.reset===true)return json(res,200,{menu:await resetMenu()});
  const out={};
  if(data.settings)out.settings=publicSettings(await saveSettings(data.settings));
  if(data.menu)out.menu=await saveMenu(data.menu);
  if(!out.menu&&!out.settings)throw fail('Nada que guardar.');
  json(res,200,out);
});
