// Lo que un cliente le pide a un mesero aparte de la comida: que venga alguien, la cuenta o cómo va su pedido.
import {normalize} from './domain.js';

const things=[
  ['servilletas',/\bservilletas?\b/],['cubiertos',/\b(cubiertos|tenedor(?:es)?|cuchar(?:a|as|ita|itas)|cuchillos?)\b/],
  ['un vaso',/\bvasos?\b/],['platos extra',/\b(plato(?:s)? extra|platito(?:s)?|otro plato vacio|platos vacios)\b/],
  ['salsas',/\b(salsas?|mayonesa|ketchup|mostaza)\b/],['ají',/\baji\b/],['sal',/\bsal\b/],['limón',/\blimon(?:es)?\b/],
  ['sorbetes',/\b(sorbetes?|pitillos?|popotes?)\b/],['tarrina para llevar',/\b(tarrinas?|para llevar|una funda|una bolsa)\b/],
  ['limpiar la mesa',/\b(limpi(?:ar|en|a) la mesa|se (?:me )?(?:rego|cayo)|derrame)\b/],['agua para la mesa',/\bjarra de agua\b/],
];
const askVerb=/\b(traeme|traenos|trae|traiga|traigan|me (?:traes|trae|traen|pasas|pasan|regalas|regala|das|da)|nos (?:traes|trae|traen|pasas|regalas|das)|necesito|necesitamos|quiero|queremos|falta|faltan|no hay|no tenemos|mas|otra|otro|puedes traer|pueden traer|podrias traer)\b/;
const person=/\b(un mesero|una mesera|al mesero|a la mesera|el mesero|la mesera|un humano|una persona|el personal|al personal|alguien|al encargado|a la encargada|el encargado|al administrador|al dueno|un camarero|ayuda|que venga alguien|que se acerque alguien)\b/;
const callVerb=/\b(llama|llamame|llamen|llamar|necesito|necesitamos|quiero|queremos|hablar con|que venga|que se acerque|ven|venga|pasame|puede venir|ayuda|ayudame|ayudenme)\b/;

export function staffRequest(text){
  const n=normalize(text);if(!n)return null;
  // La cuenta: «la cuenta, por favor», «quiero pagar», «cóbrame», «cuánto te debo».
  if(/\b(la cuenta|cuenta por favor|quiero pagar|queremos pagar|vamos a pagar|para pagar|pagar ya|cobr(?:a|ame|anos|en|eme)|cuanto (?:le |te )?debo|cuanto (?:le |te )?debemos|cuanto es (?:todo|en total|lo que debo)|cuanto salio todo|la factura|la boleta)\b/.test(n)){
    const pay=/\b(tarjeta|credito|debito|datafast)\b/.test(n)?'tarjeta':/\b(efectivo|cash|billete|sencillo)\b/.test(n)?'efectivo':/\b(transferencia|transfiero|deposito)\b/.test(n)?'transferencia':null;
    return {type:'bill',pay};
  }
  // Cómo va el pedido: «¿ya viene mi pedido?», «¿cuánto falta?», «se demora mucho».
  const complaint=/\b(se demora mucho|demora mucho|ya se demoro|tarda mucho|se tarda mucho|todavia no (?:llega|viene|sale)|aun no (?:llega|viene|sale)|no (?:llega|viene) (?:nada|mi|el|nuestro)|por que (?:se )?(?:demora|tarda)|hace rato)\b/.test(n);
  if(complaint||/\b(ya viene|ya vienen|ya sale|cuanto (?:falta|se demora|demora|tarda|se tarda|mas)|como va (?:mi|el|nuestro) pedido|(?:mi|el|nuestro) pedido (?:ya )?(?:viene|esta listo|sale|llega)|ya esta (?:mi|el|nuestro) pedido|esta listo (?:mi|el) pedido|donde esta (?:mi|el|nuestro) pedido|en que va (?:mi|el) pedido)\b/.test(n))
    return {type:'status',complaint};
  // Pedir algo de la mesa: «tráeme servilletas», «nos faltan cubiertos», «más ají». Nunca «sin ají».
  if(!/\bsin\b/.test(n)&&askVerb.test(n)){
    const need=things.filter(([,re])=>re.test(n)).map(([name])=>name);
    if(need.length)return {type:'waiter',need:need.join(', ')};
  }
  // Algo se regó: no hace falta pedirlo con un verbo.
  if(/\b(se (?:me |nos )?(?:rego|cayo|derramo)|derrame)\b/.test(n))return {type:'waiter',need:'limpiar la mesa'};
  // «Ayúdame a elegir» lo resuelve Milo; «llama al mesero» o «necesito ayuda» va al personal.
  if(person.test(n)&&callVerb.test(n)&&!/\b(elegir|escoger|decidir|recomienda|recomiendas|pedir)\b/.test(n))return {type:'waiter',need:''};
  return null;
}
// Lo que dice Milo según el estado que marca caja.
export const statusLine={
  nuevo:'Tu pedido ya llegó a caja; en un momento lo aceptan.',
  aceptado:'Ya lo aceptaron y en breve pasa a cocina.',
  preparando:'Ya lo están preparando en cocina.',
  listo:'¡Ya está listo! En un momento te lo traen.',
  entregado:'Figura como entregado.',
  cancelado:'Ese pedido figura como cancelado.',
};
