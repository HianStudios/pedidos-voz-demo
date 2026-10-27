import {randomUUID} from 'node:crypto';
import {restaurant} from '../server/catalog.js';
import {alertTypes,payMethods,readAlerts,pushAlert} from '../server/alerts.js';
import {endpoint,guard,body,json,rateLimit,liveOrders,getSession,staff,redis,fail} from '../server/http.js';
export default endpoint(async(req,res)=>{
  guard(req,['GET','POST']);
  if(req.method==='GET'){if(!liveOrders())throw fail('Caja compartida no configurada.',503);staff(req);return json(res,200,{alerts:await readAlerts()});}
  await rateLimit(req,'alerts',20);
  const data=await body(req,1000);
  const table=Number(data.table);
  if(!alertTypes.includes(data.type)||!(Number.isInteger(table)&&table>0&&table<1000))throw fail('Aviso inválido.');
  if(!liveOrders())return json(res,200,{demo:true});
  if(!getSession(req))throw fail('La sesión venció. Recarga la página.',401);
  const need=typeof data.need==='string'?data.need.replace(/[^\p{L}\p{N} ,.¿?¡!-]/gu,'').trim().slice(0,60):'';
  const pay=payMethods.includes(data.pay)?data.pay:null;
  // El total se obtiene de los pedidos del servidor; jamás confiar en el importe de la tablet.
  let due=null;
  if(data.type==='bill'){
    const prefix=`mesero:${restaurant.id}`;
    const ids=await redis(['ZREVRANGE',`${prefix}:orders`,0,999]);
    const values=ids.length?await redis(['MGET',...ids.map(id=>`${prefix}:order:${id}`)]):[];
    const cutoff=Date.now()-6*3600000;
    const related=values.filter(Boolean).map(v=>JSON.parse(v)).filter(o=>o.table===table&&o.status!=='cancelado'&&Date.parse(o.createdAt)>=cutoff);
    due=related.length?related.reduce((sum,o)=>sum+o.total,0):null;
  }
  const alert={id:randomUUID(),table,type:data.type,at:new Date().toISOString(),...(need&&data.type==='waiter'?{need}:{}),...(data.type==='bill'?{pay,total:due}:{})};
  await pushAlert(alert);json(res,200,{alert});
});
