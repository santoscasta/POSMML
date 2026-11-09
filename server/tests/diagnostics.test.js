import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { sanitizeClientEvent, errorDetails } from '../../shared/diagnostics.js';
import { requestDiagnostics, logEvent, logError, observeShopifyResult } from '../lib/diagnostics.js';
import { createDiagnosticsRouter } from '../routes/diagnostics.js';

const privateData = 'ana.private@example.com';
function capture(t) {
  const records = [];
  for (const method of ['log', 'warn', 'error']) {
    const original = console[method];
    console[method] = value => records.push(JSON.parse(value));
    t.after(() => { console[method] = original; });
  }
  return records;
}

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('client diagnostics keep only known fields, routes and locations, without messages or personal data', () => {
  const id = randomUUID();
  const entry = sanitizeClientEvent({ event:'ui.runtime_error', clientTime:new Date().toISOString(),
    screen:`/orders?email=${privateData}`, requestId:id, source:`https://pos.example/assets/index-abc.js?token=${privateData}`,
    frames:[`Error for ${privateData}`, `at render (https://pos.example/assets/index-abc.js:1:42)`],
    message:privateData, authorization:'Bearer SECRET', body:{email:privateData}, html:privateData,
    actorId:privateData, route:`/vouchers/${privateData}?code=PRIVATE`, operation:'GetOrders',
    errorType:privateData, errorCode:privateData, line:12, durationMs:Infinity });
  assert.equal(entry.screen, '/orders');
  assert.equal(entry.source, '/assets/index-abc.js');
  assert.deepEqual(entry.frames, ['/assets/index-abc.js:1:42']);
  assert.equal(entry.requestId, id);
  assert.equal(entry.route, '/vouchers');
  assert.equal(entry.durationMs, undefined);
  assert.doesNotMatch(JSON.stringify(entry), /private@example|SECRET|PRIVATE|Bearer/);
  assert.equal(sanitizeClientEvent({event:'invented.error',message:privateData}), null);
  assert.equal(sanitizeClientEvent({event:'ui.started', clientTime:'1900-01-01',printId:privateData}).clientTime, undefined);
});

test('server error diagnostics retain useful categories and frames without copying exception messages', t => {
  const records = capture(t);
  const error = new Error(`No metaobject definition exists for type ${privateData}`);
  error.stack = `${error.message}\n at work (file:///app/server/lib/posService.js:123:45)\n at ${privateData}`;
  logError('test.error', error);
  assert.equal(records[0].category, 'metaobject_definition_missing');
  assert.deepEqual(records[0].frames, ['server/lib/posService.js:123:45']);
  assert.doesNotMatch(JSON.stringify(records), /private@example/);
  assert.equal(errorDetails(new TypeError(privateData)).errorType, 'TypeError');
});

test('GraphQL errors and rejected mutations are logged even with HTTP 200, without payload values', t => {
  const records = capture(t);
  observeShopifyResult({ errors:[{message:`Throttled ${privateData}`,extensions:{code:'THROTTLED'}}],
    data:{ orderMarkAsPaid:{order:null,userErrors:[{message:privateData,field:['input']}]}} },
  {operation:'PosPaid',status:200,durationMs:200});
  assert.equal(records[0].event, 'shopify.failed');
  assert.deepEqual(records[0].errorCodes, ['THROTTLED']);
  assert.ok(records[0].categories.includes('throttled'));
  assert.equal(records[0].rejectionCount, 1);
  assert.doesNotMatch(JSON.stringify(records), /private@example/);
});

test('concurrent requests correlate their response, asynchronous work and completion without logging URLs or bodies', async t => {
  const records = capture(t);
  const app = express(); app.use(requestDiagnostics()); app.use(express.json());
  app.post('/api/vouchers/:id', async (req,res) => {
    await new Promise(resolve=>setTimeout(resolve,Math.random()*15));
    logEvent('test.inside'); res.json({ok:true});
  });
  const base = await listen(t, app);
  const ids = Array.from({length:8},()=>randomUUID());
  const clientId = randomUUID();
  await Promise.all(ids.map(async id => {
    const response = await fetch(`${base}/api/vouchers/${privateData}?secret=HIDDEN`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Request-ID':id,'X-POS-Client-ID':clientId,Authorization:'Bearer SECRET'},
      body:JSON.stringify({email:privateData,code:'PRIVATE',notes:privateData}),
    });
    assert.equal(response.headers.get('X-Request-ID'), id);
    assert.equal(response.status,200); await response.text();
  }));
  for (const id of ids) {
    const related = records.filter(r=>r.requestId===id);
    assert.deepEqual(related.map(r=>r.event), ['http.started','test.inside','http.completed']);
    assert.ok(related.every(r=>r.clientId===clientId));
    assert.equal(related.at(-1).route, '/api/vouchers/:id');
  }
  assert.doesNotMatch(JSON.stringify(records), /private@example|SECRET|HIDDEN|PRIVATE/);
});

test('slow requests log while waiting and errors retain safe response codes and a generated request ID', async t => {
  const records = capture(t);
  const app = express(); app.use(requestDiagnostics({slowMs:10}));
  app.get('/api/checkout', async (req,res) => { await new Promise(resolve=>setTimeout(resolve,40)); res.status(409).json({error:privateData,code:'BUSY'}); });
  const base = await listen(t,app);
  const response = await fetch(`${base}/api/checkout`, {headers:{'X-Request-ID':privateData}});
  assert.match(response.headers.get('X-Request-ID'), /^[a-f0-9-]{36}$/);
  await response.text();
  assert.ok(records.some(r=>r.event==='http.waiting'));
  assert.equal(records.at(-1).status,409);
  assert.equal(records.at(-1).errorCode,'BUSY');
  assert.doesNotMatch(JSON.stringify(records), /private@example/);
});

test('diagnostic ingestion requires an authenticated actor, bounds batches, strips spoofed identities and rate limits', async t => {
  const logs = [];
  const app = express(); app.use(express.json());
  app.use((req,res,next)=>{if(req.get('Authorization')==='Bearer test') req.user={id:'real-user'};next();});
  app.use('/api',createDiagnosticsRouter({log:(event,details)=>logs.push({event,...details})}));
  const base = await listen(t,app);
  const send = (events,auth=true)=>fetch(`${base}/api/diagnostics/events`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:JSON.stringify({events})});
  assert.equal((await send([{event:'ui.started'}],false)).status,401);
  assert.equal((await send(Array(21).fill({event:'ui.started'}))).status,400);
  const event={event:'print.error',clientTime:new Date().toISOString(),actorId:privateData,screen:'/caja',message:privateData};
  for(let i=0;i<6;i++) assert.equal((await send(Array(20).fill(event))).status,204);
  const limited = await send([event]);
  assert.equal(limited.status,429);
  assert.ok(Number(limited.headers.get('Retry-After'))>0);
  assert.equal(logs.length,120);
  assert.ok(logs.every(log=>log.actorId==='real-user'));
  assert.doesNotMatch(JSON.stringify(logs), /private@example/);
});

test('a broken logging sink never throws into a business operation', t => {
  const original = console.log;
  t.after(()=>{console.log=original;});
  console.log=()=>{throw Error('Broken stdout');};
  assert.doesNotThrow(()=>logEvent('test.ok'));
});
