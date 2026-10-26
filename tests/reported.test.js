// Casos que salieron en pruebas reales con el dueño.
import test from 'node:test';
import assert from 'node:assert/strict';
import {menu} from '../server/catalog.js';
import {applyOperations,unavailableRemovals} from '../public/js/domain.js';
const {interpret}=await import('../api/match.js');
const local=async(transcript,cart=[],extra={})=>{const key=process.env.GROQ_API_KEY;delete process.env.GROQ_API_KEY;try{return await interpret({transcript,cart,...extra});}finally{if(key)process.env.GROQ_API_KEY=key;}};
test('quitar algo que el combo no trae: Milo dice claro que va tal cual',async()=>{
  const order=await local('quiero cuatro combos de alitas, cuatro combos de pechuga y dos personales');
  assert.deepEqual(order.operations.map(o=>[o.id,o.qty]),[['combo-alitas',4],['combo-pechuga',4],['combo-personal',2]]);
  const cart=applyOperations([],order.operations,menu);
  const r=await local('a los combos de pechuga quítale el ají',cart);
  assert.equal(r.operations.length,0);assert.match(r.reply,/combo pechuga no lleva ají, así que va tal cual/);
  assert.deepEqual(unavailableRemovals('cuatro combos de pechuga sin ají y dos personales sin cebolla',menu),[{id:'combo-pechuga',ingredient:'ají'}]);
});
test('Coca-Cola en botella, 8 vasos y servilletas: todo en el pedido, lo de la mesa sin costo',async()=>{
  const r=await local('quiero una coca cola en botella, 8 vasos y servilletas');
  const cart=applyOperations([],r.operations,menu);
  assert.deepEqual(cart.map(l=>[l.id,l.qty,l.notes]),[['cocacola',1,['en botella']],['vasos',8,[]],['servilletas',1,[]]]);
  assert.match(r.reply,/Coca-Cola en botella/);assert.match(r.reply,/ocho vasos/);
  assert.equal(menu.find(p=>p.id==='vasos').price,0);
});
import {finishIntent,soundsLike} from '../public/js/domain.js';
test('terminar el pedido con amigos hablando alrededor: no se va al menú',async()=>{
  const yes=['finalizar','quiero finalizar el pedido','ya quiero finalizar','finalicemos','terminar el pedido','ya terminamos','vamos a finalizar','para finalizar','ya podemos finalizar','ya acabamos','ya está todo','ya pedimos todo','jajaja no sé ya finaliza el pedido','finalizar el pedido oye qué vas a pedir tú','ya finaliza que ya nos vamos','oye ya finalizamos o qué','sería todo gracias finaliza','ya, finalízame el pedido','mándalo a la cocina que ya nos vamos','cerremos el pedido'];
  const no=['no finalices todavía','todavía no termino','espera antes de finalizar','no, todavía no es todo','me falta pedir algo, no finalices','aún no','ya quiero pedir','qué trae el combo','quiero un cuarto','no lo envíes','después finalizamos'];
  for(const t of yes)assert.equal(finishIntent(soundsLike(t,menu)),true,t);
  for(const t of no)assert.equal(finishIntent(soundsLike(t,menu)),false,t);
  assert.equal(soundsLike('vamos a querer dos cuartos',menu),'vamos a querer dos cuartos','«vamos» no se corrige a «vasos»');
  // Si la IA no responde y ya hay pedido, Milo pregunta si sigue o cierra; no abre el menú.
  const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test';
  try{const r=await interpret({transcript:'bla bla algo que no se entiende ñaño',cart:[{id:'cuarto',qty:1,notes:[]}]},{fetchImpl:async()=>new Response('caído',{status:500})});
    assert.equal(r.intent,'clarify');assert.equal(r.source,'fallback');assert.match(r.reply,/cerramos el pedido/);}
  finally{if(old)process.env.GROQ_API_KEY=old;else delete process.env.GROQ_API_KEY;}
});
import {closingAnswer,interpretLocal} from '../public/js/domain.js';
test('«ya, sí, no quiero nada más» cierra; «no, espera» o «sí pero…» no',()=>{
  const send=['ya','sí','ya sí','ya que sí','sí ya no quiero nada más','no quiero nada más','nada más','no, nada más','ya no','no gracias, así está bien','sí mándalo','dale','simón','listo','ok','ya pues','así nomás','no ya está','sí sí sí','ajá','claro que sí','sí, eso es todo','que sí','dije que sí','ya te dije que sí','ya pues mándalo','no, ya no quiero más','no, gracias','ya está todo','ya, que sí, que no quiero nada más','eso sería todo, gracias','con eso estamos','no, así está bien, mándalo'];
  const hold=['no, espera','todavía no','no, quiero agregar algo','sí pero agrega papas','no, quita la coca','no, falta algo','espera','un momento','sí, y también una sprite','agrégale una coca','cámbiame el cuarto por un medio','no lo envíes'];
  for(const t of send)assert.equal(closingAnswer(soundsLike(t,menu)),'send',t);
  for(const t of hold)assert.notEqual(closingAnswer(soundsLike(t,menu)),'send',t);
  assert.equal(closingAnswer('no'),null,'un «no» suelto depende de la pregunta');
});
test('«los combos sin ají» con varios combos: se aplica a los que lo llevan y se dice cuáles no',()=>{
  const cart=[{id:'combo-alitas',qty:4,notes:[]},{id:'combo-pechuga',qty:4,notes:[]},{id:'combo-personal',qty:2,notes:[]}];
  const r=interpretLocal('los combos sin ají',cart,menu,'combo-personal',{});
  assert.equal(r.intent,'edit');assert.deepEqual(r.operations,[{type:'note',id:'combo-personal',note:'sin ají'}]);
  assert.match(r.reply,/los dos combos personales van sin ají/);assert.match(r.reply,/combos de alitas y los cuatro combos pechuga no llevan ají/);
  assert.deepEqual(interpretLocal('a los combos de pechuga quítale el ají',cart,menu,'combo-personal',{}).operations,[],'si nombra uno, solo ese');
});
test('pedir otra cosa justo después de «¿algo más?» no cierra el pedido',()=>{
  for(const t of ['sí, muéstrame el menú','ya no quiero la coca','sí una coca','nada de picante','sí quiero ver los combos','qué hay de postre'])assert.equal(closingAnswer(soundsLike(t,menu)),null,t);
});
