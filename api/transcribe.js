import {endpoint,guard,json,rawBody,rateLimit,fail} from '../server/http.js';
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
  // Una frase de ejemplo y no la lista del menú: Whisper a veces «repite» palabras sueltas del prompt al final
  // de un audio con ruido o silencio (así llegó un «agua mineral» que nadie pidió).
  outgoing.append('prompt','Cliente en una pollería: Muéstrame los platos y los combos. Quiero un cuarto de pollo sin cebolla, alitas BBQ y una Sprite.');
  try{
    let response;
    // Un fallo temporal de Groq no debe perder inmediatamente una frase grabada.
    // Dos intentos de hasta 10 s mantienen la operación dentro del límite del cliente (25 s).
    for(let attempt=0;attempt<2;attempt++){
      try{
        response=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{
          method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`},
          body:outgoing,signal:AbortSignal.timeout(10000)
        });
      }catch(e){
        if(attempt===0&&['TimeoutError','AbortError','TypeError'].includes(e.name))continue;
        console.error('Transcribe upstream network:',e.name);
        throw fail('No hay conexión con el servicio de voz. Intenta nuevamente.',503);
      }
      if(response.ok)break;
      const code=response.status;
      // No registrar el audio, claves ni el texto del cliente en logs.
      console.error('Transcribe upstream status:',code);
      if(code===401||code===403)throw fail('El servicio de voz necesita revisar su configuración. Usa texto por ahora.',503);
      if(code===429)throw fail('El servicio de voz está saturado. Espera unos segundos y vuelve a intentarlo.',429);
      if(attempt===0&&[500,502,503,504].includes(code))continue;
      if(code===400||code===413||code===415||code===422)throw fail('El servicio de voz rechazó el formato del audio. Vuelve a intentarlo.',502);
      throw fail('El servicio de transcripción no respondió correctamente. Intenta nuevamente.',502);
    }
    const result=await response.json();
    // Varias voces en la mesa: los tramos que Whisper oyó con poca confianza (otra persona lejos, ruido) o que
    // parecen inventados se descartan; si no queda ninguno, se usa el texto completo.
    const segs=Array.isArray(result.segments)?result.segments:[];
    const clear=segs.filter(s=>!(s.no_speech_prob>.6&&s.avg_logprob<-.7)&&!(s.avg_logprob<-1.1)&&!(s.compression_ratio>2.4));
    const text=String(segs.length>1&&clear.length&&clear.length<segs.length?clear.map(s=>s.text).join(' '):result.text||'').replace(/\s+/g,' ').trim();
    // Respuestas cortas («Sí.», «Sí, gracias.», «Cinco.») suelen venir con no_speech_prob alto aunque sí se dijeron;
    // descartarlas dejaba a Milo esperando frente al resumen. El micrófono ya comprobó que hubo voz.
    // «Gracias.» sola no entra: es lo que Whisper más inventa con ruido, y frente al resumen enviaría el pedido.
    const short=/^(?:s[ií]|no|ya|listo|dale|ok|okey|claro|s[ií],? gracias|perfecto|bueno|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+)[.!¡¿?,\s]*$/i.test(text);
    const silent=!short&&result.segments?.length&&result.segments.every(s=>s.no_speech_prob>0.8);
    // Frases que Whisper «inventa» con ruido o silencio en español.
    const phantom=/subt[ií]tul|amara\.org|gracias por ver|suscr[ií]b|^\W*$/i.test(text);
    json(res,200,{text:silent||phantom?'':text.slice(0,1200)});
  }catch(e){
    if(e.status)throw e;
    console.error('Transcribe result processing:',e.name);
    throw fail('No pude procesar la respuesta del servicio de voz. Intenta nuevamente.',502);
  }
});
