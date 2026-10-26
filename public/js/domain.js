import {navigation} from './conversation.js';
import {numberWords,listWords} from './speech-text.js';
import {fixWords} from './fuzzy.js';
export const normalize = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
export const money = cents => new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(cents/100);
export function validateCart(cart, menu) {
  if(!Array.isArray(cart) || cart.length>30) throw new Error('Pedido inválido.');
  // Un mismo plato puede ir en varias líneas si cambia la preparación: «dos cuartos, uno sin cebolla».
  const seen = new Set();
  return cart.map(line=>{
    const item=menu.find(p=>p.id===line.id);
    if(!item || !item.available || !Number.isInteger(line.qty) || line.qty<1 || line.qty>20) throw new Error('Producto o cantidad inválida.');
    const notes=line.notes??[];
    if(!Array.isArray(notes) || notes.length>6 || notes.some(n=>!allowedNotes(item).includes(n))) throw new Error('Opción inválida.');
    const clean={id:item.id,qty:line.qty,notes:[...new Set(notes)]};
    if(seen.has(lineKey(clean))) throw new Error('Producto repetido.');
    seen.add(lineKey(clean));
    return clean;
  });
}
export const lineKey=l=>`${l.id}|${[...l.notes].sort().join(',')}`;
// Líneas que quedaron con la misma preparación se juntan («uno sin cebolla» + «otro sin cebolla» = dos sin cebolla).
function merge(lines){
  const out=[];
  for(const l of lines){const same=out.find(o=>lineKey(o)===lineKey(l));if(same)same.qty+=l.qty;else out.push(l);}
  return out;
}
export const total = (cart,menu)=>cart.reduce((sum,l)=>sum+menu.find(p=>p.id===l.id).price*l.qty,0);
export function applyOperations(cart, ops, menu) {
  const next=structuredClone(validateCart(cart,menu));
  if(!Array.isArray(ops)||ops.length>20) throw new Error('Cambios inválidos.');
  for(const op of ops){
    const product=menu.find(p=>p.id===op.id && p.available);
    if(!product) throw new Error('Producto no disponible.');
    let line=next.find(l=>l.id===op.id);
    const lines=next.filter(l=>l.id===op.id);
    if(op.type==='note'){
      if(!line || !allowedNotes(product).includes(op.note)) throw new Error('Ese cambio no está disponible para este producto.');
      // Una sola forma de servir: «sin hielo» reemplaza a «con hielo». La nota vale para todas sus líneas.
      for(const l of lines){const kept=product.serve?.includes(op.note)?l.notes.filter(n=>!product.serve.includes(n)):l.notes;l.notes=[...new Set([...kept,op.note])];}
      continue;
    }
    // Volver a poner un ingrediente («con cebolla, mejor»): se retira la nota.
    if(op.type==='unnote'){
      if(!line) throw new Error('Ese producto no está en tu pedido.');
      for(const l of lines)l.notes=l.notes.filter(n=>n!==op.note); continue;
    }
    // Separar preparaciones: de los iguales, «qty» van con estas notas («uno sin cebolla»).
    if(op.type==='split'){
      const notes=Array.isArray(op.notes)?op.notes:[];
      if(!notes.length||notes.some(n=>!allowedNotes(product).includes(n))) throw new Error('Ese cambio no está disponible para este producto.');
      if(!Number.isInteger(op.qty)||op.qty<1) throw new Error('Cantidad inválida.');
      const from=[...lines].sort((a,b)=>a.notes.length-b.notes.length).find(l=>l.qty>=op.qty);
      if(!from) throw new Error('No hay tantos en tu pedido para separar.');
      from.qty-=op.qty;next.push({id:op.id,qty:op.qty,notes:[...new Set([...from.notes,...notes])]});
      continue;
    }
    if(!['add','set','remove'].includes(op.type) || !Number.isInteger(op.qty)||op.qty<0||op.qty>20 || (op.type==='add'&&op.qty===0)) throw new Error('Cantidad inválida.');
    if(!line){if(op.type!=='add') throw new Error('Ese producto no está en tu pedido.');line={id:op.id,qty:0,notes:[]}; next.push(line);}
    line.qty=op.type==='set'?op.qty:op.type==='remove'?Math.max(0,line.qty-op.qty):line.qty+op.qty;
  }
  return validateCart(merge(next.filter(l=>l.qty>0)),menu);
}
export function validateResult(result,cart,menu){
  const intents=['edit','menu','recommend','price','detail','review','clarify','keep','goodbye','cancel'];
  if(!result||!intents.includes(result.intent)||typeof result.reply!=='string'||result.reply.length>600) throw new Error('Respuesta inválida.');
  const operations=result.operations??[];
  if(result.intent!=='edit'&&operations.length) throw new Error('Acciones inesperadas.');
  if(result.intent==='edit'&&!operations.length) throw new Error('Faltan cambios.');
  applyOperations(cart,operations,menu);
  const ids=result.suggest_ids??[];
  if(!Array.isArray(ids)||ids.length>10||ids.some(id=>!menu.some(p=>p.id===id&&p.available))) throw new Error('Sugerencias inválidas.');
  const category=['all','Platos','Combos','Extras','Bebidas'].includes(result.category)?result.category:null;
  // Propuesta de una recomendación: no cambia el pedido; la app la aplica solo si el cliente dice «sí».
  let proposal=null;
  if(result.intent==='recommend'&&Array.isArray(result.proposal)&&result.proposal.length){
    try{if(result.proposal.every(o=>o?.type==='add')){applyOperations(cart,result.proposal,menu);proposal=result.proposal.map(o=>({type:'add',id:o.id,qty:o.qty}));}}catch{}
  }
  return {intent:result.intent,reply:result.reply,operations,suggest_ids:ids,...(typeof result.awaiting==='string'&&result.awaiting.trim()?{awaiting:result.awaiting.slice(0,600)}:result.awaiting===null?{awaiting:null}:{}),...(category?{category}:{}),...(proposal?{proposal}:{})};
}
// Notas válidas de un producto: ingredientes que se quitan («sin cebolla») y cómo se sirve una bebida.
export const allowedNotes=p=>[...(p?.options||[]),...(p?.serve||[])];
// Cómo quiere la bebida, solo si lo dice: «en botella», «con hielo», «sin hielo». Milo no lo pregunta.
export function serveFor(text){
  const n=normalize(text);
  if(/\b(sin hielo|sin hielito|sin hielos|al clima|sin frio)\b/.test(n))return 'sin hielo';
  if(/\b(con hielo|con hielito|con hielos|hielo|hielito)\b/.test(n))return 'con hielo';
  if(/\b(botella|botellita)\b/.test(n))return 'en botella';
  return null;
}
// Nombre con tildes de un ingrediente normalizado («aji» → «ají»), tomado de las opciones del catálogo.
export function ingredientName(word,menu){
  for(const p of menu)for(const o of p.options||[])if(normalize(o)===`sin ${word}`)return o.replace(/^sin /,'');
  return word;
}
// Quitar algo que el producto no trae («combo pechuga sin ají»): se avisa claro que va tal cual.
// Devuelve [{id, ingredient}] según el producto nombrado más cerca antes de cada «sin X».
export function unavailableRemovals(text,menu){
  const n=soundsLike(text,menu);
  const removable=[...new Set(menu.flatMap(p=>(p.options||[]).map(o=>normalize(o).replace(/^sin /,''))))].sort((a,b)=>b.length-a.length);
  if(!removable.length)return [];
  const asks=[...n.matchAll(new RegExp(`\\b(?:sin|quitale|quitales|sacale|sacales|cero|no le pongas|que no tenga|que no traiga|que no lleve)\\s+(?:nada de |el |la |los |las )*(${removable.join('|')})\\b`,'g'))];
  const aliases=menu.filter(p=>p.category!=='Mesa').flatMap(p=>[p.name,...(p.aliases||[])].map(a=>({id:p.id,a:normalize(a)}))).sort((x,y)=>y.a.length-x.a.length);
  const out=[];
  for(const m of asks){
    const before=n.slice(0,m.index);let best=null;
    for(const {id,a} of aliases){const i=before.lastIndexOf(a);if(i>=0&&(!best||i+a.length>best.end||(i+a.length===best.end&&a.length>best.len)))best={id,end:i+a.length,len:a.length};}
    const p=best&&menu.find(x=>x.id===best.id);
    if(p&&!(p.options||[]).some(o=>normalize(o)===`sin ${m[1]}`))out.push({id:p.id,ingredient:ingredientName(m[1],menu)});
  }
  return out;
}
// Con la ficha de un producto abierta: qué ingredientes quitar («sin cebolla», «quítale el ají») o volver a
// poner («ponle cebolla», «con tomate»). Devuelve las opciones exactas del producto.
export function removalsFor(text,product){
  const n=normalize(text),pick=word=>product.options.find(o=>normalize(o)===`sin ${word}`);
  const words=product.options.map(o=>normalize(o).replace(/^sin /,'')).sort((a,b)=>b.length-a.length);
  if(!words.length)return {remove:[],restore:[]};
  const alt=words.join('|');
  const remove=[...n.matchAll(new RegExp(`\\b(?:sin|quitale|quitele|sacale|no le pongas|que no tenga|que no traiga|que no lleve|no quiero|nada de|tampoco)\\s+(?:el |la |los |las )?(${alt})((?:\\s+(?:y|ni)?\\s*(?:el |la |los |las )?(?:${alt}))*)`,'g'))]
    .flatMap(m=>[m[1],...(m[2].match(new RegExp(alt,'g'))||[])]);
  const restore=[...n.matchAll(new RegExp(`\\b(?:con|ponle|ponme|si con|que si tenga|dejale|deja)\\s+(?:el |la |los |las )?(${alt})\\b`,'g'))].map(m=>m[1]).filter(w=>!remove.includes(w));
  return {remove:[...new Set(remove.map(pick).filter(Boolean))],restore:[...new Set(restore.map(pick).filter(Boolean))]};
}
// Calificación hablada: «cuatro estrellas», «cuatro y media», «4.5», «excelente», «más o menos».
export function parseRating(text){
  const n=normalize(text).replace(/\bun(?:a)? (?=(?:dos|tres|cuatro|cinco|[1-5])\b)/,'').replace(/\bestrellitas?\b/,'estrellas');
  if(/\b(no se|ahora no|despues|luego|no gracias|paso)\b/.test(n))return null;
  const half=/\by (media|medio)\b|\bpunto cinco\b|\bcon cinco\b/.test(n)?.5:0;
  const decimal=String(text).match(/\b([1-4])[.,]5\b/);if(decimal)return Number(decimal[1])+.5;
  const digits=n.match(/\b([1-5])\b/);
  if(digits)return Math.min(5,Number(digits[1])+half);
  const word=n.match(/\b(una|uno|un|dos|tres|cuatro|cinco)\b/);
  if(word&&(/\b(estrellas?|puntos?|de cinco|sobre cinco|te doy|le doy|le pongo|te pongo)\b/.test(n)||half||n.split(' ').length<=2))return Math.min(5,count(word[1])+half);
  if(/\b(pesimo|horrible|terrible|muy mal|malisimo|fatal)\b/.test(n))return 1;
  if(/\b(excelente|perfecto|buenisimo|increible|muy bien|muy bueno|lo maximo|espectacular|super|chevere|bacan|me encanto|genial)\b/.test(n))return 5;
  if(/\b(regular|mas o menos|normal|ahi nomas|masomenos)\b/.test(n))return 3;
  if(/\b(mal|malo|mala|lento|demorado|no me gusto)\b/.test(n))return 2;
  if(/\b(bien|bueno|buena|rico|me gusto)\b/.test(n))return 4;
  return null;
}
// Corrige diferencias de forma frecuentes en la salida del modelo antes de la validación estricta.
// Nunca crea ediciones: si la intención no es «edit», se descartan las operaciones.
const intentAlias={confirm:'review',confirmar:'review',confirmation:'review',confirmation_answer:'review',send:'review',submit:'review',finalize:'review',finish:'review',checkout:'review',summary:'review',browse:'menu',show:'menu',question:'clarify',answer:'clarify',info:'price',pause:'keep',wait:'keep',cancel_request:'cancel',greeting:'clarify',chat:'clarify',handoff:'clarify'};
export function repairResult(raw,menu){
  const r=raw&&typeof raw==='object'?raw:{};
  let intent=String(r.intent||'').toLowerCase().trim();intent=intentAlias[intent]||intent;
  if(!['edit','menu','recommend','price','detail','review','clarify','keep','goodbye','cancel'].includes(intent))intent='clarify';
  const reply=typeof r.reply==='string'?r.reply.trim().slice(0,600):'';
  let operations=[];
  if(intent==='edit'&&Array.isArray(r.operations))operations=r.operations.filter(o=>o&&typeof o==='object').map(o=>{
    const type=String(o.type??o.op??o.action??'').toLowerCase().trim();const id=o.id??o.product_id??o.productId;
    if(type==='note'||type==='unnote')return {type,id,note:String(o.note??o.option??'').toLowerCase().trim()};
    if(type==='split')return {type,id,qty:Number(o.qty??1),notes:(Array.isArray(o.notes)?o.notes:[o.note]).filter(Boolean).map(x=>String(x).toLowerCase().trim())};
    return {type,id,qty:Number(o.qty??o.quantity??(type==='add'?1:NaN))};
  });
  if(intent==='edit'&&!operations.length)intent='clarify';
  const suggest_ids=(Array.isArray(r.suggest_ids)?r.suggest_ids:[]).filter(id=>menu.some(p=>p.id===id&&p.available)).slice(0,10);
  const proposal=intent==='recommend'&&Array.isArray(r.proposal)?r.proposal.filter(o=>o&&typeof o==='object').map(o=>({type:'add',id:o.id??o.product_id,qty:Number(o.qty??o.quantity??1)})):null;
  return {intent,reply,operations,suggest_ids,...(typeof r.awaiting==='string'&&r.awaiting.trim()?{awaiting:r.awaiting.slice(0,600)}:['edit','keep','cancel'].includes(intent)?{awaiting:null}:{}),...(r.category?{category:r.category}:{}),...(proposal?.length?{proposal}:{})};
}
const numbers={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12};
// Respuesta a «¿Para cuántos es?»: «cinco», «para cinco», «somos 5 personas», «solo yo».
// Sin pregunta pendiente solo se acepta si es inequívoca («somos cinco», «para cinco personas»).
export function parsePeople(text,asked=false){
  const n=normalize(text).replace(/^(?:(?:si|ya|bueno|eh|este|mira)\s+)+/,'');
  if(/^(?:(?:es |seria |solo |solamente )?para mi(?: solo| sola| solito| solita)?|solo (?:para )?mi|solo yo|yo solo|yo sola|nada mas (?:yo|para mi)|uno solo|una sola|(?:solo |para )?una (?:sola )?persona|(?:es )?para uno)$/.test(n))return 1;
  const m=n.match(/^(?:(somos|seriamos|vamos a ser|es para|seria para|para|pa|son|como|unas|unos|mas o menos)\s+)?(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(\s+(?:personas?|adultos?|gente))?(?:\s+(?:nomas|no mas|pues|personas?))?$/);
  if(!m||!(asked||['somos','seriamos','vamos a ser','son'].includes(m[1])||m[3]))return null;
  const value=count(m[2]);return Number.isInteger(value)&&value>0?value:null;
}
// Propuesta por número de personas; no agrega nada hasta que el cliente acepte.
export function suggestForPeople(people,menu){
  if(people>20)return null;
  const qty={'combo-familiar':Math.floor(people/4)},rest=people%4;
  if(rest===1)qty['combo-personal']=1;if(rest===2)qty['combo-pareja']=1;if(rest===3){qty['combo-pareja']=1;qty['combo-personal']=1;}
  const operations=Object.entries(qty).filter(([id,q])=>q>0&&menu.some(p=>p.id===id&&p.available)).map(([id,q])=>({type:'add',id,qty:q}));
  if(!operations.length)return null;
  const items=operations.map(o=>amount(menu.find(p=>p.id===o.id),o.qty));
  const units=operations.reduce((s,o)=>s+o.qty,0);
  return {operations,reply:`Para ${people===1?'ti':numberWords(people)}, te sugiero ${listWords(items)}. ¿${units>1?'Te los anoto':'Te lo anoto'}?`};
}
const count=s=>numbers[s]??Number(s);
// Aceptación completa («sí», «ya, envíalo», «finaliza el pedido»). Nunca enviada por sí sola:
// la app solo envía si además hay un resumen vigente; si no, muestra el resumen.
const yes='(?:si|ya|listo|dale|ok|okey|perfecto|correcto|de una|claro|claro que si|esta bien|asi esta bien|todo bien|exacto|obvio|sale|va|vale|fresco|chevere|bacan|hagale|por supuesto|de ley)';
const act='(?:confirm(?:a|o|ar|alo)|envia(?:lo|r)?|enviamelo|manda(?:lo|r)?|finaliz(?:a|ar|amos|alo)|cierr(?:a|alo)|cerrar|cerramos|procede|hazlo)(?: (?:el |la |mi )?(?:pedido|orden))?';
const confirmRe=new RegExp(`^(?:${yes}(?: ${yes})*(?: ${act})?|${act})(?: por favor)?$`);
export function isConfirmation(text){return confirmRe.test(normalize(text).replace(/^si si\b/,'si'));}
// Frases con las que la gente cierra un pedido sin decir «envíalo»: «gracias», «eso es todo»,
// «así está bien», «mándalo a la cocina», «ya pueden prepararlo»… Con el resumen a la vista
// envían; sin él, abren el resumen. «No, gracias» queda fuera: ahí el cliente está frenando.
const lead='(?:(?:si|ya|bueno|ok|okey|eh|este|entonces|listo|ahora|perfecto|dale|vale|claro|no|gracias|muchas gracias|eso|mismo|pues|bacan|chevere|simon|sale|va|fresco) )*';
const tail='(?: (?:gracias|muchas gracias|mil gracias|por favor|porfa|nomas|no mas|amigo|amiga|milo|mijo|pana|ve|pues|ya|a (?:la )?cocina|de una|por fa))*';
const done=[
  'gracias','muchas gracias','mil gracias','muy amable','gracias muy amable',
  'eso es todo','eso seria todo','seria todo','es todo','eso nomas','eso no mas','eso nada mas','eso eso','eso','eso es',
  'nada mas','nada mas por ahora','por ahora nada mas','por ahora eso','por ahora es todo','ya no','ya no mas','ya nada','ya nada mas',
  '(?:ya )?no quiero nada mas','(?:ya )?no deseo nada mas','(?:ya )?no necesito nada mas','no gracias eso es todo',
  'ya esta','ya estaria','ya estamos','ya estuvo','ya quedo','ya queda','asi esta bien','asi esta perfecto','asi nomas','asi no mas','asi queda','asi dejalo','dejalo asi','asi',
  'con eso','con eso basta','con eso estamos','con eso esta bien','con eso es suficiente','con eso nomas','suficiente','es suficiente','estamos','estamos bien','todo bien','todo listo','todo perfecto','esta todo bien','esta perfecto','esta bien',
  '(?:ya )?termine(?: (?:de pedir|mi pedido))?','he terminado','ya pedi','ya pedimos','eso pedimos','eso pido','eso quiero','eso queremos',
  'listo','ya','perfecto','de una','vale','hagale','chevere','bacan','excelente','genial','super',
  '(?:ya )?(?:lo |la )?(?:puedes|pueden|puede|podes|podrias) (?:ya )?(?:enviar|mandar|pasar|pedir|llevar|confirmar)(?:lo|la)?(?: (?:a (?:la )?cocina|el pedido|la orden))?',
  '(?:si )?(?:por favor )?(?:envia|manda|pasa|mande|envie)(?:lo|la|le|selo)?(?: ya)?(?: (?:a|para) (?:la )?cocina)?','lo puedes mandar','envialo nomas','mandalo nomas','si mandalo','si envialo','ya mandalo','ya envialo','asi mandalo',
  '(?:manda|mandalo|mandala|mandame|envia|envialo|enviala|pasa|pasalo|pasala|lleva|llevalo|llevala|pidelo|pide|ordena|ordenalo|despacha|despachalo|mete|metelo|sube|subelo)(?: (?:el pedido|la orden|eso|todo))?(?: (?:a|para) (?:la )?cocina)?',
  '(?:a|para) (?:la )?cocina','(?:que|ya) (?:lo |la |los )?(?:preparen|hagan|cocinen|traigan|saquen)','(?:que|ya) (?:empiecen|arranquen)','pueden (?:prepararlo|empezar|traerlo)',
  'adelante','proceda','procede','vamos','dale nomas','listo para cocina','ya cierra','cierra nomas','finaliza(?:r)?(?: (?:el pedido|la orden))?','(?:ya )?(?:sale|salio)',
];
const finishRe=new RegExp(`^${lead}(?:${done.join('|')})(?: (?:${done.join('|')}))?${tail}$`);
// Querer terminar dicho de cualquier forma y aunque llegue con ruido de la mesa alrededor:
// «quiero finalizar el pedido», «ya terminamos», «jajaja ya finaliza el pedido», «vamos a finalizar».
// No cuenta si se niega o se pospone («no finalices», «todavía no termino», «espera, antes de cerrar…»).
const finishWord=/\b(finali[zc]\w*|termin(?:a|ar|amos|emos|alo|amelo)(?: (?:el|mi|la|nuestro) (?:pedido|orden))?|ya (?:termine|terminamos|acabamos|acabe)|cerr(?:ar|amos|emos|alo|a) (?:el |mi |la )?(?:pedido|orden|cuenta)|envi\w* (?:el |mi |la )?(?:pedido|orden)|(?:manda|envia|pasa|mande|envie)(?:lo|la|le)? (?:a|para) (?:la )?cocina|eso (?:seria|es|sera) todo|seria todo|ya (?:esta|estaria|es) todo|ya pedimos todo|eso nomas|nada mas|(?:ya|si) (?:mandalo|mandala|mandale|envialo|enviala|enviale))\b/;
const holdOn=/\b(?:no|ni) (?:lo |la |le |me |nos |se )?(?:finali|termin|cierr|cerr|envi|mand|pas)|\b(?:todavia|aun|espera|esperate|esperame|un momento|antes de|despues|luego)\b(?:\s+\w+){0,2}\s+(?:finali|termin|cerr|envi|mand|pas)|\b(?:no|todavia no|aun no) (?:es todo|seria todo)|\btodavia no\b|\baun no\b|\b(?:falta|faltan|me falta|nos falta)\b/;
export function finishIntent(text){
  const n=normalize(text);if(!n)return false;
  if(isFinish(text))return true;
  return finishWord.test(n)&&!holdOn.test(n);
}
export function isFinish(text){
  const n=normalize(text);
  if(!n||/^no(?: gracias)?$/.test(n)||/^no (?:gracias )?(?:todavia|aun|espera|un momento)/.test(n))return false;
  return finishRe.test(n)||isConfirmation(text);
}
const answer=(intent,reply,extra={})=>({intent,reply,operations:[],...extra});
const one=p=>p.one||p.name,many=p=>p.many||p.name;
const more=['¿Algo más, o cerramos el pedido?','¿Te traigo algo más o ya finalizamos?','¿Sumamos algo más o lo envío a cocina?'];
export const amount=(p,qty)=>qty===1?one(p):`${numberWords(qty)} ${many(p)}`;
// Lo que diría un mesero al anotar: «Van dos cuartos de pollo y una Coca-Cola».
export function describeOps(ops,menu){
  const find=id=>menu.find(p=>p.id===id);
  // Una nota sobre algo recién agregado se dice junto: «Van dos cuartos de pollo sin cebolla».
  const newIds=new Set(ops.filter(o=>o.type==='add').map(o=>o.id));
  const notesFor=id=>ops.filter(o=>o.type==='note'&&o.id===id).map(o=>o.note);
  const added=ops.filter(o=>o.type==='add').map(o=>[amount(find(o.id),o.qty),listWords(notesFor(o.id))].filter(Boolean).join(' '));
  const parts=[];
  const single=added.length===1&&ops.find(o=>o.type==='add').qty===1&&!/^un[ao]s /.test(added[0]);
  if(added.length)parts.push(`${single?'Va':'Van'} ${listWords(added)}.`);
  const splitSeen=new Set();
  for(const o of ops){
    const p=find(o.id);
    if(o.type==='split'){
      const fem=/^una /.test(one(p)),again=splitSeen.has(o.id);splitSeen.add(o.id);
      const who=o.qty===1?(again?(fem?'otra':'otro'):(fem?'una':'uno')):`${again?'otros ':''}${numberWords(o.qty)}`;
      if(newIds.has(o.id)&&parts.length)parts[parts.length-1]=parts.at(-1).replace(/\.$/,`, ${who} ${listWords(o.notes)}.`);
      else parts.push(`Anotado: ${who} de ${/^una /.test(one(p))?'las':'los'} ${many(p).toLowerCase()} ${listWords(o.notes)}.`);
    }
    if(o.type==='note'&&!newIds.has(o.id))parts.push(`Anotado: ${p.name.toLowerCase()} ${o.note}.`);
    if(o.type==='set')parts.push(o.qty?`Listo, quedan ${amount(p,o.qty)}.`.replace('quedan un','queda un').replace('quedan una','queda una'):`Listo, saqué ${one(p)} del pedido.`);
    if(o.type==='remove')parts.push(`Listo, saqué ${amount(p,o.qty)}.`);
  }
  return parts.join(' ');
}
// Una sola sugerencia de bebida por pedido, y nunca si ya hay bebida o combo.
export function followUp(cart,ops,menu,drinkOffered){
  const ids=[...cart.map(l=>l.id),...ops.filter(o=>o.type==='add').map(o=>o.id)];
  const covered=ids.some(id=>['Bebidas','Combos'].includes(menu.find(p=>p.id===id)?.category));
  if(!covered&&!drinkOffered&&ops.some(o=>o.type==='add'))return '¿Algo para tomar, o cerramos así?';
  return more[(cart.length+ops.length)%3];
}
// Determinista para órdenes comunes; la IA resuelve las frases no cubiertas.
// Errores de transcripción frecuentes («esprait», «un cuatro de pollo») corregidos sin gastar IA.
const soundAlikes=[
  [/\b(?:e?sprait|e?sprai|esprite|espray|sprai)\b/g,'sprite'],[/\b(?:pecsi|pepsy|pexi|pepsis)\b/g,'pepsi'],
  [/\b(?:cocacolas|coca colas|cocas)\b/g,'coca cola'],
  [/\b(un|el|1) cuatro de pollo\b/g,'$1 cuarto de pollo'],[/\bcuatros de pollo\b/g,'cuartos de pollo'],
  [/\bcombos? persona\b/g,'combo personal'],[/\bcon vo personal\b/g,'combo personal'],[/\bel familia\b/g,'el familiar'],
  [/\bunas? alita(?: bbq)?\b/g,'unas alitas'],[/\bmedio pollos\b/g,'medios pollos'],[/\buna papa\b/g,'unas papas'],[/\bcombo pa dos\b/g,'combo para dos'],
];
// Habla de la calle: saludos y vocativos («oe ñaño», «qué fue mijo», «veci») no cambian el pedido;
// diminutivos («un cuartito», «una colita», «unas papitas») son el mismo producto; «simón» es sí, «nel» es no.
const streetTalk=[
  // Muletillas al empezar: «eh… este… dame», «a ver, un medio», «ya pues ponme».
  [/^(?:(?:eh+|em+|mm+|a ver|haber|bueno|o sea|mira|pues|ya pues|este)\s+)+(?=(?:dame|deme|quiero|quisiera|ponme|pongame|un|una|unos|unas|dos|tres|cuatro|me|nos|traeme|traiga|regalame|regaleme|mandame|el|la|los|las|y|que|cuanto|tienes|tienen|hay|muestrame|ensename|si|no|ya)\b)/,''],
  [/^(?:(?:hola|holi|alo|buenas|buenas tardes|buenas noches|buenos dias|que fue|que mas|que tal|saludos|disculpa|disculpe|perdon|una pregunta)\b\s*)+/,''],
  [/\b(?:oe|oiga|oye|ve|nano|nana|nanito|mijo|mija|mijin|mi pana|pana|panita|bro|brother|veci|vecino|vecina|jefe|jefecito|jefa|jefita|caserito|caserita|casero|casera|amigo|amiga|amiguito|maestro|loco|loca|hermano|hermanito|mi rey|mi reina|mi amor|joven|senorita|milo|mi llave|llave|causa)\b/g,''],
  [/\b(dame|deme|traeme|ponme|regalame|mandame|anda|vete) (?:haciendo|preparando|sirviendo|mandando|trayendo)\b/g,'$1'],
  [/\bsimona?\b|\bde ley\b/g,'si'],[/\bnel\b|\bnelson\b|\bni de fun\b|\bnada que ver\b/g,'no'],
  [/\bcuartitos?\b/g,m=>m.endsWith('s')?'cuartos':'cuarto'],[/\bpoll(?:it|ic)os?\b/g,m=>m.endsWith('s')?'pollos':'pollo'],[/\bpapitas?\b/g,'papas'],
  [/\bcocacolitas?\b|\bcoquitas?\b/g,'coca cola'],[/\bcolitas?\b/g,m=>m.endsWith('s')?'colas':'cola'],[/\baguitas?\b/g,'agua'],[/\barrocito\b/g,'arroz'],
  [/\bensaladitas?\b/g,'ensalada'],[/\bpechuguitas?\b/g,'pechuga'],[/\bcombitos?\b/g,'combo'],[/\bgaseositas?\b/g,'gaseosa'],[/\bspritecitas?\b/g,'sprite'],
  [/\bpepsicitas?\b/g,'pepsi'],[/\bheladit(?:a|o)s?\b/g,'helada'],[/\bporcioncitas?\b/g,'porcion'],[/\bmediecito\b/g,'medio'],
  [/(?:\s+(?:nomas|no mas|porfis|plis|please|porfa|por favor|rapidito|ahi|pues))+\s*$/g,''],
];
export function soundsLike(text,menu){let n=normalize(text);for(const [re,to] of [...streetTalk,...soundAlikes])n=n.replace(re,to);n=n.replace(/\s+/g,' ').trim();return fixWords(n,menu);}
// Productos nombrados en una frase ya normalizada, del alias más largo al más corto (no cuenta dos veces
// «combo de alitas» como combo y como alitas). Devuelve [{id,index,length}] en orden de aparición.
export function productHits(n,menu){
  const hits=[];let remaining=n;
  const aliases=menu.filter(p=>p.category!=='Mesa'||true).flatMap(p=>[p.name,...(p.aliases||[])].map(a=>({id:p.id,a:normalize(a).replace(/^(?:un|una|unas|unos|dos|tres) /,'')}))).filter(x=>x.a).sort((a,b)=>b.a.length-a.a.length);
  for(const {id,a} of aliases){
    const re=new RegExp(`(^|\\s)(${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})(?=\\s|$)`,'g');
    remaining=remaining.replace(re,(full,prefix,word,offset)=>{hits.push({id,index:offset+prefix.length,length:word.length});return ' '.repeat(full.length);});
  }
  return hits.sort((a,b)=>a.index-b.index);
}
export function interpretLocal(text,cart,menu,lastId=null,context={}){
  // Cómo se sirve la bebida («una pepsi sin hielo») lo anota la app aparte; aquí no es un ingrediente.
  let n=soundsLike(text,menu).replace(/\s*\b(?:(?:en )?vaso )?(?:con|sin) hielos?\b|\s*\b(?:(?:solo |en )?(?:la |su )?botellita|(?:solo |en )?(?:la |su )?botella|sin vaso|al clima)\b/g,'').trim();
  // Solo el nombre de un producto («medio pollo», «combo familiar»), como se lo dice a un mesero: es un pedido.
  if(!context.nested&&menu.some(p=>p.available!==false&&[p.name,...(p.aliases||[])].some(x=>normalize(x)===n)))n=`quiero ${n}`;
  // Ingredientes que se pueden quitar (todas las opciones «sin X» del catálogo), más largos primero.
  const removable=[...new Set(menu.flatMap(p=>p.options.map(o=>normalize(o).replace(/^sin /,''))))].sort((a,b)=>b.length-a.length);
  const alt=removable.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  if(alt){
    // «Quítale la cebolla», «que no tenga lechuga», «no le pongas ají» → «sin …». «Quítale las papas» con
    // papas extra en el pedido es quitar ese producto, no un ingrediente.
    // Formas de decirlo sin nombrar la opción: «que no pique» = sin ají; «sin verduras» = sin ensalada.
    n=n.replace(/\b(?:que no pique|que no este picante|sin picante|nada de picante|nada picante|no picante|sin lo picante)\b/g,'sin aji').replace(/\b(?:sin|nada de|sin nada de) (?:verduras?|vegetales|verde|lo verde)\b/g,'sin ensalada');
    n=n.replace(new RegExp(`\\b(?:quitale|quitele|quitales|sacale|sacales|no le pongas|no le pongan|no le pongas nada de|que no tenga|que no traiga|que no lleve|no quiero nada de|nada de|no quiero|cero)\\s+(?:nada de |nada de la |nada del )?(?:el |la |los |las |lo de )?(${alt})\\b`,'g'),(m,x)=>x==='papas'&&cart.some(l=>l.id==='papas')?m:`sin ${x}`);
    // «sin cebolla ni tomate», «sin cebolla y tomate», «sin cebolla, tomate» → cada uno con su «sin».
    for(let prev='';prev!==n;){prev=n;n=n.replace(new RegExp(`\\bsin (${alt})\\s+(?:(?:y|ni)\\s+)?(?!sin )(${alt})\\b`),'sin $1 sin $2');}
  }
  text=n;
  const category=navigation(text);
  if(category)return answer('menu','',{category});
  // Autocorrección: «un cuarto, no, mejor medio» → solo cuenta lo último que pidió.
  const fix=n.match(/^(.+?)\s+(?:no|perdon|digo|mejor dicho)\s+(?:no\s+)?(?:mejor\s+|mas bien\s+)?(?:que sea\s+|que sean\s+)?(.+)$/);
  if(fix&&!context.nested&&!/\b(no quiero|sin)\b/.test(n)){
    const before=interpretLocal(`quiero ${fix[1]}`,cart,menu,lastId,{...context,nested:true});
    const after=interpretLocal(`quiero ${fix[2]}`,cart,menu,lastId,{...context,nested:true});
    if(before?.intent==='edit'&&after?.intent==='edit')return after;
  }
  if(context.category==='Platos'&&/^(me apoyo|medio apoyo|medio de apoyo)$/.test(n))return answer('clarify','¿Te refieres a un medio pollo? Puedes decir «medio pollo».');
  if(/\b(alergia|alergico|celiaco|gluten)\b/.test(n)) return answer('clarify','Con alergias prefiero no adivinar. Pídele al personal que te confirme los ingredientes, por favor.');
  if(/^(no|no gracias|no confirmes(?: todavia)?|no lo envies|todavia no|espera|espera un momento)$/.test(n)) return answer('keep','Sin problema, no envío nada todavía. Tómate tu tiempo.');
  if(/^(?:(?:no |ya |bueno |ok |eh |este )*)(eso es todo|eso seria todo|seria todo|es todo|eso nomas|eso no mas|eso nada mas|ya esta|ya estaria|eso seria|termine(?: mi pedido)?|he terminado|listo|nada mas|ya no|nada mas gracias|ver (?:mi )?pedido|mi pedido|resumen|que llevo|que tengo)$/.test(n)) return answer('review',cart.length?'Repasemos tu pedido.':'Todavía no has pedido nada. ¿Qué se te antoja?');
  // «Lo de siempre»: Milo no recuerda visitas anteriores; nunca inventa un pedido.
  if(/\b(lo de siempre|lo mismo de siempre|lo mismo que (?:la otra vez|siempre|antes|ayer)|lo (?:mismo )?de la otra vez|lo que (?:pedi|pido) (?:siempre|antes|la otra vez|ayer)|lo de ayer|lo usual|lo de costumbre|lo de cajon)\b/.test(n)&&!/\b(cuarto|medio|combo|pollo|alitas|pechuga)\b/.test(n))
    return answer('clarify','Todavía no recuerdo lo que pides otras veces. Dime qué se te antoja hoy y te lo anoto.');
  if(/^(cancelar|cancela|borra) (?:todo|el pedido|mi pedido)$/.test(n)) return answer('cancel','¿Borro todo el pedido y empezamos de cero?');
  if(/^(gracias|hasta luego|chao|adios)$/.test(n)) return answer(cart.length?'review':'goodbye',cart.length?'Antes de irte, repasemos tu pedido.':'¡Gracias a ti! Aquí estaré si se te antoja algo más.');

  // «¿Qué me recomiendas para dos personas?»: ya dijo cuántos son, no se vuelve a preguntar.
  const group=n.match(/\b(?:para|somos|seremos|seriamos)\s+(\d{1,2}|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+personas?)?\b/);
  if(group&&/\b(recomienda|recomiendas|recomendacion|sugieres|sugiere|que pido|que pedimos|que nos das|para compartir|que me das)\b/.test(n)){
    const plan=suggestForPeople(count(group[1]),menu);
    if(plan)return answer('recommend',plan.reply,{suggest_ids:plan.operations.map(o=>o.id),proposal:plan.operations});
  }
  // «Algo ligero» / «algo pesado para llenarme»: se razona con el perfil de cada plato del catálogo.
  const light=/\b(ligero|ligerito|liviano|livianito|suave|light|sano|saludable|dieta|no tan pesado|poquito|algo pequeno|no tengo mucha hambre)\b/.test(n);
  const heavy=/\b(pesado|llenarme|llenar|llenito|contundente|bastante|harto|hambre|hambriento|muerto de hambre|algo fuerte|que llene|grande)\b/.test(n)&&!/\bno tengo mucha hambre\b/.test(n);
  if((light||heavy)&&!/\b(no|sin)\b/.test(n.replace(/no tan pesado|no tengo mucha hambre/,''))){
    // Los preferidos de la casa y, si se acabaron o el dueño cambió el menú, cualquiera con ese perfil.
    const want=light?'ligero':'contundente',preferred=(light?['pechuga','cuarto']:['medio','combo-alitas']).map(id=>menu.find(p=>p.id===id&&p.available));
    const byFeel=menu.filter(p=>p.available&&p.feel===want&&['Platos','Combos'].includes(p.category));
    const [a,b]=[...new Set([...preferred,...byFeel].filter(Boolean))];
    const say=p=>p.pitch||one(p);
    if(a&&b)return answer('recommend',`${light?'Para algo ligero':'Para llenarte bien'}, ${say(a)}, o ${say(b)}. ¿Cuál te anoto?`,{suggest_ids:[a.id,b.id]});
  }
  // «Lo más pedido», «lo que más sale», «la especialidad»: el producto marcado en el catálogo.
  if(/\b(lo mas pedido|lo que mas (?:sale|piden|venden|se vende|se pide)|lo mas vendido|la especialidad|especialidad de la casa|lo mejor que (?:tienes|tienen|hay)|lo mas rico|que esta bueno|que es lo bueno|que es lo mejor)\b/.test(n)){
    const star=menu.find(p=>p.available&&/pedido|vendido/i.test(p.tag||''))||menu.find(p=>p.available&&p.tag);
    if(star)return answer('recommend',`Lo que más sale es el ${star.name.toLowerCase()}. ¿Te lo anoto?`,{suggest_ids:[star.id],proposal:[{type:'add',id:star.id,qty:1}]});
  }
  if(/\b(recomienda|recomiendas|recomendacion|que hay|que tienes)\b/.test(n)) return answer('recommend','Si es para ti solo, el combo personal va bien. Para compartir, el combo familiar. ¿Para cuántos es?',{suggest_ids:['combo-personal','combo-familiar']});
  const single=menu.find(p=>p.available&&[p.name,...p.aliases].some(a=>normalize(a).replace(/^(un|una) /,'')===n));
  if(single&&context.category===single.category){const operations=[{type:'add',id:single.id,qty:1}];return answer('edit',`${describeOps(operations,menu)} ${followUp(cart,operations,menu,context.drinkOffered)}`,{operations});}
  const hits=[]; let remaining=n;
  const aliases=menu.flatMap(p=>[p.name,...p.aliases].map(a=>({id:p.id,a:normalize(a).replace(/^(?:un|una|unas|unos|dos|tres) /,'')}))).sort((a,b)=>b.a.length-a.a.length);
  // Buscar primero la coincidencia más larga y no contar de nuevo sus subcadenas.
  for(const {id,a} of aliases){
    const re=new RegExp(`(^|\\s)(${a})(?=\\s|$)`,'g');
    remaining=remaining.replace(re,(full,prefix,word,offset)=>{hits.push({id,index:offset+prefix.length,length:word.length});return ' '.repeat(full.length);});
  }
  hits.sort((a,b)=>a.index-b.index);
  // «¿Qué trae el combo personal?» → ficha con ingredientes (no agrega nada).
  // También sin signos de pregunta: «el combo familiar trae ensalada», «la pechuga lleva cebolla».
  const asksContents=/\b(que (?:contiene|trae|tiene|lleva|incluye|viene con)|ingredientes|de que es|con que viene|como viene|que tiene adentro)\b/.test(n)||(hits.length>0&&/^(?:(?:el|la|los|las|y|oye|una pregunta)\s+)*[^,]*\b(trae|lleva|tiene|incluye|viene con)\b/.test(n)&&!/\b(traeme|traenos|dame|quiero|ponme|agrega|sin)\b/.test(n));
  // Una petición mixta no se reduce a la ficha del primer producto.
  if(asksContents&&hits.length>1&&/^(?:quiero|dame|ponme|dos|tres|cuatro|cinco|\d+)\b/.test(n))return null;
  if(asksContents&&!/\b(cuanto|precio|cuesta)\b/.test(n)){
    const ids=[...new Set(hits.map(h=>h.id))];
    // «El combo familiar trae ensalada»: se pregunta por lo primero que se nombra. «¿Y qué trae?» sin nombrar
    // nada es lo que está en pantalla o de lo que Milo acaba de hablar.
    // Con varias tarjetas en pantalla y nada señalado, se pregunta cuál en vez de suponer.
    const shown=(context.shown||[]).map(x=>menu.find(p=>p.id===x)).filter(Boolean);
    const id=ids.length?hits[0].id:context.focus||(shown.length>=2?null:lastId);
    if(id)return answer('detail','',{suggest_ids:[id]});
    if(shown.length>=2&&shown.length<=6)return answer('clarify',`¿De cuál quieres saber qué trae: ${listWords(shown.map(one)).replace(/ y ([^,]*)$/,' o $1')}?`);
    return answer('clarify','¿De qué plato quieres saber qué trae?');
  }
  // «Sin cebolla» es una opción del producto, nunca un plato aparte: «los dos cuartos sin cebolla».
  const noteRe=alt?new RegExp(`\\bsin (${alt})\\b`,'g'):null;
  const found=noteRe?[...n.matchAll(noteRe)]:[];
  const note=found[0]?.[0];
  // «Dos cuartos, uno sin cebolla (y el otro normal)»: preparaciones distintas del mismo plato en líneas separadas.
  const splitRe=alt?new RegExp(`\\b(?:solo |nada mas |pero )?(uno|una|dos|tres|el otro|la otra|otro|otra)(?: de (?:ellos|ellas|esos|esas|los|las))?((?:\\s+(?:y\\s+|ni\\s+)?sin (?:${alt}))+)`,'g'):null;
  const splits=note&&splitRe?[...n.matchAll(splitRe)]:[];
  if(splits.length){
    const inNote=h=>splits.some(m=>h.index>=m.index&&h.index<m.index+m[0].length);
    const named=[...new Set(hits.filter(h=>!inNote(h)).map(h=>h.id))];
    const id=named.length===1?named[0]:named.length?null:lastId;
    const product=id&&menu.find(p=>p.id===id);
    if(product){
      const token=named.length?n.slice(0,hits.find(h=>!inNote(h)).index).trim().split(' ').at(-1):'';const said=count(token);
      const have=cart.filter(l=>l.id===id).reduce((a,l)=>a+l.qty,0);
      const qty=Number.isInteger(said)&&said>0?said:named.length?0:have;
      const parts=splits.map(m=>({qty:count(m[1].replace(/^(el|la) /,''))||1,notes:[...m[2].matchAll(noteRe)].map(x=>product.options.find(o=>normalize(o)===`sin ${x[1]}`)).filter(Boolean)}));
      const used=parts.reduce((a,x)=>a+x.qty,0);
      if(qty>=2&&parts.every(x=>x.notes.length)&&used<=qty){
        const operations=[...(named.length&&said>0?[{type:'add',id,qty}]:[]),...parts.map(x=>({type:'split',id,qty:x.qty,notes:x.notes}))];
        return answer('edit',`${describeOps(operations,menu)} ${operations[0].type==='add'?followUp(cart,operations,menu,context.drinkOffered):more[cart.length%3]}`,{operations});
      }
    }
  }
  if(found.length&&!/\b(no|cuanto|precio|cuesta)\b/.test(n.replace(noteRe,''))){
    // La palabra de un producto dentro de la opción («sin ensalada», «sin papas») no cuenta como otro producto.
    const inNote=h=>found.some(m=>h.index>=m.index&&h.index<m.index+m[0].length);
    const ids=[...new Set(hits.filter(h=>!inNote(h)).map(h=>h.id))];
    if(ids.length>1)return null;
    const id=ids[0]||(cart.length===1?cart[0].id:lastId);
    if(!id||(!ids.length&&!cart.some(l=>l.id===id)))return answer('clarify','¿A qué producto le hago ese cambio?');
    const product=menu.find(p=>p.id===id);
    const notes=found.map(m=>product.options.find(o=>normalize(o)===`sin ${m[1]}`));
    const valid=[...new Set(notes.filter(Boolean))],missing=found.filter((m,i)=>!notes[i]).map(m=>m[1]);
    const pretty=missing.map(w=>ingredientName(w,menu));
    if(!valid.length)return answer('clarify',`Tranquilo: ${one(product).replace(/^(un|una|unas|unos) /,a=>({'un ':'el ','una ':'la ','unas ':'las ','unos ':'los '})[a])} no lleva ${listWords(pretty)}, así que va tal cual. ${more[cart.length%3]}`);
    const extra=pretty.length?` Ojo: ${one(product).replace(/^(un|una|unas|unos) /,a=>({'un ':'el ','una ':'la ','unas ':'las ','unos ':'los '})[a])} no lleva ${listWords(pretty)}.`:'';
    const inCart=cart.some(l=>l.id===id);
    const notesOps=valid.map(note=>({type:'note',id,note}));
    if(inCart&&!/\b(otro|otra|otros|otras|agrega|agregame|anade|suma|aparte)\b/.test(n))return answer('edit',`Anotado: ${product.name.toLowerCase()} ${listWords(valid)}.${extra} ${more[cart.length%3]}`,{operations:notesOps});
    if(inCart)return null;
    const token=n.slice(0,hits.find(h=>!inNote(h))?.index??0).trim().split(' ').at(-1);const qty=count(token);
    const operations=[{type:'add',id,qty:Number.isInteger(qty)&&qty>0?qty:1},...notesOps];
    return answer('edit',`${describeOps(operations,menu)}${extra} ${followUp(cart,operations,menu,context.drinkOffered)}`,{operations});
  }
  if(/\b(cuanto|precio|cuesta|cuestan)\b/.test(n)){
    if(!hits.length&&context.focus){const p=menu.find(x=>x.id===context.focus);if(p)return answer('price',`${p.name} cuesta ${money(p.price)}.`,{suggest_ids:[p.id]});}
    const shown=(context.shown||[]).map(x=>menu.find(p=>p.id===x)).filter(Boolean);
    if(!hits.length&&shown.length>=2&&shown.length<=6) return answer('clarify',`¿De cuál quieres saber el precio: ${listWords(shown.map(one)).replace(/ y ([^,]*)$/,' o $1')}?`);
    if(!hits.length) return answer('clarify','¿De qué producto quieres saber el precio?');
    return answer('price',hits.map(h=>{const p=menu.find(p=>p.id===h.id);return `${p.name} cuesta ${money(p.price)}.`;}).join(' '),{suggest_ids:[...new Set(hits.map(h=>h.id))]});
  }
  // «Dámelo», «ponme ese», «me quedo con ese», «dame dos de esos»: lo que está en pantalla o se acaba de mencionar.
  if(!hits.length&&context.focus&&menu.some(p=>p.id===context.focus&&p.available)){
    const lead='(?:(?:si|ya|bueno|entonces|ok|dale|listo|va|ya pues) )*';
    const clitic='(?:damelo|damela|ponmelo|ponmela|anotamelo|anotamela|anotalo|anotala|agregamelo|agregamela|agregalo|agregala|ponlo|ponla|traemelo|traemela|mandamelo|regalamelo|pasamelo|(?:me|si) lo (?:das|llevo|quiero|anotas|pones|traes)|(?:me|si) la (?:das|llevo|quiero|anotas|pones|traes)|lo quiero|la quiero|lo pido|la pido)';
    const verb='(?:dame|deme|ponme|quiero|quisiera|anotame|agregame|traeme|me das|mandame|regalame|pasame|pido|voy a pedir|vamos con|me quedo con|elijo|escojo|me llevo)';
    const that='(?:ese|esa|este|esta|ese mismo|esa misma|el mismo|la misma|ese de ahi|esa de ahi|el de ahi|la de ahi|ese combo|ese plato|esa bebida|esa opcion|eso mismo)';
    const many=n.match(/\b(dos|tres|cuatro|cinco|seis|\d+) de (?:esos|esas|estos|estas)\b/);
    if(many||new RegExp(`^${lead}(?:${clitic}(?: (?:uno|una|nomas|porfa))?|${verb} ${that}|${that}(?: (?:quiero|mismo|misma|nomas))?)$`).test(n)){
      const qty=many?count(many[1]):1;const operations=[{type:'add',id:context.focus,qty}];
      return answer('edit',`${describeOps(operations,menu)} ${followUp(cart,operations,menu,context.drinkOffered)}`,{operations});
    }
  }
  const correction=n.match(/^(?:mejor |no )?(?:que sean|que sea|dejalo en|ponle|mejor) (\d+|uno|una|dos|tres|cuatro|cinco)$/);
  if(correction){const id=lastId||(cart.length===1?cart[0].id:null);if(!id)return answer('clarify','¿De qué producto cambio la cantidad?');const operations=[{type:'set',id,qty:count(correction[1])}];return answer('edit',describeOps(operations,menu),{operations});}
  // Frases complejas/negadas se dejan a la IA; nunca adivinar una sustitución.
  if(/\b(no|cambia|cambiar|sustituye|en vez|pero|sin)\b/.test(remaining)) return null;
  if(!hits.length) return null;
  // «trae» solo no es pedir: «el combo trae ensalada» pregunta qué incluye. Se pide con «tráeme».
  const verbs='quiero|quisiera|dame|deme|da|das|traeme|traenos|regalame|mandame|agrega|agregame|anade|pon|ponme|quita|quitale|quitame|saca|sacale|elimina|borra|mejor|necesito|me|nos|otra|otro|otras|otros|tambien|regaleme|traigame|traiga|traigan|traiganos|pongame|mandeme|sirvame|sirveme|queremos|quisieramos|querer|regalanos|pasame|pasanos|alcanzame|deseo|deseamos|pido|pedimos|vamos|a';
  if(!new RegExp(`\\b(${verbs})\\b`).test(n)&&!/^\d|^(un|una|unas|unos|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/.test(n)) return null;
  const residue=normalize(remaining).split(' ').filter(w=>w&&!new RegExp(`^(${verbs}|si|y|tambien|por|favor|porfa|pues|el|la|los|las|de|del|un|una|unas|unos|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|bien|super|fria|frias|frio|helada|heladas|fresca|frescas|grande|-?\\d+)$`).test(w));
  if(residue.length) return null;
  const remove=/\b(quita|quitale|quitame|saca|sacale|elimina|borra)\b/.test(n);
  const replace=/\bmejor\b/.test(n);
  const operations=hits.map((h,i)=>{
    const before=n.slice(i?hits[i-1].index+hits[i-1].length:0,h.index).trim();
    const token=before.split(' ').at(-1); const qty=count(token);
    return {type:remove?'remove':replace?'set':'add',id:h.id,qty:Number.isInteger(qty)&&token!==''?qty:remove?(cart.find(l=>l.id===h.id)?.qty||1):1};
  });
  return answer('edit',`${describeOps(operations,menu)} ${remove?'¿Algo más?':followUp(cart,operations,menu,context.drinkOffered)}`.trim(),{operations});
}
