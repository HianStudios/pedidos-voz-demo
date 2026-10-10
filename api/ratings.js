import {restaurant} from '../server/catalog.js';
import {endpoint,guard,body,json,rateLimit,liveOrders,getSession,staff,redis,fail} from '../server/http.js';
// Calificación del servicio al terminar el pedido: una sola vez por pedido, en el registro de calificaciones.
export default endpoint(async(req,res)=>{
  guard(req,['GET','POST']);
  if(req.method==='GET'){
    // Panel de administración: todas las calificaciones de los últimos 30 días (id del pedido → calificación).
    if(!liveOrders())throw fail('Caja compartida no configurada.',503);staff(req);
    const flat=await redis(['HGETALL',`mesero:${restaurant.id}:ratings`]);const ratings={};
    // Upstash (HTTP) responde una lista plana [campo, valor, …]; el cliente redis, un objeto.
    const pairs=Array.isArray(flat)?Array.from({length:flat.length/2},(_,i)=>[flat[2*i],flat[2*i+1]]):Object.entries(flat||{});
    for(const [id,value] of pairs)ratings[id]=JSON.parse(value);
    return json(res,200,{ratings});
  }
  await rateLimit(req,'ratings',20);
  const data=await body(req,2000);const stars=Number(data.stars);
  if(typeof data.id!=='string'||!/^[0-9a-f-]{36}$/.test(data.id)||!(stars>=1&&stars<=5&&Number.isInteger(stars*2)))throw fail('Calificación inválida.');
  if(!liveOrders())return json(res,200,{demo:true});
  if(!getSession(req))throw fail('La sesión venció.',401);
  const prefix=`mesero:${restaurant.id}`;
  const rating=JSON.stringify({stars,comment:String(data.comment||'').slice(0,200),at:new Date().toISOString()});
  // Registro aparte (no se reescribe el pedido): una sola calificación por pedido existente.
  const script="if redis.call('EXISTS',KEYS[1])==0 then return false end; if redis.call('HSETNX',KEYS[2],ARGV[1],ARGV[2])==0 then return 'rated' end; redis.call('EXPIRE',KEYS[2],2592000); return 'ok'";
  const result=await redis(['EVAL',script,2,`${prefix}:order:${data.id}`,`${prefix}:ratings`,data.id,rating]);
  if(!result)throw fail('Pedido no encontrado.',404);if(result==='rated')throw fail('Este pedido ya fue calificado.',409);
  json(res,200,{ok:true});
});
