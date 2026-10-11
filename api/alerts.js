import {randomUUID} from 'node:crypto';
import {alertTypes,payMethods,readAlerts,pushAlert} from '../server/alerts.js';
import {endpoint,guard,body,json,rateLimit,liveOrders,getSession,staff,fail} from '../server/http.js';
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
  const pay=payMethods.includes(data.pay)?data.pay:null;const due=Number.isInteger(data.total)&&data.total>=0&&data.total<1000000?data.total:null;
  const alert={id:randomUUID(),table,type:data.type,at:new Date().toISOString(),...(need&&data.type==='waiter'?{need}:{}),...(data.type==='bill'?{pay,total:due}:{})};
  await pushAlert(alert);json(res,200,{alert});
});
