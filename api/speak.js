import {endpoint,guard,body,rateLimit,fail} from '../server/http.js';
// Voz neural opcional. Azure primero (voces de Ecuador, menor costo); ElevenLabs como alternativa.
// Sin credenciales, el cliente usa la voz del navegador.
const azure=()=>Boolean(process.env.AZURE_SPEECH_KEY&&process.env.AZURE_SPEECH_REGION);
const eleven=()=>Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ELEVENLABS_VOICE_ID);
export const neuralVoice=()=>azure()||eleven();
const xml=s=>s.replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
function azureRequest(text){
  const voice=process.env.AZURE_SPEECH_VOICE||'es-EC-AndreaNeural';
  const lang=voice.split('-').slice(0,2).join('-');
  return fetch(`https://${encodeURIComponent(process.env.AZURE_SPEECH_REGION)}.tts.speech.microsoft.com/cognitiveservices/v1`,{method:'POST',headers:{'Ocp-Apim-Subscription-Key':process.env.AZURE_SPEECH_KEY,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'audio-24khz-48kbitrate-mono-mp3','User-Agent':'milo-mesero'},
    body:`<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${xml(voice)}"><prosody rate="${xml(process.env.AZURE_SPEECH_RATE||'+12%')}">${xml(text)}</prosody></voice></speak>`,signal:AbortSignal.timeout(10000)});
}
function elevenRequest(text){
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_64`,{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json',Accept:'audio/mpeg'},body:JSON.stringify({text,model_id:process.env.ELEVENLABS_MODEL||'eleven_flash_v2_5',language_code:'es',voice_settings:{stability:.45,similarity_boost:.8,style:.15,use_speaker_boost:true}}),signal:AbortSignal.timeout(10000)});
}
export default endpoint(async(req,res)=>{
  guard(req,['POST']);await rateLimit(req,'speak',120);
  if(!neuralVoice())throw fail('La voz neural no está configurada.',503);
  const {text}=await body(req,4000);
  if(typeof text!=='string'||!text.trim()||text.length>500)throw fail('Texto inválido.');
  let response;
  try{response=await (azure()?azureRequest(text):elevenRequest(text));}catch{throw fail('La voz neural no respondió.',502);}
  if(!response.ok){console.warn('speak: proveedor respondió',response.status);throw fail('La voz neural no respondió.',502);}
  const audio=Buffer.from(await response.arrayBuffer());
  res.statusCode=200;res.setHeader('Content-Type','audio/mpeg');res.setHeader('Cache-Control','no-store');res.end(audio);
});
