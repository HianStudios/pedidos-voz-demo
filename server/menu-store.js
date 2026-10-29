// Menú editable por el dueño (panel) y agotados (caja). Se guarda en Redis; sin nada guardado o sin Redis
// se usa el menú de server/catalog.js. Todo lo que entiende pedidos lee de aquí, así un plato nuevo o un
// precio cambiado vale enseguida para Milo, la factura y la caja.
import {createHash} from 'node:crypto';
import {menu as baseMenu,restaurant} from './catalog.js';
import {redis,hasRedis,fail} from './http.js';

const prefix=`mesero:${restaurant.id}`;
const keys={menu:`${prefix}:menu`,settings:`${prefix}:settings`};
export const editableCategories=['Platos','Combos','Extras','Bebidas'];
const categories=[...editableCategories,'Mesa'];
let cache=null;
const fresh=()=>cache&&Date.now()-cache.at<4000;

export async function getState(){
  if(fresh())return cache.value;
  let menu=baseMenu,settings={};
  if(hasRedis()){
    try{
      const [m,s]=await Promise.all([redis(['GET',keys.menu]),redis(['GET',keys.settings])]);
      if(m)menu=JSON.parse(m);if(s)settings=JSON.parse(s);
    }catch{throw fail('No se pudo consultar el menú compartido. Intenta de nuevo.',503);}
  }
  const value={menu,settings};cache={at:Date.now(),value};return value;
}
export const getMenu=async()=>(await getState()).menu;
// Lo que el cliente puede ver de la configuración (nunca la clave del kiosco).
export const publicSettings=s=>({promo:s.promo||'',tables:s.tables||0});

const text=(v,max)=>typeof v==='string'?v.replace(/[<>]/g,'').replace(/\s+/g,' ').trim().slice(0,max):'';
const list=(v,max,len=60)=>(Array.isArray(v)?v:typeof v==='string'?v.split(','):[]).map(x=>text(x,len)).filter(Boolean).slice(0,max);
const slug=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
const article=a=>['un','una','unos','unas'].includes(a)?a:'un';

// Producto que llega del panel → producto del catálogo, con lo que Milo necesita para entenderlo y decirlo.
export function cleanProduct(raw,old={}){
  const name=text(raw.name,40);if(!name)throw fail('Cada producto necesita un nombre.');
  const category=categories.includes(raw.category)?raw.category:null;if(!category)throw fail(`Categoría inválida en «${name}».`);
  const price=Math.round(Number(raw.price));
  if(!Number.isInteger(price)||price<0||price>100000)throw fail(`Precio inválido en «${name}».`);
  const id=old.id||slug(raw.id||name);if(!/^[a-z0-9-]{2,40}$/.test(id))throw fail(`Nombre inválido: «${name}».`);
  const lower=name.charAt(0).toLowerCase()+name.slice(1);
  const art=article(raw.article||(old.one||'').split(' ')[0]);
  const many=text(raw.many,50)||old.many||(/[aeiou]$/i.test(lower)?`${lower}s`:`${lower}es`);
  const ingredients=list(raw.ingredients,10);
  // Lo que se puede quitar: «sin cebolla», «sin ají». Se escribe sin el «sin».
  const options=list(raw.remove,10,30).map(o=>`sin ${o.replace(/^sin\s+/i,'').toLowerCase()}`);
  const aliases=[...new Set([name.toLowerCase(),...list(raw.aliases,12,40).map(a=>a.toLowerCase())])];
  const product={...old,id,name,category,price,available:raw.available!==false,
    one:`${art} ${['Bebidas'].includes(category)?name:lower}`,many,desc:text(raw.desc,160)||old.desc||'',
    ingredients:ingredients.length?ingredients:old.ingredients||[],options,aliases,
    tag:text(raw.tag,30)||undefined,feel:['ligero','contundente'].includes(raw.feel)?raw.feel:undefined,emoji:text(raw.emoji,4)||old.emoji||'🍗'};
  if(category==='Bebidas')product.serve=['en botella','con hielo','sin hielo'];else delete product.serve;
  // Si cambió el nombre, la frase corta que usaba el menú base ya no vale.
  if(old.name&&old.name!==name)delete product.pitch;
  return product;
}
export async function saveMenu(products){
  if(!hasRedis())throw fail('Para editar el menú hace falta la caja compartida (Redis).',503);
  if(!Array.isArray(products)||!products.length||products.length>80)throw fail('Menú inválido.');
  const {menu}=await getState();
  const next=products.map(raw=>cleanProduct(raw,menu.find(p=>p.id===raw.id)||{}));
  const ids=new Set();for(const p of next){if(ids.has(p.id))throw fail(`Hay dos productos llamados «${p.name}».`);ids.add(p.id);}
  // Lo de la mesa (vasos, servilletas) no se edita aquí y siempre se conserva.
  const mesa=menu.filter(p=>p.category==='Mesa'&&!ids.has(p.id));
  const value=[...next.filter(p=>p.category!=='Mesa'),...mesa];
  await redis(['SET',keys.menu,JSON.stringify(value)]);cache=null;return value;
}
export async function setAvailable(id,available){
  if(!hasRedis())throw fail('Para marcar agotados hace falta la caja compartida (Redis).',503);
  const {menu}=await getState();
  if(!menu.some(p=>p.id===id))throw fail('Ese producto no existe.',404);
  const value=menu.map(p=>p.id===id?{...p,available:Boolean(available)}:p);
  await redis(['SET',keys.menu,JSON.stringify(value)]);cache=null;return value;
}
export async function resetMenu(){if(hasRedis())await redis(['DEL',keys.menu]);cache=null;return baseMenu;}
export const pinDigest=pin=>createHash('sha256').update(`kiosk:${pin}`).digest('hex');
export async function saveSettings({promo,pin,tables}){
  if(!hasRedis())throw fail('Para guardar la configuración hace falta la caja compartida (Redis).',503);
  const {settings}=await getState();const next={...settings};
  if(promo!==undefined)next.promo=text(promo,140);
  if(pin!==undefined){if(!/^\d{4,8}$/.test(String(pin)))throw fail('La clave del kiosco debe tener de 4 a 8 números.');next.kioskPin=pinDigest(pin);}
  if(tables!==undefined){const n=parseInt(tables,10);if(isNaN(n)||n<0||n>100)throw fail('El número de mesas debe ser entre 0 y 100.');next.tables=n;}
  await redis(['SET',keys.settings,JSON.stringify(next)]);cache=null;return next;
}
