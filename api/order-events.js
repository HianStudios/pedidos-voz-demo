import {endpoint,guard,staff,liveOrders,fail,rateLimit} from '../server/http.js';
import {streamOrders} from '../server/order-feed.js';
// Auth lives in an HTTP header, never a URL or browser persistent storage.
export default endpoint(async(req,res)=>{
 guard(req,['GET']);if(!liveOrders())throw fail('Caja compartida no configurada.',503);
 staff(req);await rateLimit(req,'order-events',12);await streamOrders(res);
});
