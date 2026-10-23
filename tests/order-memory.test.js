import test from 'node:test';
import assert from 'node:assert/strict';
import {interpret} from '../api/match.js';
import {menu} from '../server/catalog.js';
import {applyOperations} from '../public/js/domain.js';
import {nextMemory,readMemory} from '../public/js/order-memory.js';
const op=(id,qty)=>({type:'add',id,qty});
function provider(outputs,requests){return async(u,o)=>{requests.push(JSON.parse(o.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(outputs.shift())}}]}));};}
async function withModel(fn){const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test';try{await fn();}finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}}
test('tres combos directos conservan cantidades sin abrir el menú',async()=>{
 const r=await interpret({transcript:'dos combos personales y tres combos familiares y cuatro combos de alitas',cart:[]},{fetchImpl:()=>{throw new Error('no necesita modelo');}});
 assert.deepEqual(r.operations,[op('combo-personal',2),op('combo-familiar',3),op('combo-alitas',4)]);
});
test('aclaración conserva dos combos anotados y la cantidad del tercero sin duplicar',()=>withModel(async()=>{
 const requests=[];const fetchImpl=provider([
 {intent:'edit',operations:[op('combo-personal',2),op('combo-familiar',3)],reply:'Anoté dos personales y tres familiares. ¿Los cuatro restantes de qué tipo?',awaiting:'¿Los cuatro restantes de qué tipo?'},
 {intent:'edit',operations:[op('combo-alitas',4)],reply:'Anoté cuatro combos de alitas.',awaiting:null}
 ],requests);
 const said='Dos personales, tres familiares y cuatro del combo ese que trae las piezas pequeñas';
 const first=await interpret({transcript:said,cart:[]},{fetchImpl});
 const cart=applyOperations([],first.operations,menu);
 assert.equal(first.memory.turns[0],said);assert.match(first.reply,/restantes/);assert.doesNotMatch(first.reply,/cerramos/);
 // Simula recarga y pérdida del historial reciente.
 const memory=readMemory(JSON.parse(JSON.stringify(first.memory)));
 const second=await interpret({transcript:'de alitas',cart,memory,history:[]},{fetchImpl});
 assert.equal(requests.length,2);assert.match(requests[1].messages[0].content,/cuatro del combo ese/);
 assert.match(requests[1].messages[0].content,/combo-personal/);
 const final=applyOperations(cart,second.operations,menu);
 assert.deepEqual(final.map(l=>[l.id,l.qty]),[['combo-personal',2],['combo-familiar',3],['combo-alitas',4]]);
 assert.equal(second.memory,null);
}));
test('alternativa inexistente conserva cantidad y espera aceptación; sí no confirma el envío',()=>withModel(async()=>{
 const requests=[];const fetchImpl=provider([
 {intent:'clarify',operations:[],reply:'No tenemos nuggets; tenemos alitas. ¿Te sirven dos combos de alitas?',awaiting:'¿Te sirven dos combos de alitas?'},
 {intent:'edit',operations:[op('combo-alitas',2)],reply:'Anoté dos combos de alitas.',awaiting:null}
 ],requests);
 const first=await interpret({transcript:'dos combos de nuggets',cart:[]},{fetchImpl});
 assert.deepEqual(first.operations,[]);
 const second=await interpret({transcript:'sí',cart:[],memory:first.memory},{fetchImpl});
 assert.equal(second.intent,'edit');assert.deepEqual(second.operations,[op('combo-alitas',2)]);
}));
test('desvíos y fallos conservan la solicitud, descartar lo pendiente limpia solo memoria',()=>{
 const memory=nextMemory(null,'cuatro del combo dudoso',{intent:'clarify',reply:'¿Cuál combo?'});
 assert.deepEqual(nextMemory(memory,'muéstrame el menú',{intent:'menu'}),memory);
 const failed=nextMemory(memory,'alitas',{intent:'clarify',source:'fallback',reply:'No respondió el proveedor.'});
 assert.deepEqual(failed.turns,['cuatro del combo dudoso','alitas']);
 assert.deepEqual(nextMemory(failed,'cancela todo',{intent:'cancel',awaiting:null}),failed);
 assert.equal(nextMemory(failed,'no agregues esos',{intent:'keep',awaiting:null}),null);
 assert.equal(readMemory({turns:'mal',question:2}),null);
});
