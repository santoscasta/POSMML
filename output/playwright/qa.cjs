async (page) => {
 const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 let session=null; let submitted;
 const product={id:'gid://shopify/Product/1',title:'Mochila QA con nombre largo para comprobar que se muestra completo',totalInventory:5,featuredImage:null,variants:{edges:[{node:{id:'gid://shopify/ProductVariant/1',title:'Default Title',price:'8.95',inventoryQuantity:5,selectedOptions:[]}}]}};
 await page.route('**/*',async route=>{
  const address=route.request().url(); const u={pathname:address.replace(/^https?:\/\/[^/]+/,''),hostname:address.split('/')[2].split(':')[0]};
  if(u.pathname.includes('/api/')) {
   let body={}; let status=200;
   if(u.pathname.endsWith('/sessions/current')) body=session;
   else if(u.pathname.endsWith('/sessions/open')) {session={id:'qa-session',status:'OPEN',openingAmount:50,cashierName:'QA',openedAt:new Date().toISOString()};body=session;}
   else if(u.pathname.endsWith('/graphql')) body={data:{products:{edges:[{node:product}],pageInfo:{hasNextPage:false,endCursor:null}}}};
   else if(u.pathname.endsWith('/operations/pending')) body=[];
   else if(u.pathname.endsWith('/checkout')) {submitted=route.request().postDataJSON();body={name:'#QA'};}
   else if(u.pathname.endsWith('/send-receipt')) {status=500;body={error:'Fallo simulado'};}
   else if(!u.pathname.endsWith('/access')) body=[];
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  }
  if(u.hostname!=='127.0.0.1') return route.abort();
  return route.continue();
 });
 await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('qa');
 await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('qa');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.getByLabel('Monto de apertura (Fondo de caja)').fill('50');
 await page.getByRole('button',{name:'Abrir sesión de caja',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.setViewportSize({width:1366,height:768});
 await page.getByText(product.title,{exact:true}).filter({visible:true}).click();
 for(const width of [1366,1280,1024,768,600,390,320]) {
  await page.setViewportSize({width,height:700});
  if(width<1024) await page.getByRole('button',{name:/^Carrito/}).click();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow) throw new Error('Horizontal overflow '+width);
 }
 await page.getByRole('spinbutton',{name:'Precio €'}).fill('0');
 await page.getByRole('button',{name:'Crear Pedido — 0,00 €'}).click();
 await page.getByRole('button',{name:'Efectivo',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar pago',exact:true}).click();
 await page.getByText(/Pedido.*QA/).first().waitFor();
 if(submitted.payment.amount!==0 || submitted.cart.items[0].price!==0) throw new Error('Zero price payload incorrect');
 await page.screenshot({path:'output/playwright/qa-zero-checkout.png'});
 console.log(JSON.stringify({result:'PASS',checks:['login','required session opening','add product','7 viewport widths without document overflow','manual zero price','checkout payload and success'],pageErrors:errors}));
}
