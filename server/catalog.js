// Una configuración por despliegue: el cliente nunca elige otro restaurante.
export const restaurant = {
  id: 'brasa-demo', name: 'Brasa', subtitle: 'Pollo, fuego y buen sabor.',
  assistant: 'Milo', currency: 'USD', locale: 'es-EC',
  greeting: 'Dígame, señor. ¿Qué desea pedir?', demoMenu: true,
};
export const menu = [
  {id:'cuarto',name:'Cuarto de pollo',category:'Pollo',price:450,desc:'Pollo asado, papas doradas y ensalada fresca.',emoji:'🍗',tag:'El favorito',aliases:['cuarto de pollo','cuartos de pollo','cuarto','cuartos'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'medio',name:'Medio pollo',category:'Pollo',price:800,desc:'Media porción de nuestro pollo al fuego, con papas y ensalada.',emoji:'🍗',aliases:['medio pollo','medios pollos'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'entero',name:'Pollo entero',category:'Pollo',price:1500,desc:'Para compartir. Con papas grandes y ensalada de la casa.',emoji:'🍗',tag:'Para compartir',aliases:['pollo entero','pollos enteros'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'individual',name:'Combo individual',category:'Combos',price:575,desc:'Cuarto de pollo, papas y gaseosa personal.',emoji:'🍱',aliases:['combo individual','combos individuales'],options:['sin papas']},
  {id:'familiar',name:'Combo familiar',category:'Combos',price:1850,desc:'Pollo entero, papas grandes, ensalada y gaseosa de 1 litro.',emoji:'🍱',aliases:['combo familiar','combos familiares'],options:['sin ensalada','sin papas','sin cebolla']},
  {id:'papas',name:'Papas doradas',category:'Extras',price:250,desc:'Una porción extra, crujiente y recién preparada.',emoji:'🍟',aliases:['papas doradas','papas fritas','papas'],options:['sin sal']},
  {id:'arroz',name:'Arroz blanco',category:'Extras',price:150,desc:'Porción de arroz blanco para acompañar.',emoji:'🍚',aliases:['arroz blanco','arroz'],options:[]},
  {id:'ensalada',name:'Ensalada fresca',category:'Extras',price:200,desc:'Lechuga, tomate y cebolla. Preparada al momento.',emoji:'🥗',aliases:['ensalada fresca','ensalada'],options:['sin cebolla','sin tomate']},
  {id:'cola',name:'Gaseosa personal',category:'Bebidas',price:125,desc:'Botella de 400 ml. Bien fría.',emoji:'🥤',aliases:['gaseosa personal','coca cola','coca','cola','colas','gaseosa','gaseosas'],options:[]},
  {id:'agua',name:'Agua mineral',category:'Bebidas',price:100,desc:'Botella de 500 ml, sin gas.',emoji:'💧',aliases:['agua mineral','aguas','agua'],options:[]},
].map(item=>({...item,available:true}));
