import test from 'node:test';
import assert from 'node:assert/strict';
import {staffRequest} from '../public/js/service.js';
test('la cuenta, el estado del pedido y llamar al personal',()=>{
  const cases={
    'la cuenta por favor':{type:'bill',pay:null},'tráeme la cuenta, pago con tarjeta':{type:'bill',pay:'tarjeta'},'cuánto te debo':{type:'bill',pay:null},'quiero pagar en efectivo':{type:'bill',pay:'efectivo'},
    '¿ya viene mi pedido?':{type:'status',complaint:false},'cuánto falta':{type:'status',complaint:false},'se demora mucho':{type:'status',complaint:true},'todavía no llega nada':{type:'status',complaint:true},
    'tráeme servilletas':{type:'waiter',need:'servilletas'},'nos faltan cubiertos':{type:'waiter',need:'cubiertos'},'más ají por favor':{type:'waiter',need:'ají'},
    'llama al mesero':{type:'waiter',need:''},'necesito ayuda':{type:'waiter',need:''},'se me regó la cola':{type:'waiter',need:'limpiar la mesa'},
  };
  for(const [t,v] of Object.entries(cases))assert.deepEqual(staffRequest(t),v,t);
  for(const t of ['sin ají','quiero ver los platos','cuánto es el combo familiar','ayúdame a elegir','dos cuartos de pollo','eso es todo','hay salsa bbq'])assert.equal(staffRequest(t),null,t);
});
