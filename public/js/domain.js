import {navigation} from './conversation.js';
import {numberWords,listWords} from './speech-text.js';
export const normalize = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
export const money = cents => new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(cents/100);
export function validateCart(cart, menu) {
  if(!Array.isArray(cart) || cart.length>30) throw new Error('Pedido inválido.');
  const seen = new Set();
  return cart.map(line=>{
    const item=menu.find(p=>p.id===line.id);
    if(!item || !item.available || seen.has(line.id) || !Number.isInteger(line.qty) || line.qty<1 || line.qty>20) throw new Error('Producto o cantidad inválida.');
    seen.add(line.id);
    const notes=line.notes??[];
    if(!Array.isArray(notes) || notes.length>6 || notes.some(n=>!item.options.includes(n))) throw new Error('Opción inválida.');
    return {id:item.id,qty:line.qty,notes:[...new Set(notes)]};
  });
}
export const total = (cart,menu)=>cart.reduce((sum,l)=>sum+menu.find(p=>p.id===l.id).price*l.qty,0);
export function applyOperations(cart, ops, menu) {
  const next=structuredClone(validateCart(cart,menu));
  if(!Array.isArray(ops)||ops.length>20) throw new Error('Cambios inválidos.');
  for(const op of ops){
    const product=menu.find(p=>p.id===op.id && p.available);
    if(!product) throw new Error('Producto no disponible.');
    let line=next.find(l=>l.id===op.id);
    if(op.type==='note'){
      if(!line || !product.options.includes(op.note)) throw new Error('Ese cambio no está disponible para este producto.');
      line.notes=[...new Set([...line.notes,op.note])]; continue;
    }
    if(!['add','set','remove'].includes(op.type) || !Number.isInteger(op.qty)||op.qty<0||op.qty>20 || (op.type==='add'&&op.qty===0)) throw new Error('Cantidad inválida.');
    if(!line){if(op.type!=='add') throw new Error('Ese producto no está en tu pedido.');line={id:op.id,qty:0,notes:[]}; next.push(line);}
    line.qty=op.type==='set'?op.qty:op.type==='remove'?Math.max(0,line.qty-op.qty):line.qty+op.qty;
  }
  return validateCart(next.filter(l=>l.qty>0),menu);
}
export function validateResult(result,cart,menu){
  const intents=['edit','menu','recommend','price','review','clarify','keep','goodbye','cancel'];
  if(!result||!intents.includes(result.intent)||typeof result.reply!=='string'||result.reply.length>600) throw new Error('Respuesta inválida.');
  const operations=result.operations??[];
  if(result.intent!=='edit'&&operations.length) throw new Error('Acciones inesperadas.');
  if(result.intent==='edit'&&!operations.length) throw new Error('Faltan cambios.');
  applyOperations(cart,operations,menu);
  const ids=result.suggest_ids??[];
  if(!Array.isArray(ids)||ids.length>10||ids.some(id=>!menu.some(p=>p.id===id&&p.available))) throw new Error('Sugerencias inválidas.');
  const category=['all','Platos','Combos','Extras','Bebidas'].includes(result.category)?result.category:null;
  return {intent:result.intent,reply:result.reply,operations,suggest_ids:ids,...(category?{category}:{})};
}
// Corrige diferencias de forma frecuentes en la salida del modelo antes de la validación estricta.
// Nunca crea ediciones: si la intención no es «edit», se descartan las operaciones.
const intentAlias={confirm:'review',confirmar:'review',confirmation:'review',confirmation_answer:'review',send:'review',submit:'review',finalize:'review',finish:'review',checkout:'review',summary:'review',browse:'menu',show:'menu',question:'clarify',answer:'clarify',info:'price',pause:'keep',wait:'keep',cancel_request:'cancel',greeting:'clarify',chat:'clarify',handoff:'clarify'};
export function repairResult(raw,menu){
  const r=raw&&typeof raw==='object'?raw:{};
  let intent=String(r.intent||'').toLowerCase().trim();intent=intentAlias[intent]||intent;
  if(!['edit','menu','recommend','price','review','clarify','keep','goodbye','cancel'].includes(intent))intent='clarify';
  const reply=typeof r.reply==='string'?r.reply.trim().slice(0,600):'';
  let operations=[];
  if(intent==='edit'&&Array.isArray(r.operations))operations=r.operations.filter(o=>o&&typeof o==='object').map(o=>{
    const type=String(o.type??o.op??o.action??'').toLowerCase().trim();const id=o.id??o.product_id??o.productId;
    if(type==='note')return {type,id,note:String(o.note??o.option??'').toLowerCase().trim()};
    return {type,id,qty:Number(o.qty??o.quantity??(type==='add'?1:NaN))};
  });
  if(intent==='edit'&&!operations.length)intent='clarify';
  const suggest_ids=(Array.isArray(r.suggest_ids)?r.suggest_ids:[]).filter(id=>menu.some(p=>p.id===id&&p.available)).slice(0,10);
  return {intent,reply,operations,suggest_ids,...(r.category?{category:r.category}:{})};
}
const numbers={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12};
// Respuesta a «¿Para cuántos es?»: «cinco», «para cinco», «somos 5 personas», «solo yo».
// Sin pregunta pendiente solo se acepta si es inequívoca («somos cinco», «para cinco personas»).
export function parsePeople(text,asked=false){
  const n=normalize(text).replace(/^(?:(?:si|ya|bueno|eh|este|mira)\s+)+/,'');
  if(/^(?:(?:es |seria )?para mi(?: solo| sola)?|solo yo|yo solo|yo sola|uno solo|una sola)$/.test(n))return 1;
  const m=n.match(/^(?:(somos|seriamos|vamos a ser|es para|seria para|para)\s+)?(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(\s+personas?)?$/);
  if(!m||!(asked||m[1]==='somos'||m[1]==='seriamos'||m[1]==='vamos a ser'||m[3]))return null;
  const value=count(m[2]);return Number.isInteger(value)&&value>0?value:null;
}
// Propuesta por número de personas; no agrega nada hasta que el cliente acepte.
export function suggestForPeople(people,menu){
  if(people>20)return null;
  const qty={'combo-familiar':Math.floor(people/4)},rest=people%4;
  if(rest===1)qty['combo-personal']=1;if(rest===2)qty['combo-pareja']=1;if(rest===3){qty['combo-pareja']=1;qty['combo-personal']=1;}
  const operations=Object.entries(qty).filter(([id,q])=>q>0&&menu.some(p=>p.id===id&&p.available)).map(([id,q])=>({type:'add',id,qty:q}));
  const items=operations.map(o=>amount(menu.find(p=>p.id===o.id),o.qty));
  const units=operations.reduce((s,o)=>s+o.qty,0);
  return {operations,reply:`Para ${people===1?'ti':numberWords(people)}, te sugiero ${listWords(items)}. ¿${units>1?'Te los anoto':'Te lo anoto'}?`};
}
const count=s=>numbers[s]??Number(s);
// Aceptación completa («sí», «ya, envíalo», «finaliza el pedido»). Nunca enviada por sí sola:
// la app solo envía si además hay un resumen vigente; si no, muestra el resumen.
const yes='(?:si|ya|listo|dale|ok|okey|perfecto|correcto|de una|claro|esta bien|asi esta bien|todo bien|exacto)';
const act='(?:confirm(?:a|o|ar|alo)|envia(?:lo|r)?|enviamelo|manda(?:lo|r)?|finaliz(?:a|ar|amos|alo)|cierr(?:a|alo)|cerrar|cerramos|procede|hazlo)(?: (?:el |la |mi )?(?:pedido|orden))?';
const confirmRe=new RegExp(`^(?:${yes}(?: ${yes})*(?: ${act})?|${act})(?: por favor)?$`);
export function isConfirmation(text){return confirmRe.test(normalize(text).replace(/^si si\b/,'si'));}
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
  const added=ops.filter(o=>o.type==='add').map(o=>[amount(find(o.id),o.qty),...notesFor(o.id)].join(' '));
  const parts=[];
  const single=added.length===1&&ops.find(o=>o.type==='add').qty===1;
  if(added.length)parts.push(`${single?'Va':'Van'} ${listWords(added)}.`);
  for(const o of ops){
    const p=find(o.id);
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
export function interpretLocal(text,cart,menu,lastId=null,context={}){
  const n=normalize(text);
  const category=navigation(text);
  if(category)return answer('menu','',{category});
  if(context.category==='Platos'&&/^(me apoyo|medio apoyo|medio de apoyo)$/.test(n))return answer('clarify','¿Te refieres a un medio pollo? Puedes decir «medio pollo».');
  if(/\b(alergia|alergico|celiaco|gluten)\b/.test(n)) return answer('clarify','Con alergias prefiero no adivinar. Pídele al personal que te confirme los ingredientes, por favor.');
  if(/^(no|no gracias|no confirmes(?: todavia)?|no lo envies|todavia no|espera|espera un momento)$/.test(n)) return answer('keep','Sin problema, no envío nada todavía. Tómate tu tiempo.');
  if(/^(eso es todo|termine(?: mi pedido)?|he terminado|listo|nada mas|ver (?:mi )?pedido|mi pedido|resumen)$/.test(n)) return answer('review',cart.length?'Repasemos tu pedido.':'Todavía no has pedido nada. ¿Qué se te antoja?');
  if(/^(cancelar|cancela|borra) (?:todo|el pedido|mi pedido)$/.test(n)) return answer('cancel','¿Borro todo el pedido y empezamos de cero?');
  if(/^(gracias|hasta luego|chao|adios)$/.test(n)) return answer(cart.length?'review':'goodbye',cart.length?'Antes de irte, repasemos tu pedido.':'¡Gracias a ti! Aquí estaré si se te antoja algo más.');

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
  // «Sin cebolla» es una opción del producto, nunca un plato aparte: «los dos cuartos sin cebolla».
  const note=n.match(/\bsin (cebolla|ensalada|papas|sal|tomate|arroz)\b/)?.[0];
  if(note&&(n.match(/\bsin\b/g)||[]).length===1&&!/\b(no|cuanto|precio|cuesta)\b/.test(n)){
    const ids=[...new Set(hits.map(h=>h.id))];
    if(ids.length>1)return null;
    const id=ids[0]||(cart.length===1?cart[0].id:lastId);
    if(!id||(!ids.length&&!cart.some(l=>l.id===id)))return answer('clarify','¿A qué producto le hago ese cambio?');
    const product=menu.find(p=>p.id===id);
    if(!product.options.includes(note))return answer('clarify',`${product.name} no tiene la opción «${note}». Puedes consultarlo con el personal.`);
    const inCart=cart.some(l=>l.id===id);
    if(inCart&&!/\b(otro|otra|otros|otras|agrega|agregame|anade|suma|aparte)\b/.test(n))return answer('edit',`Anotado: ${product.name.toLowerCase()} ${note}. ${more[cart.length%3]}`,{operations:[{type:'note',id,note}]});
    if(inCart)return null;
    const token=n.slice(0,hits[0].index).trim().split(' ').at(-1);const qty=count(token);
    const operations=[{type:'add',id,qty:Number.isInteger(qty)&&qty>0?qty:1},{type:'note',id,note}];
    return answer('edit',`${describeOps(operations,menu)} ${followUp(cart,operations,menu,context.drinkOffered)}`,{operations});
  }
  if(/\b(cuanto|precio|cuesta|cuestan)\b/.test(n)){
    if(!hits.length) return answer('clarify','¿De qué producto quieres saber el precio?');
    return answer('price',hits.map(h=>{const p=menu.find(p=>p.id===h.id);return `${p.name} cuesta ${money(p.price)}.`;}).join(' '),{suggest_ids:[...new Set(hits.map(h=>h.id))]});
  }
  const correction=n.match(/^(?:mejor|que sean|dejalo en) (\d+|uno|una|dos|tres|cuatro|cinco)$/);
  if(correction){const id=lastId||(cart.length===1?cart[0].id:null);if(!id)return answer('clarify','¿De qué producto cambio la cantidad?');const operations=[{type:'set',id,qty:count(correction[1])}];return answer('edit',describeOps(operations,menu),{operations});}
  // Frases complejas/negadas se dejan a la IA; nunca adivinar una sustitución.
  if(/\b(no|cambia|cambiar|sustituye|en vez|pero|sin)\b/.test(n)) return null;
  if(!hits.length) return null;
  if(!/\b(quiero|dame|deme|agrega|agregame|pon|ponme|quita|elimina|borra|mejor|necesito)\b/.test(n)&&!/^\d|^(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/.test(n)) return null;
  const residue=normalize(remaining).split(' ').filter(w=>w&&!/^(quiero|dame|deme|agrega|agregame|pon|ponme|quita|elimina|borra|mejor|necesito|si|y|tambien|por|favor|el|la|los|las|de|del|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|-?\d+)$/.test(w));
  if(residue.length) return null;
  const remove=/\b(quita|elimina|borra)\b/.test(n);
  const replace=/\bmejor\b/.test(n);
  const operations=hits.map((h,i)=>{
    const before=n.slice(i?hits[i-1].index+hits[i-1].length:0,h.index).trim();
    const token=before.split(' ').at(-1); const qty=count(token);
    return {type:remove?'remove':replace?'set':'add',id:h.id,qty:Number.isInteger(qty)&&token!==''?qty:remove?(cart.find(l=>l.id===h.id)?.qty||1):1};
  });
  return answer('edit',`${describeOps(operations,menu)} ${remove?'¿Algo más?':followUp(cart,operations,menu,context.drinkOffered)}`.trim(),{operations});
}
