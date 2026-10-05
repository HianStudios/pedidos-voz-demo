// Una configuración por despliegue: el cliente nunca elige otro restaurante.
export const restaurant = {
  id: 'brasa-demo', name: 'Brasa', subtitle: 'Pollo, fuego y buen sabor.',
  assistant: 'Milo', currency: 'USD', locale: 'es-EC',
  greeting: 'Dígame, señor. ¿Qué desea pedir?', demoMenu: true,
};
export const menu = [
  // === PLATOS SOLOS (5) ===
  {id:'cuarto',name:'Cuarto de pollo',category:'Platos',price:450,desc:'Pollo asado con papas doradas y ensalada.',emoji:'🍗',tag:'El favorito',aliases:['cuarto de pollo','cuartos de pollo','cuarto','cuartos','un cuarto'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'medio',name:'Medio pollo',category:'Platos',price:800,desc:'Media porción de pollo al fuego con papas y ensalada.',emoji:'🍗',aliases:['medio pollo','medios pollos','medio','un medio'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'entero',name:'Pollo entero',category:'Platos',price:1500,desc:'Pollo completo con papas grandes y ensalada.',emoji:'🍗',tag:'Para compartir',aliases:['pollo entero','pollos enteros','entero','un entero'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'alitas',name:'Alitas BBQ',category:'Platos',price:550,desc:'8 alitas bañadas en salsa BBQ con papas.',emoji:'🍗',aliases:['alitas','alitas bbq','alitas de pollo','unas alitas'],options:['sin papas']},
  {id:'pechuga',name:'Pechuga a la plancha',category:'Platos',price:500,desc:'Pechuga jugosa con arroz y ensalada.',emoji:'🍗',aliases:['pechuga','pechuga a la plancha','una pechuga','pechuga plancha'],options:['sin ensalada','sin arroz']},

  // === COMBOS (5) ===
  {id:'combo-personal',name:'Combo personal',category:'Combos',price:575,desc:'Cuarto de pollo, papas y gaseosa.',emoji:'🍱',tag:'El más pedido',aliases:['combo personal','combo individual','combos personales','un combo personal','personal','el personal','el individual'],options:['sin papas']},
  {id:'combo-pareja',name:'Combo en pareja',category:'Combos',price:1100,desc:'Medio pollo, papas grandes, ensalada y 2 gaseosas.',emoji:'🍱',aliases:['combo pareja','combo en pareja','combo de pareja','combo para dos','un combo pareja','pareja','el de pareja','para dos'],options:['sin ensalada','sin papas']},
  {id:'combo-familiar',name:'Combo familiar',category:'Combos',price:1850,desc:'Pollo entero, papas grandes, ensalada y gaseosa de litro.',emoji:'🍱',aliases:['combo familiar','combos familiares','un combo familiar','el familiar','familiar','familiares','tres familiares'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'combo-alitas',name:'Combo de alitas',category:'Combos',price:700,desc:'8 alitas BBQ, papas y gaseosa.',emoji:'🍱',aliases:['combo de alitas','combo alitas','combos de alitas','un combo de alitas','el de alitas','combo de alita'],options:['sin papas']},
  {id:'combo-pechuga',name:'Combo pechuga',category:'Combos',price:650,desc:'Pechuga a la plancha, arroz, ensalada y gaseosa.',emoji:'🍱',aliases:['combo pechuga','combo de pechuga','un combo pechuga','el de pechuga','combo pechuga plancha'],options:['sin ensalada','sin arroz']},

  // === EXTRAS (3) ===
  {id:'papas',name:'Papas doradas',category:'Extras',price:250,desc:'Porción extra, crujiente y recién hecha.',emoji:'🍟',aliases:['papas doradas','papas fritas','papas','unas papas'],options:['sin sal']},
  {id:'arroz',name:'Arroz blanco',category:'Extras',price:150,desc:'Porción de arroz para acompañar.',emoji:'🍚',aliases:['arroz blanco','arroz','un arroz'],options:[]},
  {id:'ensalada',name:'Ensalada fresca',category:'Extras',price:200,desc:'Lechuga, tomate y cebolla.',emoji:'🥗',aliases:['ensalada fresca','ensalada','una ensalada'],options:['sin cebolla','sin tomate']},

  // === BEBIDAS (4) ===
  {id:'cocacola',name:'Coca-Cola',category:'Bebidas',price:125,desc:'Botella de 400 ml.',emoji:'🥤',aliases:['coca cola','coca','cocacola','una coca','dame una coca'],options:[]},
  {id:'sprite',name:'Sprite',category:'Bebidas',price:125,desc:'Botella de 400 ml.',emoji:'🥤',aliases:['sprite','esprite','una sprite'],options:[]},
  {id:'pepsi',name:'Pepsi',category:'Bebidas',price:125,desc:'Botella de 400 ml.',emoji:'🥤',aliases:['pepsi','una pepsi'],options:[]},
  {id:'agua',name:'Agua mineral',category:'Bebidas',price:100,desc:'Botella de 500 ml, sin gas.',emoji:'💧',aliases:['agua mineral','aguas','agua','una agua','un agua'],options:[]},
].map(item=>({...item,available:true}));
