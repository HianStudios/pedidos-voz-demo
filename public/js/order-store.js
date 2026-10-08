export const storageKey='mesero-brasa-v2';
export const ordersKey=`${storageKey}-orders`;
export function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
export function saveOrders(orders){
  localStorage.setItem(ordersKey,JSON.stringify(orders));
  if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('brasa-orders');channel.postMessage('changed');channel.close();}
}
export function observeOrders(callback){
  const onStorage=e=>{if(e.key===ordersKey)callback();};window.addEventListener('storage',onStorage);
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('brasa-orders'):null;
  if(channel)channel.onmessage=callback;
  return ()=>{window.removeEventListener('storage',onStorage);channel?.close();};
}
