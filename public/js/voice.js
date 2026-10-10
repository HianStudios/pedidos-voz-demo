import {speakable,chunks} from './speech-text.js';
import {isConfirmation} from './domain.js';
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
export class VoiceController{
  constructor({onState,onLevel,onText,onInput,onError,onSentence,greeting}){Object.assign(this,{onState,onLevel,onText,onInput,onError,onSentence,greeting});this.rate=1.2;this.neural=false;
    // En celulares el reconocedor del sistema pita en cada intento y choca con el micrófono ya abierto:
    // se graba y se transcribe en el servidor. La app lo activa solo si hay transcripción disponible.
    this.preferRecorder=false;this.neuralFailures=0;this.listenDelay=300;this.listenWindow=40000;this.startDelay=120;this.listenUntil=0;this.startFailures=0;this.voice=null;window.speechSynthesis?.addEventListener?.('voiceschanged',()=>{this.voice=null;});this.enabled=false;this.generation=0;this.recognition=null;this.recorder=null;this.stream=null;this.speechDone=null;this.meter=0;this.level=0;this.activatePending=false;}
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
    clearTimeout(this.startTimer);this.speechDone?.();this.speechDone=null;window.speechSynthesis?.cancel();try{this.playing?.stop();}catch{}this.playing=null;this.onLevel(0);
  }
  disable(){this.pause();this.enabled=false;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;cancelAnimationFrame(this.meter);this.source?.disconnect();this.context?.close().catch(()=>{});this.context=null;this.state('off');}
  wait(){if(!this.enabled)return;this.pause();this.state('waiting');}
  async call(){
    if(!this.enabled)return this.enable(true);
    this.pause();const token=this.generation+1;await this.say(this.greeting);if(this.enabled&&token===this.generation)this.listen();
  }
  // Escucha en ventana: si el navegador cierra el micrófono sin captar una frase (silencio, ruido,
  // corte de Chrome), se vuelve a abrir solo hasta listenWindow ms; no hay que tocar a Milo de nuevo.
  listen(restart=false){
    if(!this.enabled)return;this.pause();this.state('listening');
    if(!restart){this.listenUntil=Date.now()+this.listenWindow;this.cue();}
    const token=this.generation,start=()=>{if(token!==this.generation)return;if(Recognition&&!this.nativeFailed&&!this.preferRecorder)this.recognize('command');else this.record();};
    // Pequeña espera: Chrome rechaza a veces un start() pegado al anterior o al tono.
    if(this.startDelay)this.restart=setTimeout(start,restart?this.startDelay+30:this.startDelay);else start();
  }
  relisten(message){
    if(!this.enabled)return;
    if(Date.now()<this.listenUntil){this.listen(true);return;}
    this.wait();this.onError(message||'Toca a Milo cuando quieras seguir.');
  }
  // Tono corto y suave: avisa que el micrófono está abierto.
  cue(){
    const ctx=this.context;if(!ctx||!ctx.createOscillator)return;
    try{const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;osc.type='sine';osc.frequency.setValueAtTime(880,t);osc.frequency.linearRampToValueAtTime(1320,t+.08);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.05,t+.02);gain.gain.linearRampToValueAtTime(0,t+.12);osc.connect(gain).connect(ctx.destination);osc.start(t);osc.stop(t+.13);}catch{}
  }
  // Frase por frase: pausas naturales y la pantalla sigue lo que Milo dice.
  // onSentence recibe el texto visible y la duración (real o estimada) para sincronizar el menú.
  async say(text){
    this.pause();const token=this.generation;
    if(!this.enabled){this.state('off');return;}
    const parts=chunks(text).map(shown=>({shown,spoken:speakable(shown)})).filter(p=>p.spoken);
    if(!parts.length||(!window.speechSynthesis&&!this.neural)){this.state('waiting');return;}
    this.state('speaking');
    let next=this.neural?this.fetchAudio(parts[0].spoken):null;
    for(let i=0;i<parts.length;i++){
      const audio=next?await next:null;
      if(token!==this.generation)return;
      next=this.neural&&i+1<parts.length?this.fetchAudio(parts[i+1].spoken):null;
      this.onSentence?.(parts[i].shown,audio?audio.duration*1000:parts[i].spoken.length*62/this.rate);
      if(audio)await this.play(audio,token);else await this.utter(parts[i].spoken,token);
      if(token!==this.generation)return;
    }
    this.state('waiting');
  }
  // Voz neural del servidor (opcional). Una falla aislada usa la voz del navegador para esa frase;
  // dos seguidas la desactivan para no alternar voces durante la sesión.
  async fetchAudio(text){
    if(!this.context)return null;
    try{
      const res=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(8000)});
      if(!res.ok)throw new Error();
      const audio=await this.context.decodeAudioData(await res.arrayBuffer());this.neuralFailures=0;return audio;
    }catch{if(++this.neuralFailures>=2)this.neural=false;return null;}
  }
  play(buffer,token){
    return new Promise(resolve=>{
      if(token!==this.generation)return resolve();
      if(this.context.state==='suspended')this.context.resume().catch(()=>{});
      const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);this.playing=source;
      const done=()=>{if(this.speechDone===done)this.speechDone=null;if(this.playing===source)this.playing=null;resolve();};
      this.speechDone=done;source.onended=done;source.start();
    });
  }
  // Se elige una sola voz y se conserva: cambiar de voz entre frases suena a fallo.
  pickVoice(){
    if(this.voice)return this.voice;
    const voices=window.speechSynthesis.getVoices?.().filter(v=>/^es/i.test(v.lang))||[];
    const score=v=>(/natural|neural/i.test(v.name)?30:0)+(/online|premium|enhanced/i.test(v.name)?15:0)+(/google/i.test(v.name)?10:0)+(/^es-EC/i.test(v.lang)?12:/^es-(MX|US|CO|419|PE)/i.test(v.lang)?5:0);
    this.voice=voices.sort((a,b)=>score(b)-score(a))[0]||null;
    return this.voice;
  }
  async utter(text,token){
    const synth=window.speechSynthesis;if(!synth)return;
    // Chrome descarta a veces una locución pedida justo después de cancel() o queda en pausa.
    if(synth.speaking||synth.pending){synth.cancel();await new Promise(r=>setTimeout(r,60));}
    if(token!==this.generation)return;
    synth.resume?.();
    return new Promise(resolve=>{
      let started=false;
      const done=()=>{clearTimeout(this.speechTimer);clearTimeout(this.startTimer);if(this.speechDone===done)this.speechDone=null;resolve();};this.speechDone=done;
      const utterance=new SpeechSynthesisUtterance(text);utterance.lang=this.pickVoice()?.lang||'es-EC';utterance.rate=this.rate;utterance.pitch=1;
      utterance.voice=this.pickVoice();
      utterance.onstart=()=>{started=true;};utterance.onend=done;utterance.onerror=done;
      // Si el motor no arranca, no dejar a Milo «hablando» en silencio.
      this.startTimer=setTimeout(()=>{if(!started){synth.cancel();done();}},3500);
      this.speechTimer=setTimeout(()=>{synth.cancel();done();},Math.max(8000,text.length*120));synth.speak(utterance);
    });
  }
  async respond(text,next='listen'){
    const start=this.generation+1;await this.say(text);
    if(!this.enabled||this.generation!==start)return;
    // Pausa breve: el micrófono no capta el final de la propia voz de Milo.
    if(next==='listen'&&this.listenDelay)await new Promise(r=>setTimeout(r,this.listenDelay));
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
      if(e.error==='not-allowed'){this.disable();this.onError('El reconocimiento de voz no tiene permiso. Usa texto o revisa los permisos.');}
      // Red, micrófono ocupado u otro fallo del reconocedor: se pasa sola a grabar y transcribir.
      else{this.nativeFailed=true;this.listen(true);}
    };
    rec.onend=()=>{
      clearTimeout(this.timer);if(token!==this.generation||failed||!this.enabled)return;this.recognition=null;
      // Chrome/Edge a veces cierran sin marcar el resultado como final («cinco»). Se acepta lo oído,
      // salvo una confirmación provisional: un «sí» a medias nunca debe enviar ni aceptar nada.
      const heard=finalText||(text&&!isConfirmation(text)?text:'');
      if(heard){this.state('thinking');this.onInput(heard.replace(/^milo[\s,]+/i,''));}
      else this.relisten();
    };
    try{rec.start();this.startFailures=0;if(kind==='command')this.timer=setTimeout(()=>{if(token===this.generation)try{rec.stop();}catch{}},25000);}
    catch{this.recognition=null;if(++this.startFailures>=2)this.nativeFailed=true;this.listen(true);}
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
      if(!hadVoice&&this.analyser){this.relisten();return;}
      const blob=new Blob(chunks,{type:recorder.mimeType});if(blob.size<500){this.relisten();return;}
      this.state('transcribing');const form=new FormData();form.append('file',blob,recorder.mimeType.includes('mp4')?'pedido.m4a':recorder.mimeType.includes('ogg')?'pedido.ogg':'pedido.webm');
      const controller=new AbortController();this.upload=controller;
      try{const res=await fetch('/api/transcribe',{method:'POST',body:form,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});const data=await res.json();if(token!==this.generation)return;if(!res.ok)throw new Error(data.error||'No pude transcribir.');if(data.text?.trim()){this.onText(data.text);this.state('thinking');this.onInput(data.text);}else this.relisten('No entendí el audio. Toca a Milo para intentarlo otra vez.');}
      catch(e){if(token===this.generation){this.wait();this.onError(e.name==='TimeoutError'?'La transcripción tardó demasiado. Usa texto o intenta de nuevo.':e.message);}}
    };
    recorder.start();
    // Detección de voz adaptada al ruido del lugar: se mide el ambiente unos instantes (después del tono)
    // y se exige voz por encima de ese nivel durante 2 lecturas seguidas.
    let noise=0,samples=0,loud=0,threshold=.018;
    this.vad=setInterval(()=>{
      if(token!==this.generation)return;const now=Date.now(),rms=this.rms||0,age=now-started;
      if(age<250)return;
      if(age<600&&!hadVoice){noise+=rms;samples++;threshold=Math.min(.06,Math.max(.012,(noise/samples)*2.5));return;}
      if(rms>threshold){if(++loud>=2){hadVoice=true;lastVoice=now;}}else loud=0;
      if((hadVoice&&now-lastVoice>1000)||(!hadVoice&&age>8000&&this.analyser)){if(recorder.state==='recording')recorder.stop();}
    },100);
    this.timer=setTimeout(()=>{if(token===this.generation&&recorder.state==='recording')recorder.stop();},25000);
  }
  finish(){if(this.recorder?.state==='recording')this.recorder.stop();else if(this.recognition&&this.mode==='listening')try{this.recognition.stop();}catch{}else this.call();}
}
