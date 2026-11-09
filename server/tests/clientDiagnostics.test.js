import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const bundle = await build({ stdin:{ contents:`export * from './src/utils/diagnostics.ts'; export {apiGet,apiPost} from './src/utils/apiClient.ts'; export {shopifyGraphQL} from './src/utils/graphqlClient.ts'; export {setSessionToken} from './src/utils/auth.ts';`,resolveDir:process.cwd() },
  bundle:true,write:false,format:'iife',globalName:'Client',define:{'import.meta.env':'{"VITE_API_URL":"/api"}'},target:'es2023' });

function browser({ authenticated=true }={}) {
  const calls=[];
  let clock=100;
  let wall=Date.now();
  const intervals=[];
  const timeouts=new Map();
  let timerId=0;
  const storage=new Map(authenticated?[['pos.access-session.v1','Bearer-private-token']]:[]);
  const window=new EventTarget(); window.location={href:'https://pos.example/orders?email=private@example.com',pathname:'/orders'};
  const document=new EventTarget(); document.visibilityState='visible';
  document.querySelector=()=>({src:'https://pos.example/assets/index-test123.js'});
  const navigator={onLine:true};
  class ErrorEvent extends Event { constructor(error){super('error');this.error=error;this.filename='https://pos.example/assets/index-test123.js?password=PRIVATE';this.lineno=1;this.colno=42;} }
  class ClockDate extends Date { static now(){return wall;} }
  const context=vm.createContext({window,document,navigator,Headers,Response,URL,AbortSignal,ErrorEvent,Date:ClockDate,
    crypto:{randomUUID},performance:{now:()=>clock},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    setTimeout:(callback,delay)=>{const id=++timerId;timeouts.set(id,{callback,delay});return id;},
    clearTimeout:id=>timeouts.delete(id),setInterval:(callback,delay)=>intervals.push({callback,delay}),
    fetch:async (url,options)=>{calls.push({url,options});return new Response(null,{status:204});},
  });
  vm.runInContext(bundle.outputFiles[0].text,context);
  const events=()=>calls.filter(c=>c.url.endsWith('/diagnostics/events')).flatMap(c=>JSON.parse(c.options.body).events);
  return {client:context.Client,calls,context,window,document,navigator,intervals,timeouts,events,
    advance:ms=>{clock+=ms;wall+=ms;},error:error=>new ErrorEvent(error),setFetch:fn=>{context.fetch=async(url,options)=>{calls.push({url,options});return fn(url,options);};}};
}

test('global browser errors retain build, source and classification while dropping private messages',async()=>{
  const b=browser(); b.client.installDiagnostics();
  const error=new TypeError('private@example.com token=PRIVATE');
  error.stack='TypeError: private@example.com\n at render (https://pos.example/assets/index-test123.js:1:42)';
  b.window.dispatchEvent(b.error(error));
  await Promise.resolve(); await b.client.flushDiagnostics();
  const events=b.events();
  const captured=events.find(e=>e.event==='ui.runtime_error');
  assert.equal(captured.errorType,'TypeError');
  assert.equal(captured.build,'index-test123.js');
  assert.equal(captured.screen,'/orders');
  assert.deepEqual(captured.frames,['/assets/index-test123.js:1:42']);
  assert.doesNotMatch(JSON.stringify(events),/private@example|PRIVATE|Bearer-private/);
});

test('failed API calls share their request ID with diagnostics and never retry a mutation',async()=>{
  const b=browser();
  b.setFetch(async url=>url.endsWith('/diagnostics/events')?new Response(null,{status:204}):new Response(JSON.stringify({error:'private@example.com',code:'BUSY'}),{status:409,headers:{'Content-Type':'application/json'}}));
  await assert.rejects(b.client.apiPost('/checkout',{email:'private@example.com',card:'PRIVATE'}),/private@example/);
  await b.client.flushDiagnostics();
  const business=b.calls.filter(c=>c.url==='/api/checkout');
  assert.equal(business.length,1);
  const event=b.events().find(e=>e.event==='api.failed');
  assert.equal(event.requestId,business[0].options.headers.get('X-Request-ID'));
  assert.match(business[0].options.headers.get('X-POS-Client-ID'),/^[a-f0-9-]{36}$/);
  assert.equal(event.status,409);
  assert.equal(event.route,'/checkout');
  assert.doesNotMatch(JSON.stringify(b.events()),/private@example|PRIVATE|Bearer-private/);
});

