import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import match from '../api/match.js';
import transcribe from '../api/transcribe.js';
import orders from '../api/orders.js';
import {getSession,session,staff} from '../server/http.js';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};}
function req(data,method='POST'){return {method,headers:{host:'localhost'},body:data,socket:{remoteAddress:'test'}};}
test('API ignora catálogo y precios enviados por cliente',async()=>{
  const res=response();await match(req({transcript:'dos cuartos de pollo',menu:[{id:'cuarto',price:1}],cart:[]}),res);
  assert.equal(res.code,200);assert.deepEqual(res.data.operations,[{id:'cuarto',type:'add',qty:2}]);
});
test('API rechaza pedidos manipulados y métodos',async()=>{
  const res=response();await match(req({transcript:'hola',cart:[{id:'cuarto',qty:-2}]}),res);assert.equal(res.code,400);
  const denied=response();await match(req({},'GET'),denied);assert.equal(denied.code,405);
});
test('origen cruzado rechazado',async()=>{
  const r=req({transcript:'hola'});r.headers.origin='https://otro.example';const res=response();await match(r,res);assert.equal(res.code,403);
});
test('multipart inválido y excesivo rechazados sin llamar proveedor',async()=>{
  const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test';
  try{for(const [content,size,expected] of [['bad',3,400],['bad',4000000,413]]){const r=Readable.from([content]);Object.assign(r,{method:'POST',headers:{host:'localhost','content-type':'multipart/form-data; boundary=test','content-length':size}});const res=response();await transcribe(r,res);assert.equal(res.code,expected);}}
  finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test('sesión firmada y acceso de personal',()=>{
  const keys=['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','STAFF_TOKEN','SESSION_SECRET'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{UPSTASH_REDIS_REST_URL:'https://test',UPSTASH_REDIS_REST_TOKEN:'test',STAFF_TOKEN:'staff-test-12345678901234567890',SESSION_SECRET:'session-test-123456789012345678901234567890'});
  try{const r=req({}),res=response();const id=session(r,res);r.headers.cookie=res.headers['Set-Cookie'];assert.equal(getSession(r),id);r.headers.cookie=r.headers.cookie.replace('mesero_session=','mesero_session=x');assert.equal(getSession(r),null);assert.throws(()=>staff(r));r.headers.authorization=`Bearer ${process.env.STAFF_TOKEN}`;assert.doesNotThrow(()=>staff(r));}
  finally{for(const key of keys)if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}
});
test('pedidos reales no se simulan cuando no hay almacenamiento',async()=>{const res=response();await orders(req({},'GET'),res);assert.equal(res.code,503);});
test('JSON malformado y audio vacío devuelven errores de cliente',async()=>{
  const res=response();await match(req('{invalid'),res);assert.equal(res.code,400);
});
test('errores y operaciones inseguras de IA se convierten en aclaración',async()=>{
  const originalFetch=globalThis.fetch,old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test';
  try{globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({intent:'edit',reply:'pedido',operations:[{id:'cuarto',qty:-1,type:'add'}]})}}]}));const res=response();await match(req({transcript:'sorpréndeme con un platillo',cart:[]}),res);assert.equal(res.code,200);assert.equal(res.data.intent,'clarify');assert.deepEqual(res.data.operations,[]);}
  finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test('voz neural sin credenciales no llama al proveedor',async()=>{
  const {default:speak}=await import('../api/speak.js');const originalFetch=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;};
  try{const res=response();await speak(req({text:'Hola'}),res);assert.equal(res.code,503);assert.equal(called,false);}finally{globalThis.fetch=originalFetch;}
});
