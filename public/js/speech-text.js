// Texto para el oído: lo que se ve en pantalla ($5,75 · 400 ml) se dice como lo diría un mesero.
const small=['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
const tens=['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const hundreds=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
function below1000(n){
  if(n<30)return small[n];
  if(n<100)return tens[Math.floor(n/10)]+(n%10?` y ${small[n%10]}`:'');
  if(n===100)return 'cien';
  return hundreds[Math.floor(n/100)]+(n%100?` ${below1000(n%100)}`:'');
}
export function numberWords(n){
  n=Math.floor(Math.abs(n));
  if(n<1000)return below1000(n);
  if(n<1000000){const k=Math.floor(n/1000),rest=n%1000;return (k===1?'mil':`${apocope(below1000(k))} mil`)+(rest?` ${below1000(rest)}`:'');}
  return String(n);
}
// «uno» delante de un sustantivo masculino: un dólar, veintiún dólares.
const apocope=w=>w.replace(/veintiuno$/,'veintiún').replace(/uno$/,'un');
export function moneyWords(cents){
  const dollars=Math.floor(cents/100),rest=cents%100;
  if(!dollars)return `${numberWords(rest)} centavos`;
  const main=dollars===1?'un dólar':`${apocope(numberWords(dollars))} dólares`;
  return rest?`${main} con ${numberWords(rest)}`:main;
}
export function speakable(text){
  return String(text)
    // Formato $5.75 (como lo escribe un modelo) antes que el local $5,75 / $1.500,00.
    .replace(/\$\s?(\d+)\.(\d{2})(?!\d)/g,(_,d,c)=>moneyWords(Number(d)*100+Number(c)))
    .replace(/\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?(?!\d)/g,(_,d,c)=>moneyWords(Number(d.replace(/\./g,''))*100+Number(c||0)))
    .replace(/(\d+)\s?ml\b/gi,(_,n)=>`${numberWords(Number(n))} mililitros`)
    .replace(/(\d+)\s?×/g,(_,n)=>`${numberWords(Number(n))} de`)
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu,'')
    .replace(/[«»"*_#↗↑→←✦•]/g,'')
    .replace(/\s+/g,' ').trim();
}
// Frases cortas: se pronuncian una a una para sonar más natural y sincronizar la pantalla.
export function sentences(text){
  const parts=String(text).split(/(?<=[.!?…])\s+/).map(s=>s.trim()).filter(Boolean);
  const out=[];
  for(const part of parts){if(out.length&&out.at(-1).length<14)out[out.length-1]+=` ${part}`;else out.push(part);}
  return out;
}
export function listWords(items){return items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} y ${items.at(-1)}`;}
