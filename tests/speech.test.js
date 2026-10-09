import test from 'node:test';
import assert from 'node:assert/strict';
import {speakable,sentences,numberWords,moneyWords} from '../public/js/speech-text.js';
import {menu} from '../server/catalog.js';
import {interpretLocal,describeOps} from '../public/js/domain.js';
test('precios y medidas se dicen como un mesero',()=>{
  assert.equal(speakable('El cuarto cuesta $4,50.'),'El cuarto cuesta cuatro dólares con cincuenta.');
  assert.equal(speakable('Son $5.75'),'Son cinco dólares con setenta y cinco');
  assert.equal(speakable('Total $1.500,00'),'Total mil quinientos dólares');
  assert.equal(speakable('$1,00, $21,00 y $0,50'),'un dólar, veintiún dólares y cincuenta centavos');
  assert.equal(speakable('Botella de 400 ml 🥤'),'Botella de cuatrocientos mililitros');
  assert.equal(numberWords(116),'ciento dieciséis');assert.equal(moneyWords(1850),'dieciocho dólares con cincuenta');
});
test('frases cortas se agrupan para no sonar entrecortado',()=>{
  assert.deepEqual(sentences('Listo. Van dos cuartos de pollo. ¿Algo más?'),['Listo. Van dos cuartos de pollo.','¿Algo más?']);
});
test('Milo dice lo que anotó, con género y plural correctos',()=>{
  assert.equal(describeOps([{type:'add',id:'cuarto',qty:2},{type:'add',id:'cocacola',qty:1}],menu),'Van dos cuartos de pollo y una Coca-Cola.');
  assert.equal(describeOps([{type:'add',id:'combo-familiar',qty:1}],menu),'Va un combo familiar.');
  assert.equal(describeOps([{type:'set',id:'cuarto',qty:1}],menu),'Listo, queda un cuarto de pollo.');
});
test('ofrece bebida una sola vez y nunca si ya hay bebida o combo',()=>{
  assert.match(interpretLocal('quiero dos cuartos de pollo',[],menu).reply,/para tomar/);
  assert.doesNotMatch(interpretLocal('quiero dos cuartos de pollo',[],menu,null,{drinkOffered:true}).reply,/para tomar/);
  assert.doesNotMatch(interpretLocal('quiero un combo familiar',[],menu).reply,/para tomar/);
  assert.doesNotMatch(interpretLocal('dos cuartos de pollo y una coca cola',[],menu).reply,/para tomar/);
});
test('marcas en inglés se pronuncian como se dicen',()=>{
  assert.equal(speakable('Una Sprite y unas alitas BBQ.'),'Una Spráit y unas alitas bibikiú.');
  assert.equal(speakable('Spritely'),'Spritely');
});
