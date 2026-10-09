import test from 'node:test';
import assert from 'node:assert/strict';
class Recognition{start(){this.started=true;}abort(){this.aborted=true;}stop(){this.onend?.();}}
let utterances=[];
globalThis.window={SpeechRecognition:Recognition,speechSynthesis:{cancel(){},getVoices(){return [];},speak(u){utterances.push(u);}}};
globalThis.speechSynthesis=window.speechSynthesis;
globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
globalThis.cancelAnimationFrame=()=>{};
const {VoiceController}=await import('../public/js/voice.js');
function setup(){let inputs=[],states=[],errors=[];const voice=new VoiceController({greeting:'Dígame',onState:s=>states.push(s),onLevel(){},onText(){},onInput:s=>inputs.push(s),onError:s=>errors.push(s)});voice.enabled=true;voice.listenDelay=0;voice.startDelay=0;return {voice,inputs,states,errors};}
test('la sesión escucha un pedido sin exigir palabra de activación',()=>{
  const {voice,inputs}=setup();voice.listen();const rec=voice.recognition;const result=[{transcript:'dame dos cuartos de pollo'}];result.isFinal=true;rec.onresult({results:[result]});rec.onend();assert.deepEqual(inputs,['dame dos cuartos de pollo']);voice.disable();
});
test('texto provisional nunca se procesa como confirmación',()=>{
  const {voice,inputs}=setup();voice.listen();const rec=voice.recognition;const result=[{transcript:'sí'}];result.isFinal=false;rec.onresult({results:[result]});rec.onend();assert.deepEqual(inputs,[]);voice.disable();
});
test('callbacks de un reconocimiento cancelado no crean otro pedido',()=>{
  const {voice,inputs}=setup();voice.listen();const rec=voice.recognition;const callback=rec.onend;const result=[{transcript:'dos pollos'}];result.isFinal=true;rec.onresult({results:[result]});voice.disable();callback();assert.deepEqual(inputs,[]);assert.equal(voice.mode,'off');
});
test('interrumpir saludo no abre después un micrófono obsoleto',async()=>{
  const {voice}=setup();const task=voice.call();assert.equal(voice.mode,'speaking');voice.pause();await task;assert.equal(voice.recognition,null);voice.disable();
});
test('desactivar libera el micrófono y cancela locución',async()=>{
  const {voice}=setup();let stopped=0;voice.stream={getTracks:()=>[{stop(){stopped++;}}]};const speaking=voice.respond('Hola');voice.disable();await speaking;assert.equal(stopped,1);assert.equal(voice.mode,'off');assert.equal(voice.enabled,false);
});

test('voz más ágil sin locuciones superpuestas',async()=>{
 const {voice}=setup();const first=voice.respond('Primera respuesta');const second=voice.respond('Respuesta vigente');assert.equal(utterances.at(-1).rate,1.05);utterances.at(-1).onend();await Promise.all([first,second]);assert.equal(voice.mode,'listening');voice.disable();
});
test('espera no activa escucha de nombres',()=>{const {voice}=setup();voice.wait();assert.equal(voice.recognition,null);assert.equal(voice.mode,'waiting');voice.disable();});

test('si no capta nada, vuelve a escuchar solo dentro de la ventana',()=>{
  const {voice,inputs}=setup();voice.listen();const first=voice.recognition;first.onend();
  assert.notEqual(voice.recognition,first,'abre otra escucha sin tocar a Milo');assert.equal(voice.mode,'listening');
  const result=[{transcript:'muéstrame los extras'}];result.isFinal=true;voice.recognition.onresult({results:[result]});voice.recognition.onend();
  assert.deepEqual(inputs,['muéstrame los extras']);
  voice.listen();voice.listenUntil=0;voice.recognition.onend();assert.equal(voice.mode,'waiting','pasada la ventana espera un toque');voice.disable();
});
test('frase provisional de varias palabras se acepta si Chrome no la marca final',()=>{
  const {voice,inputs}=setup();voice.listen();const result=[{transcript:'muéstrame los extras'}];result.isFinal=false;voice.recognition.onresult({results:[result]});voice.recognition.onend();assert.deepEqual(inputs,['muéstrame los extras']);voice.disable();
});
test('un fallo del reconocedor pasa a grabación sin pedir toque',()=>{
  const {voice}=setup();let recorded=0;voice.record=()=>{recorded++;};voice.listen();voice.recognition.onerror({error:'network'});assert.equal(voice.nativeFailed,true);assert.equal(recorded,1);assert.equal(voice.mode,'listening');voice.disable();
});
test('una palabra provisional se acepta, salvo un «sí»',()=>{
 const {voice,inputs}=setup();for(const word of ['cinco','sí']){voice.listen();const result=[{transcript:word}];result.isFinal=false;voice.recognition.onresult({results:[result]});voice.recognition.onend();}
 assert.deepEqual(inputs,['cinco']);voice.disable();
});
