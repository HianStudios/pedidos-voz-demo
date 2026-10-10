import {restaurant} from './catalog.js';
import {redis} from './http.js';
// Avisos de las mesas a caja: modo kiosco activado/desactivado, salida de pantalla completa, app oculta, clave fallida.
export const alertTypes=['kiosk-on','kiosk-off','fullscreen-exit','app-hidden','pin-failed'];
const key=`mesero:${restaurant.id}:alerts`;
export async function readAlerts(){const values=await redis(['LRANGE',key,0,29]);return values.map(v=>JSON.parse(v));}
export async function pushAlert(alert){await redis(['EVAL',"redis.call('LPUSH',KEYS[1],ARGV[1]); redis.call('LTRIM',KEYS[1],0,49); redis.call('EXPIRE',KEYS[1],604800); return 1",1,key,JSON.stringify(alert)]);}
