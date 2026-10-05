import {mkdir,copyFile,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await copyFile('index.html','dist/index.html');
await cp('public','dist/public',{recursive:true});
console.log('Frontend listo en dist/. Las rutas api/ se despliegan como funciones.');
