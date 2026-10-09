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
  try{globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({intent:'edit',reply:'pedido',operations:[{id:'cuarto',qty:-1,type:'add'}]})}}]}));const res=response();await match(req({transcript:'sorpréndeme con un platillo',cart:[]}),res);assert.equal(res.code,200);assert.equal(res.data.intent,'menu','ofrece el menú en vez de pedir que repita');assert.equal(res.data.source,'fallback');assert.deepEqual(res.data.operations,[]);}
  finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test('voz neural sin credenciales no llama al proveedor',async()=>{
  const {default:speak}=await import('../api/speak.js');const originalFetch=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;};
  try{const res=response();await speak(req({text:'Hola'}),res);assert.equal(res.code,503);assert.equal(called,false);}finally{globalThis.fetch=originalFetch;}
});
test('acepta las variables KV_REST_API_* de la integración de Upstash en Vercel',async()=>{
  const {hasRedis}=await import('../server/http.js');const keys=['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{for(const k of keys)delete process.env[k];assert.equal(hasRedis(),false);Object.assign(process.env,{KV_REST_API_URL:'https://kv.test',KV_REST_API_TOKEN:'t'});assert.equal(hasRedis(),true);}
  finally{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
test('transcripción: descarta frases fantasma de Whisper y envía vocabulario del menú',async()=>{
  const originalFetch=globalThis.fetch,old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test';let sent;
  const boundary='b';const body=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.webm"\r\nContent-Type: audio/webm\r\n\r\n${'x'.repeat(800)}\r\n--${boundary}--\r\n`);
  const call=async text=>{globalThis.fetch=async(u,o)=>{sent=o.body;return new Response(JSON.stringify({text,segments:[{no_speech_prob:.1}]}));};const r=Readable.from([body]);Object.assign(r,{method:'POST',headers:{host:'localhost','content-type':`multipart/form-data; boundary=${boundary}`,'content-length':body.length},socket:{remoteAddress:'tx'}});const res=response();await transcribe(r,res);return res.data.text;};
  try{
    assert.equal(await call('Subtítulos realizados por la comunidad de Amara.org'),'');
    assert.equal(await call('Gracias por ver el video.'),'');
    assert.equal(await call('Dos cuartos de pollo y una Sprite.'),'Dos cuartos de pollo y una Sprite.');
    assert.match(sent.get('prompt'),/Combo familiar/);
  }finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test('la IA recibe la guía de razonamiento y la pregunta pendiente; reintenta una salida inválida',async()=>{
  const {interpret}=await import('../api/match.js');const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test';let calls=0,system;
  const fetchImpl=async(u,o)=>{calls++;system=JSON.parse(o.body).messages[0].content;return new Response(JSON.stringify({choices:[{message:{content:calls===1?'{"intent":':JSON.stringify({intent:'menu',category:'Bebidas',reply:'¿Cuál prefieres?',operations:[]})}}]}));};
  try{const r=await interpret({transcript:'lo que tengas helado pues',cart:[],history:[{role:'assistant',content:'¿Algo para tomar, o cerramos así?'}]},{fetchImpl});
    assert.equal(calls,2);assert.equal(r.intent,'menu');assert.equal(r.category,'Bebidas');assert.match(system,/Cómo razonar/);assert.match(system,/PREGUNTA PENDIENTE: "¿Algo para tomar/);assert.ok(system.length<9000,'cabe en el límite gratuito de Groq');}
  finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
