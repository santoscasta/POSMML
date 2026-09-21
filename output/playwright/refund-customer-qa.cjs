async page => {
 await page.unrouteAll({behavior:'ignoreErrors'});
 await page.setViewportSize({width:1366,height:1000});
 const money={shopMoney:{amount:'24.95',currencyCode:'EUR'}};
 const order={id:'gid://shopify/Order/1',name:'#14994',createdAt:'2026-09-21T08:00:00Z',tags:[],displayFinancialStatus:'PAID',displayFulfillmentStatus:'FULFILLED',customer:null,totalPriceSet:money,subtotalPriceSet:money,totalTaxSet:money,totalDiscountsSet:{shopMoney:{amount:'0',currencyCode:'EUR'}},totalRefundedSet:{shopMoney:{amount:'0',currencyCode:'EUR'}},refunds:[],transactions:[],lineItems:{edges:[{node:{id:'gid://shopify/LineItem/1',title:'Artículo QA',quantity:1,originalTotalSet:money,originalUnitPriceSet:money}}]}};
 let submitted;let sends=0;
 await page.route('**/api/**',async route=>{
 const path=route.request().url().split('/api/')[1];let body={};let status=200;
 if(path==='sessions/current')body={id:'qa',status:'OPEN'};
 else if(path==='locations')body=[];
 else if(path==='operations/pending'||path.startsWith('payments'))body=[];
 else if(path==='refunds'){submitted=route.request().postDataJSON();body={success:true,voucherCode:'QA1234567890',voucherId:'gid://shopify/GiftCard/42',customer:{id:'gid://shopify/Customer/42',...submitted.newCustomer}};}
 else if(path==='vouchers/send-email'){sends++;if(sends===1){status=500;body={error:'Fallo de envío simulado'};}else body={sent:true};}
 else if(path==='graphql'){
 const query=route.request().postDataJSON().query;
 if(query.includes('GetOrders'))body={data:{orders:{edges:[{node:order}],pageInfo:{hasNextPage:false}}}};
 else body={data:{order}};
 }
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:5176/orders');
 await page.getByLabel('Usuario',{exact:true}).fill('qa');await page.getByLabel('Contraseña',{exact:true}).fill('qa');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByText('#14994',{exact:true}).click();
 await page.getByRole('button',{name:'Reembolsar',exact:true}).click();
 const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Reembolso - #14994',exact:true})});
 await dialog.getByRole('button',{name:'Vale',exact:true}).click();
 await dialog.getByRole('button',{name:'Registrar cliente',exact:true}).click();
 await dialog.getByLabel('Nombre',{exact:true}).fill('Ana');await dialog.getByLabel('Apellidos',{exact:true}).fill('López');await dialog.getByLabel('Email',{exact:true}).fill('ana@example.com');await dialog.getByLabel('Teléfono',{exact:true}).fill('+34607140250');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'output/playwright/refund-register-mobile.png'});
 await dialog.getByRole('button',{name:'Confirmar reembolso',exact:true}).click();
 await page.getByText('Vale asociado a Ana López',{exact:true}).waitFor();
 if(submitted.newCustomer.phone!=='+34607140250')throw Error('Customer details not submitted');
 if(await page.getByLabel('Email de envío del vale').inputValue()!=='ana@example.com')throw Error('Recipient missing');
 await page.getByRole('button',{name:'Enviar vale por email'}).click();
 await page.getByText('Fallo de envío simulado',{exact:true}).waitFor();
 if(await page.getByText(/Shopify ha aceptado el envío/).count())throw Error('False success');
 await page.getByRole('button',{name:'Enviar vale por email'}).click();
 await page.getByText('Shopify ha aceptado el envío a ana@example.com',{exact:true}).waitFor();
 return {passed:true,registration:true,association:true,emailFailureAndRetry:true};
}
