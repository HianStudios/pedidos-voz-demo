// Fetch-based SSE keeps staff credentials in headers and supports cancellation.
export async function consumeEvents(response,onEvent){
 if(!response.body)throw new Error('Streaming no disponible');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');let end;
  while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=block.split('\n').find(l=>l.startsWith('event:'))?.slice(6).trim();const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(event&&data)onEvent(event,JSON.parse(data));}
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
