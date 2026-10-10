import test from 'node:test';
import assert from 'node:assert/strict';
import {menu} from '../server/catalog.js';
import {fixWords} from '../public/js/fuzzy.js';
import {interpretLocal,parseRating,normalize} from '../public/js/domain.js';
import {navigation} from '../public/js/conversation.js';
import kiosk from '../api/kiosk.js';
import alerts from '../api/alerts.js';
import ratings from '../api/ratings.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
const req=(body,method='POST')=>({method,headers:{host:'localhost'},body,socket:{remoteAddress:`t-${Math.random()}`}});
test('palabras mal escuchadas se corrigen por parecido; números y palabras comunes no',()=>{
  for(const [heard,meant] of [['muestrame los piatos','muestrame los platos'],['quiero conbos','quiero combos'],['una pechuca','una pechuga'],['unas alitaz','unas alitas'],['las bevidas','las bebidas'],['el conbo persnal','el combo personal']])assert.equal(fixWords(heard,menu),meant,heard);
  for(const same of ['cuatro cuartos','una cosa mas','no tengo plata','media hora','para dos'])assert.equal(fixWords(same,menu),same,same);
  assert.equal(navigation('muéstrame los piatos'),'Platos');assert.equal(navigation('las bevidas'),'Bebidas');
});
test('«algo ligero» y «algo pesado para llenarme» recomiendan por perfil, sin agregar',()=>{
  const light=interpretLocal('dame algo ligero',[],menu);assert.equal(light.intent,'recommend');assert.deepEqual(light.suggest_ids,['pechuga','cuarto']);assert.deepEqual(light.operations,[]);
  const heavy=interpretLocal('quiero algo pesado para llenarme',[],menu);assert.deepEqual(heavy.suggest_ids,['medio','combo-alitas']);assert.match(heavy.reply,/¿Cuál te anoto\?/);
});
test('calificación hablada: números, medias y palabras',()=>{
  for(const [said,stars] of [['cuatro estrellas',4],['cuatro y media',4.5],['4.5',4.5],['te doy cinco',5],['excelente',5],['más o menos',3],['muy mal',1],['estuvo bien',4],['tres y medio',3.5]])assert.equal(parseRating(said),stars,said);
  for(const said of ['ahora no','la comida'])assert.equal(parseRating(said),null,said);
});
test('clave del kiosco: solo en el servidor, comparación segura',async()=>{
  const old=process.env.KIOSK_PIN;
  try{
    delete process.env.KIOSK_PIN;let res=response();await kiosk(req({pin:'2409'}),res);assert.equal(res.code,503,'sin KIOSK_PIN no hay kiosco');
    process.env.KIOSK_PIN='4321';res=response();await kiosk(req({pin:'1234'}),res);assert.equal(res.code,401);
    res=response();await kiosk(req({pin:'4321'}),res);assert.equal(res.code,200);
    res=response();await kiosk(req({pin:'abc'}),res);assert.equal(res.code,400);
  }finally{if(old===undefined)delete process.env.KIOSK_PIN;else process.env.KIOSK_PIN=old;}
});
test('avisos y calificaciones validan lo que reciben',async()=>{
  let res=response();await alerts(req({table:5,type:'borrar-todo'}),res);assert.equal(res.code,400);
  res=response();await alerts(req({table:5,type:'fullscreen-exit'}),res);assert.equal(res.code,200);assert.equal(res.data.demo,true);
  res=response();await ratings(req({id:'x',stars:4}),res);assert.equal(res.code,400);
  res=response();await ratings(req({id:crypto.randomUUID(),stars:4.3}),res);assert.equal(res.code,400,'solo enteros o medias');
  res=response();await ratings(req({id:crypto.randomUUID(),stars:4.5}),res);assert.equal(res.code,200);
});
test('ingredientes: quitar varios, frases naturales y nunca confundir lechuga con pechuga',async()=>{
  const {removalsFor,applyOperations}=await import('../public/js/domain.js');
  const combo=[{id:'combo-personal',qty:1,notes:[]}];
  assert.deepEqual(interpretLocal('que no tenga lechuga ni ají',combo,menu,'combo-personal').operations,[{type:'note',id:'combo-personal',note:'sin lechuga'},{type:'note',id:'combo-personal',note:'sin ají'}]);
  assert.deepEqual(interpretLocal('quiero un combo personal sin cebolla, tomate',[],menu).operations.map(o=>o.note||o.type),['add','sin cebolla','sin tomate']);
  assert.equal(fixWords('sin lechuga',menu),'sin lechuga');
  assert.equal(interpretLocal('quítale las papas',[{id:'papas',qty:1,notes:[]}],menu,'papas').operations[0].type,'remove','papas extra es un producto');
  const p=menu.find(x=>x.id==='combo-personal');
  assert.deepEqual(removalsFor('quítale el ají y la lechuga',p),{remove:['sin ají','sin lechuga'],restore:[]});
  assert.deepEqual(removalsFor('ponle la cebolla',p),{remove:[],restore:['sin cebolla']});
  assert.deepEqual(applyOperations([{id:'cuarto',qty:1,notes:['sin cebolla','sin ají']}],[{type:'unnote',id:'cuarto',note:'sin cebolla'}],menu)[0].notes,['sin ají']);
});
test('«¿qué trae…?» abre la ficha sin agregar nada',()=>{
  const r=interpretLocal('qué trae el combo personal',[],menu);assert.equal(r.intent,'detail');assert.deepEqual(r.suggest_ids,['combo-personal']);assert.deepEqual(r.operations,[]);
  assert.equal(interpretLocal('qué contiene',[{id:'pechuga',qty:1,notes:[]}],menu,'pechuga').suggest_ids[0],'pechuga');
  assert.match(interpretLocal('cuánto cuesta el cuarto de pollo',[],menu).reply,/4,50/);
  for(const p of menu.filter(p=>p.category!=='Bebidas'))assert.ok(p.ingredients?.length,`${p.id} tiene ingredientes`);
});
test('una pregunta sin signos («el combo trae ensalada») no agrega nada',()=>{
  for(const said of ['el combo familiar trae ensalada','la pechuga lleva cebolla','el combo personal tiene gaseosa']){const r=interpretLocal(said,[],menu);assert.equal(r.intent,'detail',said);assert.deepEqual(r.operations,[],said);}
  assert.equal(interpretLocal('el combo familiar trae ensalada',[],menu).suggest_ids[0],'combo-familiar');
  assert.equal(interpretLocal('tráeme un combo familiar',[],menu).intent,'edit');
  assert.deepEqual(interpretLocal('que no pique',[{id:'medio',qty:1,notes:[]}],menu,'medio').operations,[{type:'note',id:'medio',note:'sin ají'}]);
  assert.deepEqual(interpretLocal('sin nada de verduras',[{id:'cuarto',qty:1,notes:[]}],menu,'cuarto').operations,[{type:'note',id:'cuarto',note:'sin ensalada'}]);
});
test('una edición de la IA siempre dice qué cambió',async()=>{
  const {interpret}=await import('../api/match.js');const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test';
  const fetchImpl=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({intent:'edit',reply:'¿Algo más o cerramos el pedido?',operations:[{type:'note',id:'combo-personal',note:'sin cebolla'}]})}}]}));
  try{const r=await interpret({transcript:'con todo menos lo que hace llorar',cart:[{id:'combo-personal',qty:1,notes:[]}]},{fetchImpl});assert.match(r.reply,/^Anotado: combo personal sin cebolla/);}
  finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
