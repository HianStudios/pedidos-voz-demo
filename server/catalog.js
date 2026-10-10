// Una configuración por despliegue: el cliente nunca elige otro restaurante.
export const restaurant = {
  id: 'brasa-demo', name: 'Brasa', subtitle: 'Pollo, fuego y buen sabor.',
  assistant: 'Milo', currency: 'USD', locale: 'es-EC',
  greeting: '¡Hola! Soy Milo. ¿Qué se te antoja hoy?', demoMenu: true,
};
export const menu = [
  // === PLATOS SOLOS (5) ===
  {id:'cuarto',pitch:'un cuarto de pollo con papas y ensalada',feel:'ligero',one:'un cuarto de pollo',many:'cuartos de pollo',name:'Cuarto de pollo',category:'Platos',price:450,desc:'Pollo asado con papas doradas y ensalada.',emoji:'🍗',tag:'El favorito',aliases:['cuarto de pollo','cuartos de pollo','cuarto','cuartos','un cuarto'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'medio',pitch:'el medio pollo con papas y ensalada',feel:'contundente',one:'un medio pollo',many:'medios pollos',name:'Medio pollo',category:'Platos',price:800,desc:'Media porción de pollo al fuego con papas y ensalada.',emoji:'🍗',aliases:['medio pollo','medios pollos','medio','un medio'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'entero',feel:'contundente',one:'un pollo entero',many:'pollos enteros',name:'Pollo entero',category:'Platos',price:1500,desc:'Pollo completo con papas grandes y ensalada.',emoji:'🍗',tag:'Para compartir',aliases:['pollo entero','pollos enteros','entero','un entero'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'alitas',feel:'contundente',one:'unas alitas BBQ',many:'porciones de alitas BBQ',name:'Alitas BBQ',category:'Platos',price:550,desc:'8 alitas bañadas en salsa BBQ con papas.',emoji:'🍗',aliases:['alitas','alitas bbq','alitas de pollo','unas alitas'],options:['sin papas']},
  {id:'pechuga',pitch:'la pechuga a la plancha con arroz y ensalada',feel:'ligero',one:'una pechuga a la plancha',many:'pechugas a la plancha',name:'Pechuga a la plancha',category:'Platos',price:500,desc:'Pechuga jugosa con arroz y ensalada.',emoji:'🍗',aliases:['pechuga','pechuga a la plancha','una pechuga','pechuga plancha'],options:['sin ensalada','sin arroz']},

  // === COMBOS (5) ===
  {id:'combo-personal',feel:'contundente',one:'un combo personal',many:'combos personales',name:'Combo personal',category:'Combos',price:575,desc:'Cuarto de pollo, papas y gaseosa.',emoji:'🍱',tag:'El más pedido',aliases:['combo personal','combo individual','combos personales','un combo personal','personal','el personal','el individual'],options:['sin papas']},
  {id:'combo-pareja',feel:'contundente',one:'un combo en pareja',many:'combos en pareja',name:'Combo en pareja',category:'Combos',price:1100,desc:'Medio pollo, papas grandes, ensalada y 2 gaseosas.',emoji:'🍱',aliases:['combo pareja','combo en pareja','combo de pareja','combo para dos','un combo pareja','pareja','el de pareja','para dos'],options:['sin ensalada','sin papas']},
  {id:'combo-familiar',feel:'contundente',one:'un combo familiar',many:'combos familiares',name:'Combo familiar',category:'Combos',price:1850,desc:'Pollo entero, papas grandes, ensalada y gaseosa de litro.',emoji:'🍱',aliases:['combo familiar','combos familiares','un combo familiar','el familiar','familiar','familiares','tres familiares'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'combo-alitas',pitch:'el combo de alitas, que trae papas y gaseosa',feel:'contundente',one:'un combo de alitas',many:'combos de alitas',name:'Combo de alitas',category:'Combos',price:700,desc:'8 alitas BBQ, papas y gaseosa.',emoji:'🍱',aliases:['combo de alitas','combo alitas','combos de alitas','un combo de alitas','el de alitas','combo de alita'],options:['sin papas']},
  {id:'combo-pechuga',feel:'ligero',one:'un combo pechuga',many:'combos pechuga',name:'Combo pechuga',category:'Combos',price:650,desc:'Pechuga a la plancha, arroz, ensalada y gaseosa.',emoji:'🍱',aliases:['combo pechuga','combo de pechuga','un combo pechuga','el de pechuga','combo pechuga plancha'],options:['sin ensalada','sin arroz']},

  // === EXTRAS (3) ===
  {id:'papas',one:'unas papas doradas',many:'porciones de papas',name:'Papas doradas',category:'Extras',price:250,desc:'Porción extra, crujiente y recién hecha.',emoji:'🍟',aliases:['papas doradas','papas fritas','papas','unas papas'],options:['sin sal']},
  {id:'arroz',feel:'ligero',one:'un arroz blanco',many:'porciones de arroz',name:'Arroz blanco',category:'Extras',price:150,desc:'Porción de arroz para acompañar.',emoji:'🍚',aliases:['arroz blanco','arroz','un arroz'],options:[]},
  {id:'ensalada',feel:'ligero',one:'una ensalada fresca',many:'ensaladas',name:'Ensalada fresca',category:'Extras',price:200,desc:'Lechuga, tomate y cebolla.',emoji:'🥗',aliases:['ensalada fresca','ensalada','una ensalada'],options:['sin cebolla','sin tomate']},

  // === BEBIDAS (4) ===
  {id:'cocacola',one:'una Coca-Cola',many:'Coca-Colas',name:'Coca-Cola',category:'Bebidas',price:125,desc:'Botella de 400 ml.',emoji:'🥤',aliases:['coca cola','coca','cocacola','una coca','dame una coca'],options:[]},
  {id:'sprite',one:'una Sprite',many:'Sprites',name:'Sprite',category:'Bebidas',price:125,desc:'Botella de 400 ml.',emoji:'🥤',aliases:['sprite','esprite','una sprite'],options:[]},
  {id:'pepsi',one:'una Pepsi',many:'Pepsis',name:'Pepsi',category:'Bebidas',price:125,desc:'Botella de 400 ml.',emoji:'🥤',aliases:['pepsi','una pepsi'],options:[]},
  {id:'agua',feel:'ligero',one:'un agua mineral',many:'aguas minerales',name:'Agua mineral',category:'Bebidas',price:100,desc:'Botella de 500 ml, sin gas.',emoji:'💧',aliases:['agua mineral','agua sin gas','aguas','agua','una agua','un agua'],options:[]},
].map(item=>({...item,available:true}));
