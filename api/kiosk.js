import {createHash,timingSafeEqual} from 'node:crypto';
import {endpoint,guard,body,json,rateLimit,fail} from '../server/http.js';
// Verifica la clave del modo kiosco. La clave vive solo en el servidor (KIOSK_PIN), nunca en el código del cliente.
const digest=s=>createHash('sha256').update(String(s)).digest();
export default endpoint(async(req,res)=>{
  guard(req,['POST']);await rateLimit(req,'kiosk',8);
  const expected=process.env.KIOSK_PIN||'';
  if(expected.length<4)throw fail('El modo kiosco no está configurado (falta KIOSK_PIN).',503);
  const {pin}=await body(req,500);
  if(typeof pin!=='string'||!/^\d{4,12}$/.test(pin))throw fail('Clave inválida.',400);
  if(!timingSafeEqual(digest(pin),digest(expected)))throw fail('Clave incorrecta.',401);
  json(res,200,{ok:true});
});
