async page => {
 await page.unrouteAll({behavior:'ignoreErrors'});
 await page.setViewportSize({width:1366,height:1000});
 const money={shopMoney:{amount:'24.95',currencyCode:'EUR'}};
 const order={id:'gid://shopify/Order/1',name:'#14994',createdAt:'2026-09-21T08:00:00Z',tags:[],displayFinancialStatus:'PAID',displayFulfillmentStatus:'FULFILLED',customer:null,totalPriceSet:money,subtotalPriceSet:money,totalTaxSet:money,totalDiscountsSet:{shopMoney:{amount:'0',currencyCode:'EUR'}},totalRefundedSet:{shopMoney:{amount:'0',currencyCode:'EUR'}},refunds:[],transactions:[],lineItems:{edges:[{node:{id:'gid://shopify/LineItem/1',title:'Artículo QA',quantity:1,originalTotalSet:money,originalUnitPriceSet:money}}]}};
 let mode='equal';let attempts=[];let failOnce=false;
 const quote=()=>({token:'quote',credit:24.95,total:mode==='equal'?24.95:mode==='extra'?30:20,due:mode==='extra'?5.05:0,voucher:mode==='credit'?4.95:0});
 await page.route('**/api/**',async route=>{
 const path=route.request().url().split('/api/')[1];let body={};let status=200;
 if(path==='sessions/current')body={id:'qa',status:'OPEN'};
 else if(path==='locations')body=[{id:'gid://shopify/Location/1',name:'Tienda'}];
 else if(path==='operations/pending'||path.startsWith('payments'))body=[];
 else if(path==='exchanges/quote')body=quote();
 else if(path==='exchanges'){
 attempts.push(route.request().postDataJSON());
 if(failOnce){failOnce=false;status=409;body={error:'Fallo simulado recuperable',safeToRestart:false};}
 else body={name:'#NUEVO',due:quote().due,change:mode==='extra'?4.95:0,...(mode==='credit'?{voucher:{id:'gid://shopify/GiftCard/1',code:'QA1234567890',amount:4.95}}:{})};
 }
 else if(path==='graphql'){
 const query=route.request().postDataJSON().query;
 if(query.includes('GetOrders'))body={data:{orders:{edges:[{node:order}],pageInfo:{hasNextPage:false}}}};
 else if(query.includes('OrderDetail'))body={data:{order}};
 else body={data:{products:{edges:[{node:{id:'gid://shopify/Product/1',title:'Prenda nueva',productType:'',status:'ACTIVE',totalInventory:10,featuredImage:null,variants:{edges:[{node:{id:'gid://shopify/ProductVariant/2',title:'Talla 2',price:'24.95',inventoryQuantity:10}}]}}}],pageInfo:{hasNextPage:false}}}};
 }
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:5176/orders');
 await page.getByLabel('Usuario',{exact:true}).fill('qa');await page.getByLabel('Contraseña',{exact:true}).fill('qa');await page.getByRole('button',{name:'Entrar',exact:true}).click();

 for(const scenario of ['equal','extra','credit']){
 mode=scenario;
 await page.getByText('#14994',{exact:true}).click();
 await page.getByRole('button',{name:'Cambiar artículos',exact:true}).click();
 const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Cambiar artículos · #14994',exact:true})});
 await dialog.getByLabel('Devolver Artículo QA',{exact:true}).fill('1');
 await dialog.getByRole('button',{name:/Prenda nueva.*Añadir/}).click();
 await dialog.getByRole('button',{name:'Calcular diferencia',exact:true}).click();
 if(scenario==='equal')await dialog.getByText('Mismo importe: sin cobro y sin vale',{exact:true}).waitFor();
 if(scenario==='extra'){
 await dialog.getByRole('combobox',{name:'Método de pago',exact:true}).selectOption('CASH');
 await dialog.getByLabel('Efectivo recibido',{exact:true}).fill('10');
 failOnce=true;
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'output/playwright/exchange-'+scenario+'.png'});
 await dialog.getByRole('button',{name:'Confirmar cambio',exact:true}).click();
 if(scenario==='extra'){
 await dialog.getByRole('button',{name:'Reanudar cambio',exact:true}).click();
 if(attempts.at(-1).operationId!==attempts.at(-2).operationId)throw Error('Changed operation on retry');
 }
 await dialog.getByText('Cambio completado. Nuevo pedido #NUEVO.',{exact:true}).waitFor();
 if(scenario==='credit')await dialog.getByText('QA1234567890',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
 }
 return {passed:true,equal:true,extraCash:true,residualVoucher:true,retry:true};
}
