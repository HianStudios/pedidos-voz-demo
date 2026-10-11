// Habla de la calle y frases informales: Milo debe entenderlas sin la IA (y sin agregar cosas que nadie pidió).
import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretLocal,soundsLike,isConfirmation,isFinish,serveFor,parseRating,parsePeople} from '../public/js/domain.js';
import {staffRequest} from '../public/js/service.js';
import {menu} from '../server/catalog.js';

test('pedidos de la calle, pantalla y cierre informal',()=>{
const L=(t,ctx={},cart=[],last=null)=>interpretLocal(t,cart,menu,last,ctx);
const add=(...ids)=>r=>r?.intent==='edit'&&ids.every(id=>r.operations.some(o=>o.type==='add'&&o.id===id));
const intent=(i,extra)=>r=>r?.intent===i&&(!extra||extra(r));
const cases=[
 // pedidos de calle
 ['oe ñaño, pásame un cuarto de pollo',add('cuarto')],['veci, regáleme un medio pollo',add('medio')],['qué fue mijo, dame un combo personal',add('combo-personal')],
 ['un cuartito nomás',add('cuarto')],['una colita bien heladita',r=>r?.intent==='clarify'||r===null],['unas papitas porfa',add('papas')],['una coca colita',add('cocacola')],
 ['dame haciendo un medio pollo',add('medio')],['jefe, mándese un pollo entero',r=>r===null||add('entero')(r)],['ponme un combo familiar ahí',add('combo-familiar')],
 ['bro, unas alitas',add('alitas')],['pana, una sprite',add('sprite')],['traiga un cuarto de pollo y una coca',add('cuarto','cocacola')],['regáleme una pechuguita a la plancha',add('pechuga')],
 ['queremos un combo familiar y dos colas',r=>add('combo-familiar')(r)||r===null],['vamos a querer dos cuartos',add('cuarto')],['deme un aguita',add('agua')],['quisiera un arrocito',add('arroz')],
 ['un cuarto de pollo cero cebolla',r=>add('cuarto')(r)&&r.operations.some(o=>o.note==='sin cebolla')],['oe, el combo personal sin ají porfa',r=>add('combo-personal')(r)&&r.operations.some(o=>o.note==='sin ají')],
 ['buenas, un medio pollo nomás',add('medio')],['hola, qué fue, una pepsi',add('pepsi')],['mijo dame dos cuartitos de pollo',r=>r?.operations?.[0]?.qty===2],
 // menú y recomendación
 ['oe muéstrame los combos',intent('menu',r=>r.category==='Combos')],['qué hay de tomar ñaño',intent('menu',r=>r.category==='Bebidas')],['qué es lo que más sale',intent('recommend')],['cuál es la especialidad de la casa',intent('recommend')],
 ['qué hay de comer',r=>['menu','recommend'].includes(r?.intent)],
 // pantalla
 ['y qué trae',intent('detail',r=>r.suggest_ids[0]==='combo-personal'),{focus:'combo-personal',shown:['combo-personal']}],
 ['qué tiene ese',intent('detail',r=>r.suggest_ids[0]==='combo-personal'),{focus:'combo-personal'}],
 ['y eso qué lleva',intent('detail'),{focus:'medio'}],
 ['qué trae',intent('clarify',r=>/combo personal|combo familiar/.test(r.reply)),{shown:['combo-personal','combo-familiar']}],
 ['cuánto cuesta',intent('price',r=>/5,75/.test(r.reply)),{focus:'combo-personal'}],['y cuánto vale ese',intent('price'),{focus:'combo-personal'}],
 ['dámelo',add('combo-personal'),{focus:'combo-personal'}],['ponme ese',add('combo-personal'),{focus:'combo-personal'}],['me quedo con ese',add('combo-personal'),{focus:'combo-personal'}],
 ['dame dos de esos',r=>r?.operations?.[0]?.qty===2,{focus:'combo-personal'}],['ya pues, agrégalo',add('combo-personal'),{focus:'combo-personal'}],['ese mismo',add('combo-personal'),{focus:'combo-personal'}],
 ['simón, lo quiero',add('combo-personal'),{focus:'combo-personal'}],['quiero',r=>r===null||r.intent!=='edit',{focus:'combo-personal'}],
];
const conf=[['simón',true],['de una',true],['dale nomás',true],['obvio',true],['sale',true],['ya pues',true],['chévere',true],['nel',false],['ni de fun',false]];
const fin=[['ya mismo mándalo',true],['simón, eso es todo',true],['ya ñaño, eso nomás',true],['listo mijo, mándale a la cocina',true],['bacán, eso sería todo',true],['ya pues, envíale',true]];
const staff=[['oe ñaño, tráeme unas servilletas','waiter'],['veci la cuenta','bill'],['jefe cuánto le debo','bill'],['oe, y mi pedido pues','status'],['ya se demoró full','status'],['pásame más ají','waiter'],['oe se me regó la cola','waiter']];
let bad=0;const fails=[];const log=(...a)=>fails.push(a.join(' '));
for(const [t,ok,ctx] of cases){const r=L(t,ctx||{});if(!ok(r)){bad++;log('FAIL',t,'→',soundsLike(t,menu),'→',JSON.stringify(r&&{i:r.intent,o:r.operations,s:r.suggest_ids,c:r.category,r:r.reply}));}}
for(const [t,v] of conf){const g=isConfirmation(soundsLike(t,menu));if(g!==v){bad++;log('FAIL conf',t,soundsLike(t,menu),g);}}
for(const [t,v] of fin){const g=isFinish(soundsLike(t,menu));if(g!==v){bad++;log('FAIL fin',t,soundsLike(t,menu),g);}}
for(const [t,v] of staff){const g=staffRequest(t)?.type;if(g!==v){bad++;log('FAIL staff',t,g);}}
assert.deepEqual(fails,[]);void(cases.length+conf.length+fin.length+staff.length);
});

