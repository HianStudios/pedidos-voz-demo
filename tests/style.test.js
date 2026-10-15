import test from 'node:test';
import assert from 'node:assert/strict';
import {keepsFacts} from '../server/style.js';
test('la voz de Milo no puede cambiar datos del pedido',()=>{
  const base='Van cuatro combos de alitas y dos combos personales. ¿Sumamos algo más o lo envío a cocina?';
  assert.equal(keepsFacts(base,'¡De una, ñaño! Ya te anoté cuatro combos de alitas y dos combos personales. ¿Algo más o lo mando a cocina?'),true);
  assert.equal(keepsFacts(base,'¡Listo! Tres combos de alitas y dos combos personales. ¿Algo más?'),false,'cambió la cantidad');
  assert.equal(keepsFacts(base,'¡Listo! Cuatro combos de alitas, dos combos personales y una Coca-Cola. ¿Algo más?'),false,'agregó un producto');
  assert.equal(keepsFacts(base,'Anotado todo, ¡buen provecho!'),false,'perdió la pregunta y los productos');
  assert.equal(keepsFacts('Combo familiar cuesta $18,50.','El combo familiar está en $18,50, ideal para compartir.'),true);
  assert.equal(keepsFacts('Combo familiar cuesta $18,50.','El combo familiar está en $17,50.'),false,'cambió el precio');
  assert.equal(keepsFacts('Va un cuarto de pollo sin cebolla. ¿Algo para tomar, o cerramos así?','¡Buenazo! Un cuarto de pollo, cero cebolla. ¿Le sumamos algo para tomar o cerramos?'),false,'«sin cebolla» debe seguir dicho como «sin»');
});
