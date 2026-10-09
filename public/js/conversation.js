import {normalize} from './domain.js';
// Navigation is a complete intent, not the presence of «quiero» or a product word.
export function navigation(text){
  // Muletillas al inicio («sí, muéstrame el menú», «oye Milo, los combos») no cambian la intención.
  const n=normalize(text).replace(/\b(por favor|a ver)\b/g,'').trim().replace(/^(?:(?:si|ya|oye|bueno|ok|okey|dale|listo|milo|este|eh|mira|porfa)\s+)+/,'').trim();
  if(/\b(no|sin|quita|cuanto|cuesta|precio)\b/.test(n))return null;
  // Pedir una categoría sin producto concreto («dame unas bebidas», «quiero un combo», «algo de tomar»)
  // es pedir ver las opciones: se muestran y Milo pregunta cuál. «Dame un combo familiar» no entra aquí.
  const rest=n.replace(/^(?:(?:me |nos )?(?:das|da|dame|deme|danos|traeme|traenos|trae|ponme|pon|agrega|agregame|anade|quiero|queremos|quisiera|me gustaria|regalame|tienes|tienen|hay)\s+)?(?:(?:un|una|unos|unas|algo de|algo para|algun|alguna|algunos|algunas|los|las|el|la|unas cuantas)\s+)?/,'').replace(/\s+(?:tambien|nomas|no mas|porfa|pues|entonces)$/,'').trim();
  const generic=[['Bebidas',/^(bebidas?|gaseosas?|colas?|refrescos?|jugos?|tomar|beber|frio|algo frio|colitas?|bebida fria|heladas?|frias?|heladita|friita)$/],['Combos',/^(combos?|combitos?|paquetes?)$/],['Platos',/^(platos?|platos fuertes?|platos solos?|segundos?|platitos?)$/],['Extras',/^(extras?|acompanamientos?|adicionales?|guarniciones?)$/],['all',/^(comer|comida|algo de comer|de comer)$/]];
  if(rest!==n||/^(?:algo (?:de|para) )/.test(n))for(const [category,re] of generic)if(re.test(rest))return category;
  if(/\b(agrega|dame|deme|ponme)\b/.test(n))return null;
  const browse=/\b(ver|mirar|muestrame|ensename|mostrar|que tienes|que hay|que combos|que bebidas|que platos|que extras|opciones)\b/.test(n);
  const categories=[['Combos',/\b(combos?|paquetes?)\b/],['Platos',/\b(solos?|platos?|sueltos?)\b/],['Bebidas',/\b(bebidas?|gaseosas?|tomar|refrescos?)\b/],['Extras',/\b(extras?|acompanamientos?|adicionales?)\b/]];
  for(const [category,re] of categories){
    if(re.test(n)&&(browse||/^(?:los |las |el |la |quiero |prefiero )?(?:solo|solos|platos|platos solos|combo|combos|bebidas|extras)$/.test(n)||/^(y )?(para tomar|las bebidas|los extras)$/.test(n)))return category;
  }
  if(/^(?:(?:quiero |puedo |dejame )?(?:ver|mirar) |(?:muestrame|ensename|abre) )?(?:el )?(menu|carta)$/.test(n)||/^(que tienes|que hay|que venden|que ofrecen)$/.test(n))return 'all';
  return null;
}
export function plausibleName(text){
  const n=normalize(text);
  return /^[\p{L}][\p{L} '\-]{1,59}$/u.test(text.trim())&&!/\b(no|si|espera|quita|agrega|quiero|menu|pollo|cola|agua|cuanto|alergico|alergia|confirmar|confirma|cancelar|cancela|dame|deme|ver|mejor|todavia|bebida|soy|somos|sin|gracias)\b/.test(n);
}
export function cartSignature(cart,name){return JSON.stringify({cart,name});}
