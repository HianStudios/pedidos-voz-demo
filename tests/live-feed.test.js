import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {streamOrders} from '../server/order-feed.js';
import {consumeEvents} from '../public/js/live-feed.js';
import events from '../api/order-events.js';
test('SSE entrega snapshot inicial y cambios, omite snapshots repetidos y cierra',async()=>{
 const res=new EventEmitter();res.setHeader=()=>{};const chunks=[];res.write=c=>chunks.push(c);res.end=()=>{res.ended=true;};let n=0;
 await streamOrders(res,{duration:38,interval:5,snapshot:async()=>[{id:'one',status:++n<3?'nuevo':'aceptado'}]});
 assert.equal(chunks.filter(s=>s.startsWith('event: orders')).length,2);assert.ok(chunks.some(s=>s.includes('aceptado')));assert.equal(res.ended,true);assert.equal(res.listenerCount('close'),0);
});
test('SSE desconexión cancela nuevas lecturas',async()=>{
 const res=new EventEmitter();res.setHeader=()=>{};res.write=()=>{};res.end=()=>{};let reads=0;
 await streamOrders(res,{duration:100,interval:5,snapshot:async()=>{reads++;res.emit('close');return [];}});assert.equal(reads,1);
});
test('parser SSE acepta eventos partidos en chunks sin duplicar',async()=>{
 const encoder=new TextEncoder();const stream=new ReadableStream({start(c){for(const s of ['event: ord','ers\ndata: {"orders":[','1]}\n\nevent: heartbeat\ndata: {}\n\n'])c.enqueue(encoder.encode(s));c.close();}});const seen=[];await consumeEvents(new Response(stream),(event,data)=>seen.push({event,data}));assert.deepEqual(seen,[{event:'orders',data:{orders:[1]}},{event:'heartbeat',data:{}}]);
});
test('SSE no expone pedidos sin clave de personal',async()=>{
 const keys=['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','STAFF_TOKEN','SESSION_SECRET'];const saved=keys.map(k=>process.env[k]);Object.assign(process.env,{UPSTASH_REDIS_REST_URL:'https://test',UPSTASH_REDIS_REST_TOKEN:'test',STAFF_TOKEN:'x'.repeat(24),SESSION_SECRET:'y'.repeat(32)});
 const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;}};
 try{await events({method:'GET',headers:{host:'localhost'}},res);assert.equal(res.code,401);}finally{keys.forEach((k,i)=>saved[i]===undefined?delete process.env[k]:process.env[k]=saved[i]);}
});
