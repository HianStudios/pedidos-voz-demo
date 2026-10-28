import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {total,money,parseRating,productHits,interpretLocal,applyOperations} from '../public/js/domain.js';
import {plausibleName} from '../public/js/conversation.js';
import {menu} from '../server/catalog.js';

describe('money()',()=>{
  it('formats positive cents',()=>{assert.ok(money(250).includes('2'));});
  it('clamps negative to zero',()=>{assert.equal(money(-100),money(0));});
});

describe('total()',()=>{
  it('returns 0 for unknown product id',()=>{
    assert.equal(total([{id:'nonexistent',qty:1,notes:[]}],menu),0);
  });
  it('sums known products',()=>{
    const p=menu.find(m=>m.available);
    assert.equal(total([{id:p.id,qty:2,notes:[]}],menu),p.price*2);
  });
});

describe('parseRating() edge cases',()=>{
  it('rejects 0.5',()=>{assert.equal(parseRating('0.5'),null);});
  it('rejects -1',()=>{assert.equal(parseRating('-1'),null);});
  it('rejects 6.5',()=>{assert.equal(parseRating('6.5'),null);});
  it('accepts 4.5',()=>{assert.equal(parseRating('4.5'),4.5);});
  it('accepts 3',()=>{assert.equal(parseRating('3'),3);});
  it('accepts cuatro y media',()=>{assert.equal(parseRating('cuatro y media'),4.5);});
  it('accepts 5 estrellas',()=>{assert.equal(parseRating('5 estrellas'),5);});
  it('accepts 1',()=>{assert.equal(parseRating('1'),1);});
});

describe('productHits() Mesa filter',()=>{
  it('excludes Mesa items',()=>{
    const hits=productHits('dame salsas',menu);
    assert.equal(hits.length,0);
  });
  it('matches regular products',()=>{
    const hits=productHits('dame un cuarto',menu);
    assert.ok(hits.some(h=>h.id==='cuarto'));
  });
});

describe('plausibleName() closing phrases',()=>{
  for(const phrase of ['eso es todo','listo','dale','así está bien','con eso','perfecto','ya','ok','claro','simon','correcto','nada más']){
    it(`rejects "${phrase}"`,()=>{assert.equal(plausibleName(phrase),false);});
  }
  for(const name of ['Pérez','Juan Carlos','María José','López']){
    it(`accepts "${name}"`,()=>{assert.equal(plausibleName(name),true);});
  }
});

describe('interpretLocal qty clamping',()=>{
  it('clamps qty 0 to 1',()=>{
    const r=interpretLocal('dame 0 cuartos',[],menu);
    assert.ok(r?.operations?.[0]?.qty>=1);
  });
  it('clamps qty 15 to max 20',()=>{
    const r=interpretLocal('dame 15 cuartos',[],menu);
    if(r?.operations?.length)assert.ok(r.operations[0].qty<=20);
  });
});

describe('interpretLocal unavailable bare-name',()=>{
  it('returns null for unavailable product by bare name',()=>{
    const modMenu=menu.map(p=>p.id==='sprite'?{...p,available:false}:p);
    const r=interpretLocal('sprite',[],modMenu);
    assert.equal(r,null);
  });
});
