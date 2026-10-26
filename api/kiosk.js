import {createHash,timingSafeEqual} from 'node:crypto';
import {endpoint,guard,body,json,rateLimit,fail} from '../server/http.js';
import {getState,pinDigest} from '../server/menu-store.js';
// Verifica la clave del modo kiosco. La clave vive solo en el servidor (KIOSK_PIN), nunca en el código del cliente.
const digest=s=>createHash('sha256').update(String(s)).digest();
export default endpoint(async(req,res)=>{
  guard(req,['POST']);await rateLimit(req,'kiosk',8);
  // La clave cambiada desde el panel manda sobre la de Vercel (KIOSK_PIN); solo se guarda su huella.
  const saved=(await getState()).settings.kioskPin;
  const expected=process.env.KIOSK_PIN||'';
  if(!saved&&expected.length<4)throw fail('El modo kiosco no está configurado (falta KIOSK_PIN).',503);
  const {pin}=await body(req,500);
  if(typeof pin!=='string'||!/^\d{4,12}$/.test(pin))throw fail('Clave inválida.',400);
  const ok=saved?timingSafeEqual(Buffer.from(pinDigest(pin)),Buffer.from(saved)):timingSafeEqual(digest(pin),digest(expected));
  if(!ok)throw fail('Clave incorrecta.',401);
  json(res,200,{ok:true});
});
