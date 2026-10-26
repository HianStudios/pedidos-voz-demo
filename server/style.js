// La voz de Milo: las respuestas que arma la app (rápidas y exactas) se dicen con personalidad.
// Un modelo pequeño y rápido reescribe la frase reaccionando a lo que dijo el cliente, sin tocar ningún dato:
// si cambia un producto, una cantidad, un precio o la pregunta, se descarta y queda la frase original.
import {menu as baseMenu} from './catalog.js';
import {normalize} from '../public/js/domain.js';

const persona=`Eres Milo, el mesero virtual de Brasa, una pollería de barrio en Ecuador. Eres una IA y lo sabes, pero hablas como el mejor mesero del local: cálido, con chispa, atento a todo lo que pasa en la mesa, nunca de memoria ni como menú leído.
Te paso lo que dijo el cliente y la RESPUESTA BASE (lo que ya se hizo). Reescríbela con tu voz:
- Reacciona a lo que dijo y a cómo lo dijo: si tiene hambre, si viene apurado, si habla de calle («oe ñaño»), si es para un grupo, si se corrige.
- Di con claridad lo que ya quedó hecho (anotado, quitado, cambiado) y conserva EXACTOS los productos, cantidades, ingredientes, precios y lo que se pregunta al final (puedes decir la pregunta con otras palabras, ofreciendo lo mismo).
- No inventes productos, precios, tiempos ni promociones. No agregues preguntas nuevas.
- Español de Ecuador, de tú, natural y breve: una o dos frases cortas. Toques como «¡De una!», «¡Buenazo!», «Tranquilo», «Ya mismo» con moderación. Sin emojis, listas ni comillas.
- No empieces siempre igual; evita «Claro», «Perfecto» y «Excelente elección».
Responde solo con la frase final.`;

const numbers=['uno','una','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','veinte'];
const products=(text,menu=baseMenu)=>{const n=` ${normalize(text)} `;return new Set(menu.filter(p=>[p.name,...(p.aliases||[])].some(a=>a.length>3&&n.includes(` ${normalize(a)} `))).map(p=>p.id));};
// Los datos de la respuesta base deben seguir ahí: precios, cantidades, productos, lo que se quita y la pregunta.
export function keepsFacts(base,styled,menu=baseMenu){
  if(!styled||styled.length>320||/[«»*#\[\]{}]/.test(styled))return false;
  const b=normalize(base),s=normalize(styled);
  const money=t=>(t.match(/\$\s?\d+(?:[.,]\d{2})?/g)||[]).map(x=>x.replace(/\s/g,'').replace('.',','));
  if(!money(base).every(m=>money(styled).includes(m)))return false;
  for(const w of numbers)if(new RegExp(`\\b${w}\\b`).test(b)&&!['uno','una'].includes(w)&&!new RegExp(`\\b${w}\\b`).test(s))return false;
  const pb=products(base,menu),ps=products(styled,menu);
  if(pb.size!==ps.size||[...pb].some(id=>!ps.has(id)))return false;
  for(const m of b.matchAll(/\bsin ([a-z]+)/g))if(!s.includes(`sin ${m[1]}`))return false;
  for(const w of ['no lleva','botella','con hielo','sin hielo'])if(b.includes(w)&&!s.includes(w.replace('no lleva','no'))) return false;
  if(/\?\s*$/.test(base.trim())!==/\?\s*$/.test(styled.trim()))return false;
  return true;
}
// Cupo de Groq lleno: la voz de Milo se pausa 90 s para no competir con lo que entiende el pedido
// (comparten cupo con el modelo de respaldo). Mientras tanto se responde con la frase base, sin esperar.
let limitedUntil=0;
export const markLimited=()=>{limitedUntil=Date.now()+90000;};
// Motivo de la última vez que no se usó la voz (solo para /api/eval).
export let styleSkip='';
export async function styleReply({said,reply,cart=[],history=[],fetchImpl,menu=baseMenu}){
  styleSkip='';
  // En las pruebas (fetch simulado) y sin clave, la frase queda como está.
  if(!process.env.GROQ_API_KEY||process.env.GROQ_STYLE==='off'||(fetchImpl&&fetchImpl!==globalThis.fetch))return null;
  if(Date.now()<limitedUntil){styleSkip='cupo de Groq lleno: voz en pausa';return null;}
  const order=cart.map(l=>{const p=menu.find(x=>x.id===l.id);return p?`${l.qty} ${p.name}${l.notes?.length?` (${l.notes.join(', ')})`:''}`:'';}).filter(Boolean).join('; ')||'vacío';
  const recent=(Array.isArray(history)?history:[]).slice(-3).filter(m=>typeof m?.content==='string').map(m=>`${m.role==='user'?'Cliente':'Milo'}: ${m.content.slice(0,160)}`).join('\n');
  // Modelo con cupo propio en Groq (no el de respaldo que entiende pedidos) y sin razonamiento: solo redacta.
  const model=process.env.GROQ_STYLE_MODEL||'qwen/qwen3.8-27b';
  const thinking=/^qwen\//.test(model)?{reasoning_effort:'none'}:/gpt-oss/.test(model)?{reasoning_effort:'low'}:{};
  try{
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,...thinking,temperature:.8,max_completion_tokens:400,messages:[{role:'system',content:persona},{role:'user',content:`${recent?`Conversación reciente:\n${recent}\n`:''}Pedido actual: ${order}\nEl cliente dijo: "${String(said).slice(0,300)}"\nRESPUESTA BASE: "${reply}"`}]}),
      signal:AbortSignal.timeout(Number(process.env.GROQ_STYLE_TIMEOUT)||1500)});
    if(response.status===429)markLimited();
    if(!response.ok){styleSkip=`proveedor ${response.status}: ${(await response.text().catch(()=>'')).slice(0,160)}`;return null;}
    // Qwen puede devolver su razonamiento entre <think>…</think>: nunca se dice en voz alta.
    const text=String((await response.json()).choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim().replace(/^["“]|["”]$/g,'').replace(/\s+/g,' ');
    if(keepsFacts(reply,text,menu))return text;
    styleSkip=`descartada: ${text.slice(0,200)}`;return null;
  }catch(e){styleSkip=`error: ${e.name}`;return null;}
}
