import {endpoint,guard,json,rawBody,rateLimit,fail} from '../server/http.js';
import {menu,restaurant} from '../server/catalog.js';
export const config={api:{bodyParser:false}};
export default endpoint(async(req,res)=>{
  guard(req,['POST']);await rateLimit(req,'transcribe',40);
  if(!process.env.GROQ_API_KEY)throw fail('La transcripción no está configurada. Usa texto o el menú.',503);
  const type=req.headers['content-type']||'';
  if(!type.startsWith('multipart/form-data;'))throw fail('Se requiere un archivo de audio.');
  const raw=await rawBody(req,3500000);
  let form;try{form=await new Request('http://localhost/upload',{method:'POST',headers:{'Content-Type':type},body:raw}).formData();}catch{throw fail('Audio inválido.');}
  const file=form.get('file');
  if(!file||typeof file.arrayBuffer!=='function'||file.size<500||file.size>3000000||!/^audio\/(webm|mp4|ogg|wav|mpeg)(;|$)/.test(file.type))throw fail('Formato o tamaño de audio inválido.');
  const outgoing=new FormData();outgoing.append('file',file);outgoing.append('model','whisper-large-v3');outgoing.append('language','es');outgoing.append('response_format','verbose_json');
  // Vocabulario del local: mejora marcas y platos («Sprite», «combo familiar», «sin cebolla»).
  outgoing.append('prompt',`Pedido en ${restaurant.name}. Menú de platos, combos, extras y bebidas: ${menu.map(p=>p.name).join(', ')}. Sin cebolla, sin papas. ¿Para cuántos? Para dos.`);
  try{
    const response=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`},body:outgoing,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Provider failed');const result=await response.json();
    const silent=result.segments?.length&&result.segments.every(s=>s.no_speech_prob>0.8);
    const text=String(result.text||'').trim();
    // Frases que Whisper «inventa» con ruido o silencio en español.
    const phantom=/subt[ií]tul|amara\.org|gracias por ver|suscr[ií]b|^\W*$/i.test(text);
    json(res,200,{text:silent||phantom?'':text.slice(0,1200)});
  }catch{throw fail('No pude transcribir el audio. Puedes escribir tu pedido.',502);}
});
