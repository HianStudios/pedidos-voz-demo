// El cerebro de Milo: responde preguntas sobre la comida, el restaurante y lo que el cliente necesita
// saber, usando qwen (cupo propio en Groq). Solo se llama cuando la pregunta no se puede resolver con
// los datos del menú y no es un pedido. Respuesta corta (1-2 frases), con personalidad de mesero.
import {normalize} from '../public/js/domain.js';
import {markLimited} from './style.js';

const persona=`Eres Milo, mesero virtual de Brasa, una pollería de barrio en Ecuador. Eres una IA y lo sabes.
Habla como el mejor mesero del local: cálido, con chispa, breve pero útil. Español de Ecuador, de tú.
Brasa es una pollería que asa pollo al carbón. La especialidad es el pollo a la brasa con papas doradas y ensalada fresca. Los combos traen gaseosa incluida. Las alitas van en salsa BBQ. La pechuga es a la plancha.
Puedes razonar sobre la comida: comparar platos, recomendar según apetito o grupo, explicar qué incluye un combo, sugerir acompañamientos. Usa los datos de los productos que te paso.
No inventes precios, ingredientes ni tiempos de preparación que no estén en la lista.
Si no sabes algo, dilo con naturalidad y sugiere preguntar al personal.
No anotes ni modifiques pedidos: solo contestas la pregunta. Sin emojis ni listas.
Responde en 1-3 frases. Si puedes dar una recomendación concreta, hazlo.`;

export async function askBrain({said,menu,cart=[],history=[],focus,shown}){
  if(!process.env.GROQ_API_KEY||process.env.GROQ_BRAIN==='off')return null;
  const relevant=findRelevant(said,menu,focus,shown);
  const productInfo=relevant.map(p=>
    `${p.name} ($${(p.price/100).toFixed(2)}) — Trae: ${(p.ingredients||[]).join(', ')}${p.options?.length?` — Se puede quitar: ${p.options.map(o=>o.replace(/^sin /,'')).join(', ')}`:''}${p.serve?` — Servir: ${p.serve.join(', ')}`:''}${p.available===false?' [AGOTADO]':''}`
  ).join('\n');
  const order=cart.map(l=>{const p=menu.find(x=>x.id===l.id);return p?`${l.qty} ${p.name}${l.notes?.length?` (${l.notes.join(', ')})`:''}`:'';}).filter(Boolean).join('; ')||'vacío';
  const recent=(Array.isArray(history)?history:[]).slice(-3).filter(m=>typeof m?.content==='string').map(m=>`${m.role==='user'?'Cliente':'Milo'}: ${m.content.slice(0,160)}`).join('\n');
  const model=process.env.GROQ_BRAIN_MODEL||process.env.GROQ_STYLE_MODEL||'qwen/qwen3.8-27b';
  const thinking=/^qwen\//.test(model)?{reasoning_effort:'low'}:/gpt-oss/.test(model)?{reasoning_effort:'low'}:{};
  try{
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,...thinking,temperature:0.7,max_completion_tokens:400,messages:[{role:'system',content:persona},{role:'user',content:`${recent?`Conversación:\n${recent}\n`:''}Pedido actual: ${order}\nProductos del menú:\n${productInfo}\n\nEl cliente pregunta: "${String(said).slice(0,300)}"`}]}),
      signal:AbortSignal.timeout(Number(process.env.GROQ_BRAIN_TIMEOUT)||3500)});
    if(response.status===429){markLimited();return null;}
    if(!response.ok)return null;
    const text=String((await response.json()).choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').replace(/<think>[\s\S]*/g,'').trim().replace(/^[""]|[""]$/g,'').replace(/\s+/g,' ');
    if(!text||text.length>500)return null;
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