test('frases difíciles, negaciones y correcciones',()=>{
const L=(t,ctx={},cart=[],last=null)=>interpretLocal(t,cart,menu,last,ctx);
const add=(id,qty)=>r=>r?.intent==='edit'&&r.operations.some(o=>o.type==='add'&&o.id===id&&(qty==null||o.qty===qty));
const noAdd=r=>!r||!r.operations?.some(o=>o.type==='add');
const intent=i=>r=>r?.intent===i;
const C=[
 ['eh... este... dame un cuarto',add('cuarto',1)],['mmm a ver, un medio pollo',add('medio')],['ya pues ponme dos combos personales',add('combo-personal',2)],
 ['quiero tres colas',r=>r===null||r.intent==='clarify'],['dos coca colas y una sprite bien frías',r=>add('cocacola',2)(r)&&add('sprite',1)(r)],
 ['un combo pa dos',add('combo-pareja')],['el combo de la pareja',r=>add('combo-pareja')(r)||r===null],['unas alas bbq',r=>add('alitas')(r)||r===null],
 ['no quiero cola',noAdd],['no me des papas',noAdd],['no tienes ceviche',noAdd],['tienen algo de mariscos',noAdd],['eso no lo quiero',noAdd],
 ['quítame la coca',r=>r?.operations?.some(o=>['remove','set'].includes(o.type)&&o.id==='cocacola'),{},[{id:'cocacola',qty:1,notes:[]}]],
 ['ya no quiero la sprite',r=>r===null||r.operations?.some(o=>o.id==='sprite'&&o.type!=='add'),{},[{id:'sprite',qty:1,notes:[]}]],
 ['mejor que sean dos',r=>r?.operations?.[0]?.type==='set'&&r.operations[0].qty===2,{},[{id:'cuarto',qty:1,notes:[]}],'cuarto'],
 ['otro igualito',r=>add('cuarto')(r)||r===null,{},[{id:'cuarto',qty:1,notes:[]}],'cuarto'],
 ['sácale la cebolla',r=>r?.operations?.some(o=>o.type==='note'&&o.note==='sin cebolla'),{},[{id:'cuarto',qty:1,notes:[]}],'cuarto'],
 ['que no tenga nada de ají',r=>r?.operations?.some(o=>o.note==='sin ají'),{},[{id:'medio',qty:1,notes:[]}],'medio'],
 ['cero ensalada',r=>r?.operations?.some(o=>o.note==='sin ensalada'),{},[{id:'medio',qty:1,notes:[]}],'medio'],
 ['para cuatro personas qué me recomiendas',intent('recommend')],['algo pa picar',r=>!r||noAdd(r)],['algo bien llenador',r=>r?.intent==='recommend'||!r],
 ['tengo un hambre tenaz',r=>r?.intent==='recommend'||!r],['algo light',intent('recommend')],['me muero del hambre',r=>r?.intent==='recommend'||!r],
 ['muéstrame lo que hay',r=>r?.intent==='menu'||r?.intent==='recommend'],['a ver el menú',intent('menu')],['las bebidas',intent('menu')],['qué jugos tienes',r=>!r||noAdd(r)],
 ['cuánto está el medio',intent('price')],['a cuánto el combo familiar',r=>r?.intent==='price'||!r],
];
let bad=0;const fails=[];const log=(...a)=>fails.push(a.join(' '));
for(const [t,ok,ctx,cart,last] of C){const r=L(t,ctx||{},cart||[],last||null);if(!ok(r)){bad++;log('FAIL',t,'→',soundsLike(t,menu),'→',JSON.stringify(r&&{i:r.intent,o:r.operations,c:r.category,r:r.reply}));}}
const misc=[[isConfirmation(soundsLike('ya mijo, dale',menu)),true,'ya mijo dale'],[isFinish(soundsLike('ya estuvo ñaño, mándalo',menu)),true,'ya estuvo mandalo'],[parseRating('le doy un cinco'),5,'cinco'],[parseRating('cuatro estrellitas'),4,'estrellitas'],[parseRating('full bacán'),5,'full bacan'],[parsePeople('somos cuatro',false),4,'somos'],[parsePeople('pa tres',true),3,'pa tres'],[serveFor('heladita con hielo'),'en vaso con hielo','hielo'],[staffRequest('ñaño tráeme unos cubiertos')?.type,'waiter','cubiertos'],[staffRequest('cóbrame')?.type,'bill','cobrame']];
for(const [g,v,l] of misc)if(g!==v){bad++;log('FAIL misc',l,g);}
assert.deepEqual(fails,[]);void(C.length+misc.length);
});
