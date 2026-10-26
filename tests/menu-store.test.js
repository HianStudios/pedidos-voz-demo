import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanProduct} from '../server/menu-store.js';
import {interpretLocal,applyOperations} from '../public/js/domain.js';
import {menu} from '../server/catalog.js';
test('un producto nuevo del panel queda listo para que Milo lo entienda',()=>{
  const p=cleanProduct({name:'Salchipapa',category:'Extras',price:350,article:'una',ingredients:'Papas, salchicha, mayonesa',remove:'mayonesa, sin ketchup',aliases:'salchi'});
  assert.equal(p.id,'salchipapa');assert.equal(p.one,'una salchipapa');assert.deepEqual(p.options,['sin mayonesa','sin ketchup']);assert.ok(p.aliases.includes('salchi'));
  const next=[...menu,p];const r=interpretLocal('dame dos salchis sin mayonesa',[],next);
  assert.equal(r.intent,'edit');assert.deepEqual(applyOperations([],r.operations,next),[{id:'salchipapa',qty:2,notes:['sin mayonesa']}]);
  const drink=cleanProduct({name:'Fanta',category:'Bebidas',price:125});assert.deepEqual(drink.serve,['en botella','con hielo','sin hielo']);assert.equal(drink.one,'un Fanta');
});
test('el panel no puede guardar datos rotos',()=>{
  assert.throws(()=>cleanProduct({name:'',category:'Platos',price:100}),/nombre/);
  assert.throws(()=>cleanProduct({name:'X',category:'Postres',price:100}),/Categoría/);
  assert.throws(()=>cleanProduct({name:'Caro',category:'Platos',price:-5}),/Precio/);
  assert.equal(cleanProduct({name:'<b>Pollo</b>',category:'Platos',price:100}).name,'bPollo/b','sin etiquetas HTML');
});
