import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {answerFromMenu,isQuestion} from '../public/js/domain.js';
import {menu} from '../server/catalog.js';

describe('isQuestion',()=>{
  it('detecta preguntas por signo',()=>{assert.ok(isQuestion('¿qué trae el combo?'));});
  it('detecta preguntas por palabra inicial',()=>{assert.ok(isQuestion('que trae el combo'));});
  it('detecta "es picante"',()=>{assert.ok(isQuestion('es picante'));});
  it('detecta "tiene ensalada"',()=>{assert.ok(isQuestion('tiene ensalada'));});
  it('rechaza pedidos directos',()=>{assert.ok(!isQuestion('dame dos cuartos'));});
  it('rechaza "quiero un combo"',()=>{assert.ok(!isQuestion('quiero un combo personal'));});
  it('rechaza "ponme tres"',()=>{assert.ok(!isQuestion('ponme tres familiares'));});
});

describe('answerFromMenu',()=>{
  const available=menu.filter(p=>p.available!==false);
  it('responde si es picante (con ají)',()=>{
    const r=answerFromMenu('¿es picante el cuarto?',available,{});
    assert.ok(r);
    assert.equal(r.intent,'clarify');
    assert.ok(/ají/.test(r.reply));
  });
  it('responde si NO es picante',()=>{
    const r=answerFromMenu('¿la pechuga es picante?',available,{});
    assert.ok(r);
    assert.ok(/no.*picante/i.test(r.reply));
  });
  it('responde que el combo trae bebida',()=>{
    const r=answerFromMenu('¿el combo personal viene con bebida?',available,{});
    assert.ok(r);
    assert.ok(/gaseosa|bebida/i.test(r.reply));
  });
  it('responde para cuántos alcanza',()=>{
    const r=answerFromMenu('¿para cuántos alcanza el entero?',available,{});
    assert.ok(r);
    assert.ok(/3 a 4|personas/i.test(r.reply));
  });
  it('responde qué se puede quitar',()=>{
    const r=answerFromMenu('¿qué le puedo quitar al cuarto?',available,{});
    assert.ok(r);
    assert.ok(/papas|ensalada|ají/i.test(r.reply));
  });
  it('responde quién eres',()=>{
    const r=answerFromMenu('¿quién eres?',available,{});
    assert.ok(r);
    assert.ok(/Milo/i.test(r.reply));
  });
  it('responde si tiene ingrediente',()=>{
    const r=answerFromMenu('¿el cuarto tiene papas?',available,{});
    assert.ok(r);
    assert.ok(/sí/i.test(r.reply));
  });
  it('responde que NO tiene ingrediente',()=>{
    const r=answerFromMenu('¿la pechuga tiene papas?',available,{});
    assert.ok(r);
    assert.ok(/no/i.test(r.reply));
  });
  it('usa focus si no nombra producto',()=>{
    const r=answerFromMenu('¿es picante?',available,{focus:'cuarto'});
    assert.ok(r);
    assert.ok(/Cuarto/i.test(r.reply));
  });
  it('retorna null para preguntas fuera de patrón',()=>{
    const r=answerFromMenu('¿a qué hora cierran?',available,{});
    assert.equal(r,null);
  });
  it('responde cuánto cuesta un producto',()=>{
    const r=answerFromMenu('¿cuánto cuesta el cuarto?',available,{});
    assert.ok(r);
    assert.ok(/\$/.test(r.reply));
  });
  it('responde qué hay de comer',()=>{
    const r=answerFromMenu('¿qué tienen?',available,{});
    assert.ok(r);
    assert.equal(r.intent,'menu');
  });
  it('responde cuál es el más barato',()=>{
    const r=answerFromMenu('¿cuál es el más barato?',available,{});
    assert.ok(r);
    assert.ok(/económico|barato|\$/i.test(r.reply));
  });
});
