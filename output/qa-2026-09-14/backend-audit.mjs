import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.SHOPIFY_ACCESS_TOKEN='qa-no-real-token';
process.env.POS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'pos-qa-'));
const realFetch=globalThis.fetch;
let mode='voucher-loss',creates=0;
const giftCard=n=>({id:`gid://shopify/GiftCard/${n}`,balance:{amount:'20',currencyCode:'EUR'},initialValue:{amount:'20',currencyCode:'EUR'},lastCharacters:'1234',maskedCode:'****1234',createdAt:'2026-09-14T00:00:00Z',enabled:true,transactions:{edges:[]}});
const calls=[];
const sessionNode={id:'gid://shopify/Metaobject/1',updatedAt:'2026-09-14T08:00:00Z',fields:[{key:'status',value:'OPEN'},{key:'opening_amount',value:'50'}]};
globalThis.fetch=async(url,init)=>{
 if(!String(url).includes('/admin/api/'))return realFetch(url,init);
 const {query,variables}=JSON.parse(init.body);calls.push({query,variables});let data;
 if(mode==='force'&&query.includes('metaobjects(')) data={metaobjects:{edges:[{node:sessionNode}]}};
 else if(mode==='force'&&query.includes('metaobjectUpdate')) data={metaobjectUpdate:{metaobject:null,userErrors:[{message:'Close rejected by Shopify'}]}};
 else if(mode==='force'&&query.includes('metaobjectCreate')) data={metaobjectCreate:{metaobject:{...sessionNode,id:'gid://shopify/Metaobject/2'},userErrors:[]}};
 else if(query.includes('giftCardCreate')){creates++;if(creates===1)throw new Error('Simulated response lost AFTER remote creation');data={giftCardCreate:{giftCard:giftCard(creates),giftCardCode:'QA-SECOND',userErrors:[]}};}
 else if(query.includes('giftCards'))data={giftCards:{edges:Array.from({length:Math.min(60,variables?.first||250)},(_,n)=>({node:giftCard(n)}))}};
 else throw new Error('Unexpected query '+query);
 return new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
};
const {default:vouchers}=await import('../../server/routes/vouchers.js');
const {default:sessions}=await import('../../server/routes/sessions.js');
const app=express();app.use(express.json());app.use(vouchers);app.use(sessions);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
const results=[];
try{
 const request=()=>realFetch(base+'/vouchers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:20,customerName:'QA'})});
 const first=await request();const second=await request();
 results.push({id:'QA-05',result:'reproduced',firstStatus:first.status,secondStatus:second.status,remoteCreations:creates,explanation:'Same issue request after response loss creates another gift card'});
 const list=await (await realFetch(base+'/vouchers')).json();const stats=await (await realFetch(base+'/vouchers/stats')).json();
 results.push({id:'QA-06',result:'reproduced',availableInShopifyMock:60,listCount:list.length,statsTotal:stats.total,listingHasCursor:calls.filter(c=>c.query.includes('sortKey: CREATED_AT')).some(c=>c.query.includes('after:'))});
 mode='force';
 const forced=await realFetch(base+'/sessions/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({openingAmount:50,force:true})});
 results.push({id:'QA-07',result:'reproduced',forcedOpenStatus:forced.status,body:await forced.json(),explanation:'Shopify rejected prior session close; endpoint still creates a second open session'});
 console.log(JSON.stringify(results,null,2));fs.writeFileSync('output/qa-2026-09-14/backend-results.json',JSON.stringify(results,null,2));
}finally{server.close();fs.rmSync(process.env.POS_DATA_DIR,{recursive:true,force:true});}
