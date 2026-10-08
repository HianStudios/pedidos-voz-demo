import {normalize} from './domain.js';
// Navigation is a complete intent, not the presence of «quiero» or a product word.
export function navigation(text){
  const n=normalize(text).replace(/\b(por favor|a ver)\b/g,'').trim();
  if(/\b(no|sin|quita|agrega|dame|deme|ponme|cuanto|cuesta|precio)\b/.test(n))return null;
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
