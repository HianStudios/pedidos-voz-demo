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
