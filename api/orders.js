import {randomUUID,createHash} from 'node:crypto';
import {restaurant,menu as baseMenu} from '../server/catalog.js';
import {validateCart,total} from '../public/js/domain.js';
import {endpoint,guard,json,body,rateLimit,liveOrders,staff,getSession,redis,fail} from '../server/http.js';
const prefix=`mesero:${restaurant.id}`;
const ownerOf=id=>createHash('sha256').update(id).digest('hex');
export default endpoint(async(req,res)=>{
  guard(req,['GET','POST','PATCH']);
  if(!liveOrders())throw fail('Caja compartida no configurada. Está activo el modo demo.',503);
  await rateLimit(req,'orders',60);
  if(req.method==='GET'){
    // La mesa consulta el estado de sus propios pedidos («¿ya viene mi pedido?»): solo por id, sin datos del personal.
    const own=new URL(req.url||'/','http://x').searchParams.get('ids');
    if(own!==null){
      const sessionId=getSession(req);if(!sessionId)throw fail('La sesión venció. Recarga la página.',401);
      const wanted=own.split(',').filter(id=>/^[0-9a-f-]{36}$/.test(id)).slice(0,10);
      const values=wanted.length?await redis(['MGET',...wanted.map(id=>`${prefix}:order:${id}`)]):[];
      return json(res,200,{orders:values.filter(Boolean).map(v=>JSON.parse(v)).filter(o=>o.owner===ownerOf(sessionId)).map(o=>({id:o.id,number:o.number,status:o.status,total:o.total,createdAt:o.createdAt}))});
    }
    // ?limit=1000 para el panel de administración (los pedidos se guardan 30 días).
    staff(req);const limit=Math.min(1000,Math.max(1,Number(new URL(req.url||'/','http://x').searchParams.get('limit'))||200));
    const ids=await redis(['ZREVRANGE',`${prefix}:orders`,0,limit-1]);
    const values=ids.length?await redis(['MGET',...ids.map(id=>`${prefix}:order:${id}`)]):[];
    return json(res,200,{orders:values.filter(Boolean).map(v=>JSON.parse(v))});
  }
  if(req.method==='PATCH'){
    staff(req);const {id,status}=await body(req);
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id)||!['aceptado','preparando','listo','entregado','cancelado'].includes(status))throw fail('Estado inválido.');
    const script="local raw=redis.call('GET',KEYS[1]); if not raw then return false end; local o=cjson.decode(raw); local transitions={nuevo={aceptado=true,cancelado=true},aceptado={preparando=true,cancelado=true},preparando={listo=true,cancelado=true},listo={entregado=true},entregado={},cancelado={}}; if o.status~=ARGV[1] and not transitions[o.status][ARGV[1]] then return 'invalid' end; o.status=ARGV[1]; local v=cjson.encode(o); redis.call('SET',KEYS[1],v,'KEEPTTL'); return v";
    const result=await redis(['EVAL',script,1,`${prefix}:order:${id}`,status]);
    if(!result)throw fail('Pedido no encontrado.',404);if(result==='invalid')throw fail('Ese cambio de estado no está permitido.',409);
    return json(res,200,{order:JSON.parse(result)});
  }
  const sessionId=getSession(req);if(!sessionId)throw fail('La sesión venció. Recarga antes de enviar.',401);
  const data=await body(req);
  // Sin caché: la validación y el precio usan el menú vigente de Redis.
  const menuRaw=await redis(['GET',`${prefix}:menu`]);
  const menu=menuRaw?JSON.parse(menuRaw):baseMenu;
  // Si caja marcó algo como agotado mientras la mesa pedía, se dice qué y no se envía a medias.
  const gone=(Array.isArray(data.items)?data.items:[]).map(l=>menu.find(p=>p.id===l?.id)).filter(p=>p&&!p.available);
  if(gone.length)throw fail(`Se acabó ${gone.map(p=>p.name).join(' y ')} mientras pedías. Quítalo del pedido o cámbialo por otro.`,409);
  let cart;try{cart=validateCart(data.items,menu);}catch(e){throw fail(e.message);}
  if(!cart.length||data.confirmed!==true)throw fail('Revisa y confirma tu pedido antes de enviarlo.');
  if(typeof data.key!=='string'||!/^[0-9a-f-]{36}$/.test(data.key))throw fail('Identificador de envío inválido.');
  // La mesa la fija quien instala el dispositivo (?mesa=N); no es una ubicación verificada criptográficamente.
  const table=data.table==null?null:Number(data.table);
  if(table!==null&&!(Number.isInteger(table)&&table>0&&table<1000))throw fail('Número de mesa inválido.');
  const customer=String(data.customer||(table?`Mesa ${table}`:'')).trim();if(customer.length<2||customer.length>60)throw fail('Escribe un nombre para retirar el pedido (2–60 caracteres).');
  const payloadHash=createHash('sha256').update(JSON.stringify({cart,customer,table})).digest('hex');
  const order={id:randomUUID(),number:randomUUID().slice(0,6).toUpperCase(),items:cart.map(l=>({...l,name:menu.find(p=>p.id===l.id).name,price:menu.find(p=>p.id===l.id).price})),total:total(cart,menu),customer,...(table?{table}:{}),fulfillment:table?'mesa':'retiro',status:'nuevo',createdAt:new Date().toISOString(),owner:ownerOf(sessionId)};
  const script="local old=redis.call('GET',KEYS[1]); if old then local memo=cjson.decode(old); if memo.hash~=ARGV[4] then return 'conflict' end; return memo.order end; if (redis.call('GET',KEYS[4]) or '')~=ARGV[5] then return 'menu_changed' end; redis.call('SET',KEYS[2],ARGV[1],'EX',2592000); redis.call('ZADD',KEYS[3],ARGV[2],ARGV[3]); redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',tonumber(ARGV[2])-2592000000); redis.call('SET',KEYS[1],cjson.encode({hash=ARGV[4],order=ARGV[1]}),'EX',2592000); return ARGV[1]";
  const saved=await redis(['EVAL',script,4,`${prefix}:idem:${sessionId}:${data.key}`,`${prefix}:order:${order.id}`,`${prefix}:orders`,`${prefix}:menu`,JSON.stringify(order),Date.now(),order.id,payloadHash,menuRaw||'']);
  if(saved==='conflict')throw fail('Este envío ya se usó con otro pedido. Revisa el borrador.',409);
  if(saved==='menu_changed')throw fail('El menú cambió durante el envío. Revisa los precios y vuelve a confirmar.',409);
  json(res,200,{order:JSON.parse(saved)});
});
