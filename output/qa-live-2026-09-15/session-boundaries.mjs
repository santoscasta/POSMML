import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-session-qa-'));
process.env.POS_DATA_DIR = directory;
process.env.SHOPIFY_ACCESS_TOKEN = 'qa-fake-token';
const nativeFetch = globalThis.fetch;
const calls = [];
const node = (id, status, opening=50) => ({id:`gid://shopify/Metaobject/${id}`,updatedAt:'2026-09-15T08:00:00Z',fields:[{key:'status',value:status},{key:'opening_amount',value:String(opening)}]});
let sessions = [node(1,'OPEN')];
globalThis.fetch = async (url, options) => {
  if (!String(url).includes('/admin/api/')) throw new Error('External request blocked');
  const {query,variables} = JSON.parse(options.body);
  calls.push({query,variables});
  let data;
  if(query.includes('metaobjectUpdate')) {
    const found = sessions.find(n=>n.id===variables.id);
    for(const field of variables.metaobject.fields){const old=found.fields.find(f=>f.key===field.key); if(old)old.value=field.value;else found.fields.push(field);}
    data={metaobjectUpdate:{metaobject:found,userErrors:[]}};
  } else if(query.includes('metaobjectCreate')) {
    const created={...node(999,'OPEN'),fields:variables.metaobject.fields};sessions.unshift(created);
    data={metaobjectCreate:{metaobject:created,userErrors:[]}};
  } else if(query.includes('metaobject(id:'))data={metaobject:sessions.find(n=>n.id===variables.id)};
  else if(query.includes('PosPaymentHistory'))data={orders:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}};
  else if(query.includes('PosSessions'))data={metaobjects:{nodes:sessions,pageInfo:{hasNextPage:false,endCursor:null}}};
  else if(query.includes('metaobjects('))data={metaobjects:{edges:sessions.slice(0,10).map(n=>({node:n}))}};
  else throw new Error('Unrecognized query');
  return new Response(JSON.stringify({data}),{status:200});
};
const {default:router}=await import('../../server/routes/sessions.js');
const {currentSession}=await import('../../server/lib/posService.js');
const {default:gql}=await import('../../server/lib/shopifyGQL.js');
const app=express();app.use(express.json());app.use(router);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
async function request(route,body){const r=await nativeFetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
try {
  const missing=[];
  for(const [label,value] of [['omitted',undefined],['null',null],['empty','']]){
    sessions=[node(1,'OPEN')];calls.length=0;
    const response=await request('/sessions/close',{sessionId:sessions[0].id,...(value===undefined?{}:{closingAmount:value})});
    assert.equal(response.status,200);assert.equal(response.body.closingAmount,0);assert.equal(response.body.difference,-50);
    missing.push({label,response,mutations:calls.filter(c=>c.query.includes('mutation'))});
  }
  sessions=[...Array.from({length:10},(_,i)=>node(i+2,'CLOSED')),node(1,'OPEN')];calls.length=0;
  const current=await request('/sessions/current');assert.deepEqual(current,{status:200,body:null});
  const opened=await request('/sessions/open',{openingAmount:20,cashierName:'QA simulated'});assert.equal(opened.status,200);
  let checkoutSessionError;try{await currentSession(gql);}catch(e){checkoutSessionError=e.message;}
  assert.match(checkoutSessionError,/varias sesiones abiertas/);
  const result={safety:'All Shopify calls intercepted; fake token; temporary POS_DATA_DIR; no remote mutations',missingClosingAmount:missing,oldOpenSession:{current,opened,openCount:sessions.filter(n=>n.fields.some(f=>f.key==='status'&&f.value==='OPEN')).length,checkoutSessionError,mutations:calls.filter(c=>c.query.includes('mutation'))}};
  fs.writeFileSync(new URL('./session-boundaries-results.json',import.meta.url),JSON.stringify(result,null,2));
  console.log(JSON.stringify({missingClosingAmount:missing.map(r=>({label:r.label,status:r.response.status,closing:r.response.body.closingAmount,difference:r.response.body.difference})),oldOpenSession:result.oldOpenSession},null,2));
} finally {globalThis.fetch=nativeFetch;await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
