import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const handlers=Object.fromEntries(await Promise.all(['menu','match','transcribe','orders','order-events'].map(async name=>[name,(await import(`../api/${name}.js`)).default])));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=data=>res.end(JSON.stringify(data));res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');const fn=handlers[pathname.slice(5)];return fn?await fn(req,res):res.status(404).json({error:'Ruta no encontrada.'});}
    // Lista explícita: nunca servir .env ni el código del servidor.
    if(pathname!=='/'&&pathname!=='/index.html'&&pathname!=='/caja.html'&&!/^\/public\/[\w/.-]+\.(js|css|svg)$/.test(pathname)){res.statusCode=404;return res.end('No encontrado');}
    const location=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`);if(!location.startsWith(root)){res.statusCode=403;return res.end();}
    res.setHeader('Content-Type',mime[path.extname(location)]||'text/plain');res.end(await readFile(location));
  }catch{res.statusCode=404;res.end('No encontrado');}
}).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`Mesero: http://localhost:${process.env.PORT||3000}`));
