import test from 'node:test';
import assert from 'node:assert/strict';
class Recognition{start(){this.started=true;}abort(){this.aborted=true;}stop(){this.onend?.();}}
let utterances=[];
globalThis.window={SpeechRecognition:Recognition,speechSynthesis:{cancel(){},getVoices(){return [];},speak(u){utterances.push(u);}}};
globalThis.speechSynthesis=window.speechSynthesis;
globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
globalThis.cancelAnimationFrame=()=>{};
const {VoiceController}=await import('../public/js/voice.js');
function setup(){let inputs=[],states=[],errors=[];const voice=new VoiceController({greeting:'Dígame',onState:s=>states.push(s),onLevel(){},onText(){},onInput:s=>inputs.push(s),onError:s=>errors.push(s)});voice.enabled=true;return {voice,inputs,states,errors};}
test('milo conserva el pedido en la misma frase',()=>{
  const {voice,inputs}=setup();voice.wait();const rec=voice.recognition;const result=[{transcript:'milo, dame dos cuartos de pollo'}];result.isFinal=true;rec.onresult({results:[result]});rec.onend();assert.deepEqual(inputs,['dame dos cuartos de pollo']);voice.disable();
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
