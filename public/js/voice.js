import {speakable,sentences} from './speech-text.js';
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
export class VoiceController{
  constructor({onState,onLevel,onText,onInput,onError,onSentence,greeting}){Object.assign(this,{onState,onLevel,onText,onInput,onError,onSentence,greeting});this.rate=1.05;this.neural=false;this.enabled=false;this.generation=0;this.recognition=null;this.recorder=null;this.stream=null;this.speechDone=null;this.meter=0;this.level=0;this.activatePending=false;}
  state(value){this.mode=value;this.onState(value);}
  async enable(direct=false){
    if(this.activatePending)return;
    if(this.enabled){return this.call();}
    if(!navigator.mediaDevices?.getUserMedia){this.onError('Este navegador necesita HTTPS y permiso de micrófono. Puedes usar texto.');return;}
    this.activatePending=true;const token=++this.generation;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.enabled=true;
      const Context=window.AudioContext||window.webkitAudioContext;
      if(Context){this.context=new Context();await this.context.resume();this.analyser=this.context.createAnalyser();this.analyser.fftSize=1024;this.source=this.context.createMediaStreamSource(stream);this.source.connect(this.analyser);this.samples=new Float32Array(this.analyser.fftSize);this.measure();}
      if(token!==this.generation)return;
      if(direct)await this.call();else this.listen();
    }catch(e){if(token===this.generation){this.disable();this.onError(e.name==='NotAllowedError'?'Permite el micrófono en tu navegador o escribe tu pedido.':'No pude abrir el micrófono. Puedes continuar por texto.');}}
    finally{this.activatePending=false;}
  }
  measure(){
    if(!this.enabled||!this.analyser)return;
    this.analyser.getFloatTimeDomainData(this.samples);
    const rms=Math.sqrt(this.samples.reduce((s,v)=>s+v*v,0)/this.samples.length);
    this.rms=rms;this.level=this.level*.7+Math.min(1,rms*7)*.3;this.onLevel(this.mode==='listening'?this.level:0);
    this.meter=requestAnimationFrame(()=>this.measure());
  }
  pause(){
    this.generation++;clearTimeout(this.timer);clearTimeout(this.restart);clearInterval(this.vad);
    const recognition=this.recognition;this.recognition=null;if(recognition){recognition.onend=null;try{recognition.abort();}catch{}}
    const recorder=this.recorder;this.recorder=null;if(recorder?.state==='recording'){recorder.onstop=null;recorder.stop();}
    this.upload?.abort();this.upload=null;
    this.speechDone?.();this.speechDone=null;window.speechSynthesis?.cancel();try{this.playing?.stop();}catch{}this.playing=null;this.onLevel(0);
  }
  disable(){this.pause();this.enabled=false;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;cancelAnimationFrame(this.meter);this.source?.disconnect();this.context?.close().catch(()=>{});this.context=null;this.state('off');}
  wait(){if(!this.enabled)return;this.pause();this.state('waiting');}
  async call(){
    if(!this.enabled)return this.enable(true);
    this.pause();const token=this.generation+1;await this.say(this.greeting);if(this.enabled&&token===this.generation)this.listen();
  }
  listen(){if(!this.enabled)return;this.pause();this.state('listening');if(Recognition&&!this.nativeFailed)this.recognize('command');else this.record();}
  // Frase por frase: pausas naturales entre oraciones y la pantalla sigue lo que Milo dice.
  async say(text){
    this.pause();const token=this.generation;
    if(!this.enabled){this.state('off');return;}
    const parts=sentences(speakable(text));
    if(!parts.length||(!window.speechSynthesis&&!this.neural)){this.state('waiting');return;}
    this.state('speaking');
    let next=this.neural?this.fetchAudio(parts[0]):null;
    for(let i=0;i<parts.length;i++){
      const audio=next?await next:null;
      if(token!==this.generation)return;
      next=this.neural&&i+1<parts.length?this.fetchAudio(parts[i+1]):null;
      this.onSentence?.(parts[i],i);
      if(audio)await this.play(audio,token);else await this.utter(parts[i],token);
      if(token!==this.generation)return;
    }
    this.state('waiting');
  }
  // Voz neural del servidor (opcional). Si falla una vez, se usa la del navegador el resto de la sesión.
  async fetchAudio(text){
    if(!this.context)return null;
    try{
      const res=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(8000)});
      if(!res.ok)throw new Error();
      return await this.context.decodeAudioData(await res.arrayBuffer());
    }catch{this.neural=false;return null;}
  }
  play(buffer,token){
    return new Promise(resolve=>{
      if(token!==this.generation)return resolve();
      const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);this.playing=source;
      const done=()=>{if(this.speechDone===done)this.speechDone=null;if(this.playing===source)this.playing=null;resolve();};
      this.speechDone=done;source.onended=done;source.start();
    });
  }
  pickVoice(){
    const voices=window.speechSynthesis.getVoices().filter(v=>/^es/i.test(v.lang));
    const score=v=>(/natural|neural/i.test(v.name)?30:0)+(/online|premium|enhanced/i.test(v.name)?15:0)+(/google/i.test(v.name)?10:0)+(/^es-(EC|MX|US|CO|419|PE)/i.test(v.lang)?5:0);
    return voices.sort((a,b)=>score(b)-score(a))[0]||null;
  }
  utter(text,token){
    if(!window.speechSynthesis)return Promise.resolve();
    return new Promise(resolve=>{
      if(token!==this.generation)return resolve();
      const done=()=>{clearTimeout(this.speechTimer);if(this.speechDone===done)this.speechDone=null;resolve();};this.speechDone=done;
      const utterance=new SpeechSynthesisUtterance(text);utterance.lang='es-EC';utterance.rate=this.rate;utterance.pitch=1;
      utterance.voice=this.pickVoice();
      utterance.onend=done;utterance.onerror=done;this.speechTimer=setTimeout(()=>{speechSynthesis.cancel();done();},Math.max(8000,text.length*120));speechSynthesis.speak(utterance);
    });
  }
  async respond(text,next='listen'){
    const start=this.generation+1;await this.say(text);
    if(!this.enabled||this.generation!==start)return;
    if(next==='listen')this.listen();else this.wait();
  }
  recognize(kind){
    const token=this.generation;const rec=new Recognition();this.recognition=rec;rec.lang='es-EC';rec.interimResults=true;rec.continuous=false;let text='',finalText='',failed=false;
    rec.onresult=e=>{text=Array.from(e.results).map(r=>r[0].transcript).join(' ').trim();finalText=Array.from(e.results).filter(r=>r.isFinal).map(r=>r[0].transcript).join(' ').trim();if(kind==='command')this.onText(text);};
    rec.onerror=e=>{
      if(token!==this.generation)return;
      if(e.error==='aborted')return;
      if(e.error==='no-speech')return;
      failed=true;
      if(e.error==='not-allowed'||e.error==='service-not-allowed'){this.disable();this.onError('El reconocimiento de voz no tiene permiso. Usa texto o revisa los permisos.');}
      else{this.nativeFailed=true;this.pause();this.state('waiting');this.onError('El reconocimiento del navegador no respondió. Toca a Milo para grabar y transcribir.');}
    };
    rec.onend=()=>{
      clearTimeout(this.timer);if(token!==this.generation||failed||!this.enabled)return;this.recognition=null;text=finalText;
      if(text){this.state('thinking');this.onInput(text.replace(/^milo[\s,]+/i,''));}
      else{this.wait();this.onError('No escuché un pedido. Toca a Milo para continuar o escribe.');}
    };
    try{rec.start();if(kind==='command')this.timer=setTimeout(()=>{if(token===this.generation)try{rec.stop();}catch{}},25000);}
    catch{this.nativeFailed=true;this.state('waiting');this.onError('Toca a Milo para usar la grabación alternativa.');}
  }
  record(){
    const token=this.generation;
    if(!window.MediaRecorder||!this.stream){this.onError('No hay grabación compatible. Usa texto.');this.state('waiting');return;}
    const type=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    let recorder;try{recorder=new MediaRecorder(this.stream,type?{mimeType:type}:undefined);}catch{this.state('waiting');this.onError('No pude iniciar la grabación. Usa texto.');return;}
    this.recorder=recorder;const chunks=[];let hadVoice=false,lastVoice=Date.now(),started=Date.now();
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>{if(token===this.generation){this.pause();this.state('waiting');this.onError('Falló la grabación. Vuelve a tocar a Milo o escribe.');}};
    recorder.onstop=async()=>{
      clearInterval(this.vad);clearTimeout(this.timer);if(token!==this.generation)return;this.recorder=null;
      if(!hadVoice&&this.analyser){this.wait();this.onError('No detecté voz. Puedes intentar otra vez.');return;}
      const blob=new Blob(chunks,{type:recorder.mimeType});if(blob.size<500){this.wait();return;}
      this.state('transcribing');const form=new FormData();form.append('file',blob,recorder.mimeType.includes('mp4')?'pedido.m4a':recorder.mimeType.includes('ogg')?'pedido.ogg':'pedido.webm');
      const controller=new AbortController();this.upload=controller;
      try{const res=await fetch('/api/transcribe',{method:'POST',body:form,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});const data=await res.json();if(token!==this.generation)return;if(!res.ok)throw new Error(data.error||'No pude transcribir.');if(data.text?.trim()){this.onText(data.text);this.state('thinking');this.onInput(data.text);}else{this.wait();this.onError('No entendí el audio. Intenta de nuevo o escribe.');}}
      catch(e){if(token===this.generation){this.wait();this.onError(e.name==='TimeoutError'?'La transcripción tardó demasiado. Usa texto o intenta de nuevo.':e.message);}}
    };
    recorder.start();
    this.vad=setInterval(()=>{if(token!==this.generation)return;const now=Date.now();if((this.rms||0)>.018){hadVoice=true;lastVoice=now;}if((hadVoice&&now-lastVoice>900)||(!hadVoice&&now-started>8000&&this.analyser)){if(recorder.state==='recording')recorder.stop();}},100);
    this.timer=setTimeout(()=>{if(token===this.generation&&recorder.state==='recording')recorder.stop();},25000);
  }
  finish(){if(this.recorder?.state==='recording')this.recorder.stop();else if(this.recognition&&this.mode==='listening')try{this.recognition.stop();}catch{}else this.call();}
}
