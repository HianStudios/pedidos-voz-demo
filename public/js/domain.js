import {navigation} from './conversation.js';
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
const numbers={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
const count=s=>numbers[s]??Number(s);
export function isConfirmation(text){return /^(si|si por favor|si confirma|si confirmo|confirmo|confirmar|confirma|confirmar pedido|enviar pedido|envia el pedido|mandalo|si envialo|correcto|dale)$/.test(normalize(text));}
const answer=(intent,reply,extra={})=>({intent,reply,operations:[],...extra});
// Determinista para órdenes comunes; la IA resuelve las frases no cubiertas.
export function interpretLocal(text,cart,menu,lastId=null,context={}){
  const n=normalize(text);
  const category=navigation(text);
  if(category)return answer('menu','Aquí tienes las opciones.',{category});
  if(context.category==='Platos'&&/^(me apoyo|medio apoyo|medio de apoyo)$/.test(n))return answer('clarify','¿Te refieres a un medio pollo? Puedes decir «medio pollo».');
  if(/\b(alergia|alergico|celiaco|gluten)\b/.test(n)) return answer('clarify','Para confirmar ingredientes y alergias, consulte con el personal del restaurante.');
  if(/^(no|no gracias|no confirmes(?: todavia)?|no lo envies|todavia no|espera|espera un momento)$/.test(n)) return answer('keep','De acuerdo. Tu pedido sigue en borrador.');
  if(/^(eso es todo|termine(?: mi pedido)?|he terminado|listo|nada mas|ver (?:mi )?pedido|mi pedido|resumen)$/.test(n)) return answer('review',cart.length?'Revisemos tu pedido antes de enviarlo.':'Todavía no has agregado productos.');
  if(/^(cancelar|cancela|borra) (?:todo|el pedido|mi pedido)$/.test(n)) return answer('cancel','¿Quieres vaciar todo el borrador? Confírmalo con el botón de cancelar.');
  if(/^(gracias|hasta luego|chao|adios)$/.test(n)) return answer(cart.length?'review':'goodbye',cart.length?'Tienes un pedido pendiente. Vamos a revisarlo.':'Gracias por visitarnos. Aquí estaré cuando me necesites.');

  if(/\b(recomienda|recomiendas|recomendacion|que hay|que tienes)\b/.test(n)) return answer('recommend','Puedes probar el cuarto de pollo o un combo familiar.',{suggest_ids:['cuarto','combo-familiar']});
  const single=menu.find(p=>p.available&&[p.name,...p.aliases].some(a=>normalize(a).replace(/^(un|una) /,'')===n));
  if(single&&context.category===single.category)return answer('edit',`Va un ${single.name}.`,{operations:[{type:'add',id:single.id,qty:1}]});
  const hits=[]; let remaining=n;
  const aliases=menu.flatMap(p=>[p.name,...p.aliases].map(a=>({id:p.id,a:normalize(a).replace(/^(?:un|una|unas|unos|dos|tres) /,'')}))).sort((a,b)=>b.a.length-a.a.length);
  // Buscar primero la coincidencia más larga y no contar de nuevo sus subcadenas.
  for(const {id,a} of aliases){
    const re=new RegExp(`(^|\\s)(${a})(?=\\s|$)`,'g');
    remaining=remaining.replace(re,(full,prefix,word,offset)=>{hits.push({id,index:offset+prefix.length,length:word.length});return ' '.repeat(full.length);});
  }
  hits.sort((a,b)=>a.index-b.index);
  if(/\b(cuanto|precio|cuesta|cuestan)\b/.test(n)){
    if(!hits.length) return answer('clarify','¿De qué producto quieres saber el precio?');
    return answer('price',hits.map(h=>{const p=menu.find(p=>p.id===h.id);return `${p.name}: ${money(p.price)}.`;}).join(' '),{suggest_ids:[...new Set(hits.map(h=>h.id))]});
  }
  const note=n.match(/\bsin (cebolla|ensalada|papas|sal|tomate)\b/)?.[0];
  // Edición de acompañamiento: «sin papas» no añade un plato de papas.
  if(note&&!/\b(quiero|dame|agrega|agregame|ponme)\b/.test(n)){
    const id=cart.length===1?cart[0].id:lastId;
    if(!id||!cart.some(l=>l.id===id)) return answer('clarify','¿A qué producto aplico ese cambio?');
    if(!menu.find(p=>p.id===id).options.includes(note)) return answer('clarify','Esa opción no está definida para ese producto. Puedes consultarla con el personal.');
    return answer('edit',`Anotado: ${note}.`,{operations:[{type:'note',id,note}]});
  }
  const correction=n.match(/^(?:mejor|que sean|dejalo en) (\d+|uno|una|dos|tres|cuatro|cinco)$/);
  if(correction){const id=lastId||(cart.length===1?cart[0].id:null);return id?answer('edit','Cantidad actualizada.',{operations:[{type:'set',id,qty:count(correction[1])}]}):answer('clarify','¿De qué producto cambio la cantidad?');}
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
  return answer('edit',remove?'He actualizado tu pedido.':'Agregado. ¿Deseas algo más?',{operations});
}
