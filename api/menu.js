import {restaurant,menu} from '../server/catalog.js';
import {neuralVoice} from './speak.js';
import {endpoint,guard,json,liveOrders,session,rateLimit} from '../server/http.js';
export default endpoint(async(req,res)=>{guard(req,['GET']);await rateLimit(req,'menu',90);if(liveOrders())session(req,res);json(res,200,{restaurant,menu,mode:liveOrders()?'live':'demo',aiAvailable:Boolean(process.env.GROQ_API_KEY),voice:neuralVoice()?'neural':'browser'});});
