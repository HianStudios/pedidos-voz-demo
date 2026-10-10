// Palabras que el micrófono escucha casi bien («piatos», «conbos», «pechuca»): si se parecen a una
// sola palabra del menú, se corrigen antes de interpretar. Nunca se tocan números ni palabras comunes.
const base=['platos','plato','combos','combo','bebidas','bebida','extras','extra','gaseosa','gaseosas','refresco','refrescos','menu','carta',
  'muestrame','ensename','quiero','dame','ponme','traeme','agrega','agregame','quita','quitale','cambia','recomienda','recomiendas',
  'pollo','cuarto','cuartos','medio','entero','enteros','alitas','pechuga','pechugas','plancha','personal','pareja','familiar','familiares',
  'papas','doradas','arroz','ensalada','sprite','pepsi','coca','cola','agua','mineral','cebolla','tomate'];
// Palabras reales y frecuentes que se parecen a las del menú pero significan otra cosa.
const keep=new Set(['uno','una','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','cuanto','cuantos','cuantas','cuesta','cuestan',
  'para','pero','como','todo','toda','nada','algo','solo','sola','mejor','puedo','tengo','tiene','tienen','ahora','luego','bueno','buena','claro','gracias','favor',
  'plata','cosa','cosas','casa','mesa','mesas','media','medios','medias','modo','mismo','misma','quien','queso','quiere','quieres','dime','dale','pues','entonces',
  'cerrar','cierra','cerramos','listo','lista','ligero','pesado','hambre','llenar','llenarme','pato','gato','colas','copa','pala','sala','salsa','sopa','papa']);
function distance(a,b){
  if(Math.abs(a.length-b.length)>2)return 3;
  const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1); // letras invertidas
  }
  return d[a.length][b.length];
}
const cache=new Map();
function vocabulary(menu){
  const key=menu?menu.length:0;if(cache.has(key))return cache.get(key);
  const words=new Set(base);
  for(const p of menu||[])for(const phrase of [p.name,...(p.aliases||[])])for(const w of phrase.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^a-z]+/))if(w.length>=4)words.add(w);
  const list=[...words];cache.set(key,list);return list;
}
// Recibe texto ya normalizado (minúsculas, sin tildes ni signos).
export function fixWords(normalized,menu){
  const vocab=vocabulary(menu);const known=new Set(vocab);
  return normalized.split(' ').map(word=>{
    if(word.length<5||known.has(word)||keep.has(word)||/\d/.test(word))return word;
    const limit=word.length>=8?2:1;let best=null,bestDistance=limit+1,tie=false;
    // Empate: gana la del mismo largo («alitaz» → alitas, no alita); si sigue empatado, no se toca.
    const rank=c=>[distance(word,c),c.length===word.length?0:1];
    for(const candidate of vocab){const [d,len]=rank(candidate);if(d>limit)continue;
      if(!best||d<bestDistance||(d===bestDistance&&len<rank(best)[1])){best=candidate;bestDistance=d;tie=false;}
      else if(d===bestDistance&&len===rank(best)[1]&&candidate!==best)tie=true;}
    return best&&!tie?best:word;
  }).join(' ');
}
