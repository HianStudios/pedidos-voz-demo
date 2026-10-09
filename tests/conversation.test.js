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
test('muletillas al inicio no ocultan la navegación',()=>{
 assert.equal(navigation('Sí, muéstrame el menú'),'all');assert.equal(navigation('ya, los combos'),'Combos');assert.equal(navigation('sí'),null);
});
test('«¿Para cuántos es?» se responde con un número y propone sin agregar',async()=>{
 const {parsePeople,suggestForPeople}=await import('../public/js/domain.js');
 assert.equal(parsePeople('cinco',true),5);assert.equal(parsePeople('para cinco',true),5);assert.equal(parsePeople('cinco',false),null,'sin pregunta, un número suelto no es un grupo');
 assert.equal(parsePeople('somos seis'),6);assert.equal(parsePeople('dame cinco',true),null);
 const plan=suggestForPeople(5,menu);assert.deepEqual(plan.operations,[{type:'add',id:'combo-familiar',qty:1},{type:'add',id:'combo-personal',qty:1}]);assert.match(plan.reply,/¿Te los anoto\?/);
});
