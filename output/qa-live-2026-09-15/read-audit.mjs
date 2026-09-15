import fs from 'node:fs';
import gql from '../../server/lib/shopifyGQL.js';
import express from 'express';
process.env.POS_DATA_DIR = new URL('./isolated-journal',import.meta.url).pathname;
const products=[];let after=null;
do {const d=await gql(`query($after:String){products(first:50,after:$after){nodes{id title status productType variants(first:100){nodes{id title price inventoryQuantity inventoryPolicy} pageInfo{hasNextPage}} metafield(namespace:"custom",key:"categorias"){value}} pageInfo{hasNextPage endCursor}}}`,{after});products.push(...d.products.nodes);after=d.products.pageInfo.hasNextPage?d.products.pageInfo.endCursor:null;}while(after);
fs.writeFileSync(new URL('./products-before.json',import.meta.url),JSON.stringify(products,null,2),{mode:0o600});
const summary={products:products.length,variants:products.reduce((n,p)=>n+p.variants.nodes.length,0),missingCategory:products.filter(p=>!p.metafield).map(p=>p.id),truncatedVariants:products.filter(p=>p.variants.pageInfo.hasNextPage).map(p=>p.id),zeroStock:products.flatMap(p=>p.variants.nodes).filter(v=>v.inventoryQuantity<=0).length,moreThan20:products.filter(p=>p.variants.nodes.length>20).length};
const app=express();for(const name of ['sessions','vouchers','dashboard'])app.use('/api',(await import(`../../server/routes/${name}.js`)).default);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;const routes=[];
try{for(const route of ['/sessions/current','/sessions','/vouchers','/vouchers/stats','/dashboard']){const start=Date.now();const r=await fetch(base+'/api'+route);const body=await r.json();fs.writeFileSync(new URL('./read-'+route.replaceAll('/','-')+'.json',import.meta.url),JSON.stringify(body,null,2),{mode:0o600});routes.push({route,status:r.status,ms:Date.now()-start,...(r.ok?{count:Array.isArray(body)?body.length:undefined}:{error:body.error})});}}finally{server.close();}
console.log(JSON.stringify({summary,routes},null,2));fs.writeFileSync(new URL('./read-summary.json',import.meta.url),JSON.stringify({summary,routes},null,2));
