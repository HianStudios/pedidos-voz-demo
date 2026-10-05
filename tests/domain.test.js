import test from 'node:test';
import assert from 'node:assert/strict';
import {menu} from '../server/catalog.js';
import {applyOperations,interpretLocal,isConfirmation,validateCart,validateResult,total} from '../public/js/domain.js';
const cart=[{id:'cuarto',qty:2,notes:[]},{id:'cola',qty:2,notes:[]}];
test('confirmación exige una frase completa, nunca subcadenas ni negaciones',()=>{
  for(const text of ['sin cebolla','no confirmes todavía','sí, agrega papas','eso es todo','quiero seis pollos','no está bien','sí pero quita la cola'])assert.equal(isConfirmation(text),false,text);
  for(const text of ['Sí','Sí, por favor','confirmar pedido','envía el pedido'])assert.equal(isConfirmation(text),true,text);
});
test('pedido con varias cantidades y unidades de pollo',()=>{
  const result=interpretLocal('Quiero dos cuartos de pollo y una cola',[],menu);
  assert.deepEqual(result.operations,[{type:'add',id:'cuarto',qty:2},{type:'add',id:'cola',qty:1}]);
  assert.equal(total(applyOperations([],result.operations,menu),menu),1025);
});
test('sin cebolla modifica el último producto; no confirma ni añade',()=>{
  const r=interpretLocal('sin cebolla',cart,menu,'cuarto');assert.equal(r.intent,'edit');
  const next=applyOperations(cart,r.operations,menu);assert.deepEqual(next[0].notes,['sin cebolla']);assert.equal(next.length,2);
});
test('terminar y gracias con carrito piden revisión',()=>{
  for(const s of ['eso es todo','terminé mi pedido','gracias'])assert.equal(interpretLocal(s,cart,menu).intent,'review');
  assert.equal(interpretLocal('gracias',[],menu).intent,'goodbye');
});
test('quita una cola y quita la cola no borran todo el carrito',()=>{
  assert.equal(applyOperations(cart,interpretLocal('quita una cola',cart,menu).operations,menu)[1].qty,1);
  assert.deepEqual(applyOperations(cart,interpretLocal('quita la cola',cart,menu).operations,menu),[cart[0]]);
});
test('correcciones establecen cantidades, no suman',()=>{
  assert.equal(applyOperations(cart,interpretLocal('mejor tres',cart,menu,'cuarto').operations,menu)[0].qty,3);
  assert.equal(applyOperations(cart,interpretLocal('mejor tres cuartos de pollo',cart,menu).operations,menu)[0].qty,3);
});
test('precios vienen del catálogo y menú no edita',()=>{
  assert.equal(interpretLocal('muéstrame el menú',cart,menu).operations.length,0);
  assert.match(interpretLocal('cuánto cuesta el cuarto de pollo',cart,menu).reply,/4[,.]50/);
});
test('una frase parcialmente reconocida no pierde el producto desconocido',()=>assert.equal(interpretLocal('dame dos cuartos de pollo y un ceviche',[],menu),null));
test('valida cantidades, opciones, identificadores y duplicados',()=>{
  for(const qty of [-1,0,1.5,21,'2',null])assert.throws(()=>validateCart([{id:'cuarto',qty}],menu));
  assert.throws(()=>validateCart([{id:'inventado',qty:1}],menu));
  assert.throws(()=>validateCart([cart[0],cart[0]],menu));
  assert.throws(()=>validateCart([{id:'cuarto',qty:1,notes:['sin gluten']}],menu));
  assert.throws(()=>applyOperations(cart,[{id:'cuarto',type:'add',qty:20}],menu));
  const r=interpretLocal('dame -1 cuartos de pollo',[],menu);assert.throws(()=>applyOperations([],r.operations,menu));
});
test('cambios son atómicos y no mutan el carrito ante error',()=>{
  assert.throws(()=>applyOperations(cart,[{id:'cuarto',type:'add',qty:1},{id:'bad',type:'add',qty:1}],menu));assert.equal(cart[0].qty,2);
});
test('modelo no puede confirmar ni mezclar recomendaciones con ediciones',()=>{
  assert.throws(()=>validateResult({intent:'confirm',reply:'Enviado'},cart,menu));
  assert.throws(()=>validateResult({intent:'recommend',reply:'Prueba',operations:[{id:'cuarto',type:'add',qty:1}]},cart,menu));
});
test('sí, agrega papas es una edición y conserva el carrito',()=>{
  const result=interpretLocal('sí, agrega papas',cart,menu);assert.equal(result.intent,'edit');assert.equal(applyOperations(cart,result.operations,menu).at(-1).id,'papas');
});