test('slow API requests produce waiting and completion markers without changing the response',async()=>{
  const b=browser();
  let release;
  b.setFetch(url=>url.endsWith('/diagnostics/events')?Promise.resolve(new Response(null,{status:204})):new Promise(resolve=>{release=resolve;}));
  const request=b.client.apiGet('/vouchers/private@example.com?code=PRIVATE');
  b.advance(11000);
  [...b.timeouts.values()].find(t=>t.delay===10000).callback();
  release(new Response('{}',{headers:{'Content-Type':'application/json'}}));
  await request; await b.client.flushDiagnostics();
  assert.ok(b.events().some(e=>e.event==='api.waiting'));
  assert.ok(b.events().some(e=>e.event==='api.slow'));
  assert.doesNotMatch(JSON.stringify(b.events()),/private@example|PRIVATE/);
});

test('GraphQL logical errors with HTTP 200 are correlated without sending the query variables or messages',async()=>{
  const b=browser();
  b.setFetch(async url=>url.endsWith('/diagnostics/events')?new Response(null,{status:204}):new Response(JSON.stringify({errors:[{message:'private@example.com PRIVATE'}]}),{headers:{'Content-Type':'application/json'}}));
  await assert.rejects(b.client.shopifyGraphQL('query GetOrders($query:String){orders{nodes{id}}}',{query:'private@example.com'}));
  await b.client.flushDiagnostics();
  const event=b.events().find(e=>e.event==='graphql.failed');
  assert.equal(event.status,200);assert.equal(event.operation,'GetOrders');
  assert.doesNotMatch(JSON.stringify(b.events()),/private@example|PRIVATE/);
});

test('offline and diagnostic delivery failures keep a bounded queue and back off without recursive requests',async()=>{
  const b=browser();b.navigator.onLine=false;
  for(let i=0;i<150;i++)b.client.recordDiagnostic('ui.heartbeat',{count:i});
  await b.client.flushDiagnostics();assert.equal(b.calls.length,0);
  b.navigator.onLine=true;
  b.setFetch(async()=>new Response(null,{status:503}));
  await b.client.flushDiagnostics();await b.client.flushDiagnostics();
  assert.equal(b.calls.length,1);
  assert.equal(JSON.parse(b.calls[0].options.body).events.length,20);
  assert.equal(b.events()[0].count,50);
  b.advance(61000);b.setFetch(async()=>new Response(null,{status:204}));
  await b.client.flushDiagnostics();assert.equal(b.calls.length,2);
});

test('visible event loop pauses are reported, while hidden-to-visible transitions are not mistaken for freezes',async()=>{
  const b=browser();b.client.installDiagnostics();
  const tick=b.intervals.find(i=>i.delay===1000).callback;
  b.advance(8000);tick();await b.client.flushDiagnostics();
  assert.equal(b.events().filter(e=>e.event==='ui.event_loop_delay').length,1);
  b.document.visibilityState='hidden';b.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();b.advance(60000);tick();
  b.document.visibilityState='visible';b.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();b.advance(1000);tick();await b.client.flushDiagnostics();
  assert.equal(b.events().filter(e=>e.event==='ui.event_loop_delay').length,1);
});

test('diagnostics do not send unauthenticated browser data',async()=>{
  const b=browser({authenticated:false});b.client.recordDiagnostic('ui.started');
  await b.client.flushDiagnostics();assert.equal(b.calls.length,0);
});

test('an instrumentation setup failure still sends the original business request exactly once',async()=>{
  const b=browser();
  b.context.crypto.randomUUID=()=>{throw Error('Diagnostic identifier unavailable');};
  b.setFetch(async()=>new Response('{"ok":true}',{headers:{'Content-Type':'application/json'}}));
  const result=await b.client.apiPost('/checkout',{operationId:'business-operation'});
  assert.equal(result.ok,true);
  assert.equal(b.calls.length,1);
  assert.equal(b.calls[0].url,'/api/checkout');
  assert.equal(JSON.parse(b.calls[0].options.body).operationId,'business-operation');
});

test('queued events from a previous account are not uploaded under the next account',async()=>{
  const b=browser();
  b.client.recordDiagnostic('ui.runtime_error');
  b.client.setSessionToken('next-account');
  b.client.recordDiagnostic('ui.navigation');
  await b.client.flushDiagnostics();
  assert.deepEqual(b.events().map(e=>e.event),['ui.navigation']);
  assert.equal(b.calls[0].options.headers.Authorization,'Bearer next-account');
});

test('a failed batch in flight cannot be requeued under a newly signed-in account',async()=>{
  const b=browser();let release;
  b.setFetch(()=>new Promise(resolve=>{release=resolve;}));
  b.client.recordDiagnostic('ui.runtime_error');
  const sending=b.client.flushDiagnostics();
  b.client.setSessionToken('next-account');
  b.client.recordDiagnostic('ui.navigation');
  release(new Response(null,{status:503}));await sending;
  b.setFetch(async()=>new Response(null,{status:204}));
  await b.client.flushDiagnostics();
  assert.equal(b.calls.length,2);
  assert.deepEqual(JSON.parse(b.calls[1].options.body).events.map(e=>e.event),['ui.navigation']);
});
