import {describe,it,before,after} from 'node:test';
import assert from 'node:assert/strict';

function mockFetch(aiResponse){
  return async(url)=>{
    if(url.includes('groq.com'))return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(aiResponse)}}]})};
    return {ok:false,status:500};
  };
}

const origKey=process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY=origKey||'test-key';

describe('phantom item guard',()=>{
  let interpret;
  before(async()=>{
    process.env.GROQ_API_KEY='test-key';
    ({interpret}=await import('../api/match.js'));
  });
  after(()=>{process.env.GROQ_API_KEY=origKey||'';});

  it('strips add operations for products the user never mentioned',async()=>{
    const ai={intent:'edit',reply:'Listo, te anoto dos combo familiares, una Coca-Cola y papas extra.',operations:[
      {type:'add',id:'combo-familiar',qty:2},
      {type:'add',id:'cocacola',qty:1},
      {type:'add',id:'papas',qty:1}
    ],suggest_ids:[]};
    const result=await interpret({transcript:'dame eso',cart:[],history:[],shown:[],focus:null},{fetchImpl:mockFetch(ai)});
    assert.equal(result.intent,'clarify');
    assert.equal(result.operations.length,0);
  });

  it('keeps valid add when product is mentioned in transcript',async()=>{
    const ai={intent:'edit',reply:'Anotado: un combo pechuga.',operations:[
      {type:'add',id:'combo-pechuga',qty:1}
    ],suggest_ids:[]};
    const result=await interpret({transcript:'dame el combo pechuga',cart:[],history:[],shown:[],focus:null},{fetchImpl:mockFetch(ai)});
    assert.equal(result.intent,'edit');
    assert.equal(result.operations.length,1);
    assert.equal(result.operations[0].id,'combo-pechuga');
  });

  it('keeps add for the focus product even without mention',async()=>{
    const ai={intent:'edit',reply:'Anotado.',operations:[
      {type:'add',id:'combo-personal',qty:1}
    ],suggest_ids:[]};
    const result=await interpret({transcript:'dame eso',cart:[],history:[],shown:['combo-personal'],focus:'combo-personal'},{fetchImpl:mockFetch(ai)});
    assert.equal(result.intent,'edit');
    assert.equal(result.operations.length,1);
    assert.equal(result.operations[0].id,'combo-personal');
  });

  it('strips only phantom adds, keeping mentioned ones',async()=>{
    const ai={intent:'edit',reply:'Un cuarto, una coca y papas.',operations:[
      {type:'add',id:'cuarto',qty:1},
      {type:'add',id:'cocacola',qty:1},
      {type:'add',id:'papas',qty:1}
    ],suggest_ids:[]};
    const result=await interpret({transcript:'dame un cuarto',cart:[],history:[],shown:[],focus:null},{fetchImpl:mockFetch(ai)});
    assert.equal(result.intent,'edit');
    assert.equal(result.operations.length,1);
    assert.equal(result.operations[0].id,'cuarto');
  });

  it('allows multiple adds when user mentions multiple products',async()=>{
    const ai={intent:'edit',reply:'Un cuarto y una coca.',operations:[
      {type:'add',id:'cuarto',qty:1},
      {type:'add',id:'cocacola',qty:1}
    ],suggest_ids:[]};
    const result=await interpret({transcript:'dame un cuarto y una coca cola',cart:[],history:[],shown:[],focus:null},{fetchImpl:mockFetch(ai)});
    assert.equal(result.intent,'edit');
    assert.equal(result.operations.length,2);
  });
  it('rechaza una bebida adicional aunque solo haya un producto fantasma',async()=>{
    const ai={intent:'edit',reply:'Un cuarto y una Coca-Cola.',operations:[{type:'add',id:'cuarto',qty:1},{type:'add',id:'cocacola',qty:1}],suggest_ids:[]};
    const result=await interpret({transcript:'dame un cuarto',cart:[],history:[],shown:[],focus:null},{fetchImpl:mockFetch(ai)});
    assert.equal(result.intent,'edit');
    assert.deepEqual(result.operations,[{type:'add',id:'cuarto',qty:1}]);
    assert.doesNotMatch(result.reply,/Coca-Cola/i);
  });
});
