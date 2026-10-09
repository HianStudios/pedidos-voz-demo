// Contra un Redis real: REDIS_TEST_URL=redis://127.0.0.1:6379 npm test. Sin la variable se omite.
import test from 'node:test';
import assert from 'node:assert/strict';
const url=process.env.REDIS_TEST_URL;
test('pedidos de mesa con REDIS_URL: crear, idempotencia, caja y estados',{skip:!url&&'REDIS_TEST_URL no definido'},async()=>{
  const keys=['REDIS_URL','STAFF_TOKEN','SESSION_SECRET','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  for(const k of keys)delete process.env[k];
  Object.assign(process.env,{REDIS_URL:url,STAFF_TOKEN:'s'.repeat(30),SESSION_SECRET:'x'.repeat(40)});
  const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
  const req=(body,method='POST',headers={})=>({method,headers:{host:'localhost',...headers},body,socket:{remoteAddress:`it-${Math.random()}`}});
  try{
    const {default:menu}=await import('../api/menu.js');const {default:orders}=await import('../api/orders.js');const {orderSnapshot}=await import('../server/order-feed.js');
    const m=response();await menu(req(undefined,'GET'),m);assert.equal(m.data.mode,'live');const cookie=m.headers['Set-Cookie'].split(';')[0];
    const key=crypto.randomUUID();const order={key,items:[{id:'cuarto',qty:2,notes:['sin cebolla']}],table:7,confirmed:true};
    const a=response();await orders(req(order,'POST',{cookie}),a);assert.equal(a.code,200,JSON.stringify(a.data));assert.equal(a.data.order.customer,'Mesa 7');assert.equal(a.data.order.table,7);assert.equal(a.data.order.total,900);
    const b=response();await orders(req(order,'POST',{cookie}),b);assert.equal(b.data.order.id,a.data.order.id,'el reintento no duplica');
    const auth={authorization:`Bearer ${process.env.STAFF_TOKEN}`};
    const list=response();await orders(req(undefined,'GET',auth),list);assert.ok(list.data.orders.some(o=>o.id===a.data.order.id));
    const patch=response();await orders(req({id:a.data.order.id,status:'aceptado'},'PATCH',auth),patch);assert.equal(patch.data.order.status,'aceptado');
    const bad=response();await orders(req({id:a.data.order.id,status:'entregado'},'PATCH',auth),bad);assert.equal(bad.code,409);
    assert.equal((await orderSnapshot()).find(o=>o.id===a.data.order.id).status,'aceptado');
  }finally{
    const {redis}=await import('../server/http.js');try{await redis(['FLUSHDB']);}catch{}
    for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];
  }
});
