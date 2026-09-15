async(page)=>{
 const findings=[];const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 let session={id:'qa-session',status:'OPEN',openingAmount:50,cashierName:'QA',openedAt:'2026-09-14T08:00:00Z',kpis:{totalOrders:1,grossSales:20,cashSales:20,cardSales:0,bizumSales:0,voucherSales:0,refunds:0,refundsCash:0,expectedCash:70}};
 let mode='normal';const pending=[];
 const order=name=>({id:'gid://shopify/Order/'+name,name,createdAt:'2026-09-14T08:00:00Z',displayFinancialStatus:'PAID',displayFulfillmentStatus:'UNFULFILLED',totalPriceSet:{shopMoney:{amount:'20',currencyCode:'EUR'}},customer:null,lineItems:{edges:[]}});
 await page.route('**/api/**',async route=>{
  const path=route.request().url().replace(/^https?:\/\/[^/]+/,'').split('?')[0];let status=200;let body={};
  if(path.endsWith('/sessions/current'))body=session;
  else if(path.endsWith('/sessions/close')){body={...session,status:'CLOSED',closingAmount:70,expectedAmount:70,difference:0,closedAt:'2026-09-14T17:00:00Z',orderDetails:[]};session=null;}
  else if(path.endsWith('/sessions')){if(mode==='history-error'){status=500;body={error:'History failed'}}else body=[];}
  else if(path.endsWith('/graphql')){
   const input=route.request().postDataJSON();
   if(input.query.includes('GetOrders')){
    if(mode==='orders-error'){status=500;body={error:'Orders failed'}}
    else {const q=input.variables.query||'';if(mode==='race'){await page.waitForTimeout(q==='OLD'?1800:100);}body={data:{orders:{edges:[{node:order(q||'INITIAL')}],pageInfo:{hasNextPage:false}}}};}
   }else if(input.query.includes('PosCategories'))body={data:{metaobjects:{nodes:[],pageInfo:{hasNextPage:false}}}};
   else body={data:{products:{edges:[],pageInfo:{hasNextPage:false}}}};
  }
  else if(path.endsWith('/dashboard'))body={shopifyConnected:true,sessionOpen:true,todaySales:20,todayOrders:1,activeVouchers:0,voucherBalance:0,paymentBreakdown:{cash:20,card:0,bizum:0,mixed:0}};
  else if(path.endsWith('/vouchers/stats'))body={total:0,active:0,exhausted:0,cancelled:0,activeBalance:0};
  else if(path.endsWith('/vouchers')||path.endsWith('/operations/pending'))body=[];
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const button=name=>page.getByRole('button',{name,exact:true}).filter({visible:true});
 async function login(){await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('QA');await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('mock-only');await button('Entrar').click();}
 await page.evaluate(()=>localStorage.clear());await page.reload();await login();await page.setViewportSize({width:1366,height:900});
 const attempts=[];
 await page.route('**/api/vouchers',async route=>{
 if(route.request().method()!=='POST')return route.fulfill({json:[]});
 const input=route.request().postDataJSON();attempts.push(input);
 if(attempts.length===1)return route.fulfill({status:409,json:{error:'Respuesta perdida',code:'PENDING',safeToRestart:false}});
 return route.fulfill({json:{id:'qa-voucher',code:'1234',fullCode:'QA1234',originalAmount:20,balance:20,status:'active',createdAt:'2026-09-14T08:00:00Z'}});
 });
 await button('Vales').click();await button('Emitir Vale').click();await page.getByLabel('Monto *',{exact:true}).fill('20');await page.getByRole('dialog').getByRole('button',{name:'Emitir Vale',exact:true}).click();await page.getByText('Respuesta perdida',{exact:true}).waitFor();
 await page.reload();await login();await button('Emitir Vale').click();await page.getByRole('dialog').getByRole('button',{name:'Reanudar emisión',exact:true}).click();await page.getByText('Vale emitido exitosamente',{exact:true}).waitFor();
 if(attempts.length!==2 || attempts[0].operationId!==attempts[1].operationId)throw Error('Different operation on retry');
 if(await page.evaluate(()=>localStorage.getItem('pos.pending-voucher.v1')))throw Error('Pending state not cleared');
 return {voucherRecovery:'passed',sameOperation:true,pageErrors};
}
