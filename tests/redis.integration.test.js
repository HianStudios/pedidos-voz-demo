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
    // Avisos del kiosco llegan al stream de caja; calificación única por pedido.
    const {default:alerts}=await import('../api/alerts.js');const {default:ratings}=await import('../api/ratings.js');const {feedSnapshot}=await import('../server/order-feed.js');
    const al=response();await alerts(req({table:7,type:'fullscreen-exit'},'POST',{cookie}),al);assert.equal(al.code,200,JSON.stringify(al.data));
    const feed=await feedSnapshot();assert.equal(feed.alerts[0].type,'fullscreen-exit');assert.equal(feed.alerts[0].table,7);
    const r1=response();await ratings(req({id:a.data.order.id,stars:4.5,comment:'cuatro y media'},'POST',{cookie}),r1);assert.equal(r1.code,200,JSON.stringify(r1.data));
    const r2=response();await ratings(req({id:a.data.order.id,stars:1},'POST',{cookie}),r2);assert.equal(r2.code,409,'no se califica dos veces');
    const rl=response();await ratings(req(undefined,'GET',auth),rl);assert.equal(rl.data.ratings[a.data.order.id].stars,4.5);
    const many=response();await orders({...req(undefined,'GET',auth),url:'/api/orders?limit=1000'},many);assert.ok(many.data.orders.length>=1);
  }finally{
    const {redis}=await import('../server/http.js');try{await redis(['FLUSHDB']);}catch{}
    for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];
  }
});
