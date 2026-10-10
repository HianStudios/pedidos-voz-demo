import {restaurant} from './catalog.js';
import {redis} from './http.js';
import {readAlerts} from './alerts.js';
export async function orderSnapshot(){
 const prefix=`mesero:${restaurant.id}`;
 // One atomic read prevents interleaved status changes producing an inconsistent snapshot.
 const script="local ids=redis.call('ZREVRANGE',KEYS[1],0,199); local result={}; for _,id in ipairs(ids) do local value=redis.call('GET',ARGV[1]..id); if value then table.insert(result,value) end end; return result";
 const values=await redis(['EVAL',script,1,`${prefix}:orders`,`${prefix}:order:`]);
 return values.map(v=>JSON.parse(v));
}
// Pedidos y avisos de las mesas en una sola lectura del stream de caja.
export async function feedSnapshot(){
 const [orders,alerts]=await Promise.all([orderSnapshot(),readAlerts()]);return {orders,alerts};
}
export async function streamOrders(res,{snapshot=feedSnapshot,duration=20000,interval=1500}={}){
 res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('Cache-Control','no-store, no-transform');res.setHeader('X-Accel-Buffering','no');res.flushHeaders?.();
 const controller=new AbortController();const abort=()=>controller.abort();res.on('close',abort);
 const deadline=setTimeout(abort,duration);let previous='';
 const send=(event,data)=>{if(!controller.signal.aborted&&!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
 try{
  send('connected',{at:Date.now()});
  while(!controller.signal.aborted){
   const snap=await snapshot();if(controller.signal.aborted)break;
   const data=Array.isArray(snap)?{orders:snap}:snap;
   const payload=JSON.stringify(data);if(payload!==previous){send('orders',{...data,at:Date.now()});previous=payload;}else send('heartbeat',{at:Date.now()});
   await new Promise(resolve=>{if(controller.signal.aborted)return resolve();const finish=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',finish);resolve();};const timer=setTimeout(finish,interval);controller.signal.addEventListener('abort',finish,{once:true});});
  }
 }catch{send('unavailable',{message:'Se perdió la conexión con caja. Reconectando…'});}
 finally{clearTimeout(deadline);res.off('close',abort);if(!res.destroyed)res.end();}
}
