// El cerebro de Milo: responde preguntas sobre la comida, el restaurante y lo que el cliente necesita
// saber, usando qwen (cupo propio en Groq). Solo se llama cuando la pregunta no se puede resolver con
// los datos del menú y no es un pedido. Respuesta corta (1-2 frases), con personalidad de mesero.
import {normalize} from '../public/js/domain.js';
import {markLimited} from './style.js';

const persona=`Eres Milo, mesero virtual de Brasa, una pollería de Ecuador. Conversas con naturalidad: atento, directo, sin frases acartonadas ni elogios repetitivos. Tutéale con respeto al cliente. Habla como en una mesa, no como un manual.
Tu tarea aquí es EXPLICAR y RECOMENDAR, no modificar ni confirmar pedidos. El carrito que recibes es la única verdad: no presupongas compras anteriores. No digas que has anotado algo.
Responde lo preguntado primero. Normalmente una o dos frases (máximo 45 palabras); si necesitas aclarar algo, una sola pregunta breve. No hagas listas largas, no uses emojis ni menciones modelos, prompts o datos técnicos.
Usa EXCLUSIVAMENTE los productos, precios, ingredientes, opciones y disponibilidad proporcionados en el mensaje. Brasa sirve pollo a la brasa; no inventes promociones, ingredientes, preparación, tiempos de espera, horarios, puntos de venta ni políticas de pago. Si falta información, responde que el personal puede confirmarla.
Si preguntan por alergias, gluten, contaminación cruzada u otra restricción alimentaria, NO garantices que un plato sea seguro; solicita confirmación del personal.
Si el cliente pide algo ligero, más económico, picante, abundante o para varias personas, razona a partir de los productos y precios disponibles; pregunta por presupuesto o personas solo cuando sea imprescindible. Una recomendación no constituye un pedido.
Si se habla de un producto agotado, indícalo antes de recomendar. Nunca recomiendes uno agotado como disponible.
Distingue preguntas de compra: «qué trae», «vale la pena», «cuánto cuesta», «qué me recomiendas» no agregan al carrito.
Si un cliente pregunta quién eres, reconoce que eres Milo, el mesero virtual. No finjas ser una persona.
Responde en español latinoamericano natural, adecuado a Ecuador.`;

export async function askBrain({said,menu,cart=[],history=[],focus,shown}){
  if(!process.env.GROQ_API_KEY||process.env.GROQ_BRAIN==='off')return null;
  const relevant=findRelevant(said,menu,focus,shown);
  const productInfo=relevant.map(p=>
    `${p.name} ($${(p.price/100).toFixed(2)}) — Trae: ${(p.ingredients||[]).join(', ')}${p.options?.length?` — Se puede quitar: ${p.options.map(o=>o.replace(/^sin /,'')).join(', ')}`:''}${p.serve?` — Servir: ${p.serve.join(', ')}`:''}${p.available===false?' [AGOTADO]':''}`
  ).join('\n');
  const order=cart.map(l=>{const p=menu.find(x=>x.id===l.id);return p?`${l.qty} ${p.name}${l.notes?.length?` (${l.notes.join(', ')})`:''}`:'';}).filter(Boolean).join('; ')||'vacío';
  const recent=(Array.isArray(history)?history:[]).slice(-5).filter(m=>typeof m?.content==='string').map(m=>`${m.role==='user'?'Cliente':'Milo'}: ${m.content.slice(0,160)}`).join('\n');
  const model=process.env.GROQ_BRAIN_MODEL||process.env.GROQ_STYLE_MODEL||'qwen/qwen3.8-27b';
  const needsReasoning=/compar|cuantos|cuántos|alerg|intoler|recomend|presupuesto|rinde|alcanz|mejor para|diferenc/i.test(said);
  const thinking=/^qwen\//.test(model)?{reasoning_effort:needsReasoning?'low':'none'}:/gpt-oss/.test(model)?{reasoning_effort:'low'}:{};
  try{
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,...thinking,temperature:0.35,max_completion_tokens:220,messages:[{role:'system',content:persona},{role:'user',content:`${recent?`Conversación:\n${recent}\n`:''}Pedido actual: ${order}\nProductos del menú:\n${productInfo}\n\nEl cliente pregunta: "${String(said).slice(0,300)}"`}]}),
      signal:AbortSignal.timeout(Number(process.env.GROQ_BRAIN_TIMEOUT)||4200)});
    if(response.status===429){markLimited();return null;}
    if(!response.ok)return null;
    const text=String((await response.json()).choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').replace(/<think>[\s\S]*/g,'').trim().replace(/^["“]|["”]$/g,'').replace(/\s+/g,' ');
    if(!text||text.length>360)return null;
    const ids=[...new Set(relevant.filter(p=>normalize(text).includes(normalize(p.name).split(' ')[0])).map(p=>p.id))].slice(0,3);
    return {reply:text,suggest_ids:ids};
  }catch{return null;}
}

function findRelevant(text,menu,focus,shown){
  const n=normalize(text);
  const named=menu.filter(p=>p.category!=='Mesa'&&[p.name,...(p.aliases||[])].some(a=>a.length>2&&n.includes(normalize(a).replace(/^(un|una|unas|unos) /,''))));
  if(named.length)return named.slice(0,5);
  if(focus){const p=menu.find(x=>x.id===focus);if(p)return [p];}
  if(shown?.length){const ps=shown.map(id=>menu.find(x=>x.id===id)).filter(Boolean);if(ps.length)return ps.slice(0,5);}
  return menu.filter(p=>p.available&&p.category!=='Mesa').slice(0,12);
}
