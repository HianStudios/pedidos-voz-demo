// Contexto de una aclaración, separado del carrito que ya tiene cantidades validadas.
// No depende de que la frase original siga entre los últimos mensajes del chat.
export function readMemory(value){
  if(!value||!Array.isArray(value.turns)||typeof value.question!=='string')return null;
  const turns=value.turns.filter(t=>typeof t==='string'&&t.trim()).slice(0,8).map(t=>t.slice(0,1200));
  return turns.length?{turns,question:value.question.slice(0,600)}:null;
}
export function nextMemory(previous,transcript,result){
  const old=readMemory(previous);
  if(result.source==='local'&&result.intent==='clarify'&&!result.awaiting)return old;
  if(result.awaiting===null&&result.source!=='fallback'&&['edit','keep'].includes(result.intent))return null;
  const question=result.awaiting||(['clarify'].includes(result.intent)?result.reply:null);
  if(!question&&result.source!=='fallback')return old;
  const turns=[...(old?.turns||[])];
  // Mantener la solicitud original incluso si hay muchas aclaraciones o falla el proveedor.
  if(turns.at(-1)!==transcript)turns.push(transcript);
  if(turns.length>8)turns.splice(1,turns.length-8);
  return {turns,question:question||old?.question||'Hay una parte del pedido pendiente de entender.'};
}
