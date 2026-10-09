import {createHmac,randomUUID,timingSafeEqual,createHash} from 'node:crypto';
const memoryLimits=new Map();
export function fail(message,status=400){return Object.assign(new Error(message),{status});}
export function json(res,status,data){res.setHeader('Cache-Control','no-store');return res.status(status).json(data);}
export function guard(req,methods){
  if(!methods.includes(req.method)) throw fail('Método no permitido.',405);
  const origin=req.headers.origin;
  // Same-origin fetch y localhost. No confiar en un host proporcionado por el body.
  if(origin){let host;try{host=new URL(origin).host;}catch{throw fail('Origen inválido.',403);}if(host!==req.headers.host) throw fail('Origen no permitido.',403);}
}
export async function body(req,limit=24000){
  if(req.body!==undefined){let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw fail('JSON inválido.');}if(!b||typeof b!=='object')throw fail('JSON inválido.');if(Buffer.byteLength(JSON.stringify(b))>limit)throw fail('Solicitud demasiado grande.',413);return b;}
  const raw=await rawBody(req,limit);try{return JSON.parse(raw.toString());}catch{throw fail('JSON inválido.');}
}
export async function rawBody(req,limit){
  if(Number(req.headers['content-length'])>limit)throw fail('Solicitud demasiado grande.',413);
  if(Buffer.isBuffer(req.body)){if(req.body.length>limit)throw fail('Solicitud demasiado grande.',413);return req.body;}
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail('Solicitud demasiado grande.',413);chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));}return Buffer.concat(chunks);
}
// La integración de Upstash en Vercel crea KV_REST_API_*; una cuenta de Upstash directa, UPSTASH_REDIS_REST_*.
const redisUrl=()=>process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const redisToken=()=>process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
export async function redis(command){
  const response=await fetch(redisUrl(),{method:'POST',headers:{Authorization:`Bearer ${redisToken()}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw fail('No se pudo conectar con caja. Intenta de nuevo.',503);
  const data=await response.json();if(data.error)throw fail('El almacenamiento no está disponible.',503);return data.result;
}
export const hasRedis=()=>Boolean(redisUrl()&&redisToken());
export const liveOrders=()=>hasRedis()&&(process.env.STAFF_TOKEN?.length>=24)&&(process.env.SESSION_SECRET?.length>=32);
export async function rateLimit(req,bucket,max=30){
  const ip=req.headers['x-real-ip']||req.socket?.remoteAddress||'unknown';
  const key=`brasa:rate:${bucket}:${createHash('sha256').update(String(ip)).digest('hex').slice(0,24)}:${Math.floor(Date.now()/60000)}`;
  let count;
  if(hasRedis()) count=await redis(['EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],70) end; return n",1,key]);
  else{const now=Date.now();for(const [k,v] of memoryLimits)if(v.until<now)memoryLimits.delete(k);const v=memoryLimits.get(key)||{count:0,until:now+70000};v.count++;memoryLimits.set(key,v);count=v.count;}
  if(count>max)throw fail('Demasiadas solicitudes. Espera un minuto.',429);
}
const sign=id=>createHmac('sha256',process.env.SESSION_SECRET).update(id).digest('hex');
export function getSession(req){
  if(!liveOrders())return null;
  const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mesero_session='))?.slice(15);
  if(!token)return null;const [id,expiry,sig]=token.split('.');const payload=`${id}.${expiry}`;
  if(!/^[0-9a-f-]{36}$/.test(id||'')||!Number.isFinite(Number(expiry))||Number(expiry)<Date.now()||!/^[0-9a-f]{64}$/.test(sig||''))return null;
  return timingSafeEqual(Buffer.from(sign(payload)),Buffer.from(sig))?id:null;
}
export function session(req,res){
  let id=getSession(req);if(id)return id;id=randomUUID();const payload=`${id}.${Date.now()+2592000000}`;
  const secure=req.headers['x-forwarded-proto']==='https'||process.env.VERCEL;
  res.setHeader('Set-Cookie',`mesero_session=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure?'; Secure':''}`);return id;
}
export function staff(req){
  const expected=process.env.STAFF_TOKEN||'';const provided=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(expected.length<24||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))throw fail('Acceso de caja no autorizado.',401);
}
export function endpoint(fn){return async(req,res)=>{try{await fn(req,res);}catch(e){if(!e.status)console.error('Request failed:',e.name);json(res,e.status||500,{error:e.status?e.message:'Ocurrió un problema. Intenta de nuevo.'});}};}
