import {interpret} from './match.js';
import {cases} from '../server/eval-cases.js';
import {endpoint,guard,json,fail} from '../server/http.js';
// Evaluación de comprensión con el modelo real. Solo en vistas previas de Vercel (protegidas por login
// del equipo) o con EVAL_ENABLED=1; en producción responde 404.
export default endpoint(async(req,res)=>{
  guard(req,['GET']);
  if(process.env.VERCEL_ENV!=='preview'&&process.env.EVAL_ENABLED!=='1')throw fail('Ruta no encontrada.',404);
  const params=new URL(req.url,'http://localhost').searchParams;
  const from=Math.max(0,Number(params.get('from'))||0),n=Math.min(12,Math.max(1,Number(params.get('n'))||2));
  const effort=['low','medium','high'].includes(params.get('effort'))?params.get('effort'):undefined;
  // Una a una: el plan gratuito de Groq permite 8.000 tokens por minuto (≈2 frases).
  const results=[];
  for(const c of cases.slice(from,from+n))results.push(await (async()=>{
    const started=Date.now();
    try{
      const r=await interpret({transcript:c.say,cart:c.cart||[],history:c.history||[],category:c.category,lastId:c.lastId,table:5},{effort,debug:true});
      return {id:c.id,say:c.say,ok:Boolean(c.expect(r)),ms:Date.now()-started,source:r.source,intent:r.intent,category:r.category,operations:r.operations,suggest:r.suggest_ids,reply:r.reply,...(r.error?{error:r.error}:{})};
    }catch(e){return {id:c.id,say:c.say,ok:false,ms:Date.now()-started,error:e.message};}
  })());
  json(res,200,{total:cases.length,from,effort:effort||process.env.GROQ_REASONING||'low',passed:results.filter(r=>r.ok).length,count:results.length,results});
});
