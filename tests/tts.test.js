import test from 'node:test';
import assert from 'node:assert/strict';
import speak,{voiceProvider} from '../api/speak.js';

test('ElevenLabs Flash v2.5 can be configured and returns audio without exposing the key',async()=>{
  const keys=['ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID','ELEVENLABS_SPEED','ELEVENLABS_MODEL','AZURE_SPEECH_KEY','AZURE_SPEECH_REGION','TTS_PROVIDER'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;
  let request;
  try{
    for(const key of keys)delete process.env[key];
    process.env.ELEVENLABS_API_KEY='test-tts-key';
    process.env.ELEVENLABS_VOICE_ID='test-voice';
    process.env.ELEVENLABS_SPEED='1.08';
    process.env.TTS_PROVIDER='elevenlabs';
    assert.equal(voiceProvider(),'elevenlabs');
    globalThis.fetch=async(url,options)=>{request={url,options};return new Response(new Uint8Array([1,2,3]),{status:200,headers:{'content-type':'audio/mpeg'}});};
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},end(data){this.audio=data;}};
    const req={method:'POST',headers:{host:'localhost'},body:{text:'Van dos combos personales.'},socket:{remoteAddress:'tts-test'}};
    await speak(req,res);
    assert.equal(res.statusCode,200);assert.equal(res.headers['Content-Type'],'audio/mpeg');
    assert.match(request.url,/api\.elevenlabs\.io/);
    assert.equal(request.options.headers['xi-api-key'],'test-tts-key');
    const payload=JSON.parse(request.options.body);
    assert.equal(payload.model_id,'eleven_flash_v2_5');
    assert.equal(payload.voice_settings.speed,1.08);
    assert.equal(res.audio.length,3);
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
  }
});

test('ElevenLabs voice speed is bounded; Azure is used only when selected and configured',async()=>{
  const keys=['ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID','ELEVENLABS_SPEED','AZURE_SPEECH_KEY','AZURE_SPEECH_REGION','TTS_PROVIDER'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;
  try{
    Object.assign(process.env,{ELEVENLABS_API_KEY:'test-key',ELEVENLABS_VOICE_ID:'test-voice',ELEVENLABS_SPEED:'90',AZURE_SPEECH_KEY:'az-test',AZURE_SPEECH_REGION:'eastus',TTS_PROVIDER:'elevenlabs'});
    assert.equal(voiceProvider(),'elevenlabs');
    let payload;
    globalThis.fetch=async(url,options)=>{payload=JSON.parse(options.body);return new Response(new Uint8Array([1,2,3]));};
    const res={setHeader(){},status(code){this.statusCode=code;return this;},end(){}};
    await speak({method:'POST',headers:{host:'localhost'},body:{text:'Hola.'},socket:{remoteAddress:'tts-bound'}},res);
    assert.equal(payload.voice_settings.speed,1.2);
    process.env.TTS_PROVIDER='azure';
    assert.equal(voiceProvider(),'azure');
  }finally{
    globalThis.fetch=oldFetch;
    for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
  }
});
