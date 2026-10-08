import test from 'node:test';
import assert from 'node:assert/strict';
import {menu} from '../server/catalog.js';
import {interpretLocal} from '../public/js/domain.js';
import {navigation,plausibleName} from '../public/js/conversation.js';
test('Solo, categorías y consultas no se convierten en pedidos',()=>{
 for(const t of ['Solo','Quiero ver los platos solos','muéstrame los platos'])assert.equal(navigation(t),'Platos',t);
 assert.equal(navigation('quiero ver los combos'),'Combos');assert.equal(navigation('muéstrame las bebidas'),'Bebidas');
 for(const t of ['dame un combo personal','no quiero ver los combos','cuánto cuesta un combo'])assert.equal(navigation(t),null,t);
});
test('medio pollo y nombres completos funcionan en Solo sin IA',()=>{
 for(const text of ['medio pollo','Medio pollo','un medio','dame medio pollo','quiero un Medio pollo']){const r=interpretLocal(text,[],menu,null,{category:'Platos'});assert.deepEqual(r.operations,[{type:'add',id:'medio',qty:1}],text);}
 assert.equal(interpretLocal('me apoyo',[],menu,null,{category:'Platos'}).intent,'clarify');
 assert.equal(interpretLocal('no quiero medio pollo',[],menu,null,{category:'Platos'}),null);
});
test('los alias no se comen cantidades de un familiar',()=>{const r=interpretLocal('tres familiares',[],menu);assert.equal(r.operations[0].qty,3);});
test('no se registran comandos o alergias como nombres',()=>{for(const s of ['espera','quita la cola','soy alérgico','no','cuánto cuesta'])assert.equal(plausibleName(s),false);assert.equal(plausibleName('Hian Pérez'),true);});
