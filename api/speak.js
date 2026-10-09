import {endpoint,guard,body,rateLimit,fail} from '../server/http.js';
export const neuralVoice=()=>Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID);
// Voz neural opcional. Sin credenciales, el cliente usa la voz del navegador.
export default endpoint(async(req,res)=>{
  guard(req,['POST']);await rateLimit(req,'speak',120);
  if(!neuralVoice())throw fail('La voz neural no está configurada.',503);
  const {text}=await body(req,4000);
  if(typeof text!=='string'||!text.trim()||text.length>500)throw fail('Texto inválido.');
  let response;
  try{
    response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_64`,{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json',Accept:'audio/mpeg'},body:JSON.stringify({text,model_id:process.env.ELEVENLABS_MODEL||'eleven_flash_v2_5',language_code:'es',voice_settings:{stability:.45,similarity_boost:.8,style:.15,use_speaker_boost:true}}),signal:AbortSignal.timeout(10000)});
  }catch{throw fail('La voz neural no respondió.',502);}
  if(!response.ok)throw fail('La voz neural no respondió.',502);
  const audio=Buffer.from(await response.arrayBuffer());
  res.statusCode=200;res.setHeader('Content-Type','audio/mpeg');res.setHeader('Cache-Control','no-store');res.end(audio);
});
