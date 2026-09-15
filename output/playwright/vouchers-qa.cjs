async (page) => {
 await page.setViewportSize({width:1366,height:768});
 await page.unrouteAll({behavior:'wait'});
 let issued=0, mailed=0;
 const voucher={id:'gid://shopify/GiftCard/1',code:'****1234',fullCode:'QA12345678901234',originalAmount:10,currentBalance:10,customerEmail:'qa@example.com',issuedAt:'2026-09-10T10:00:00Z',status:'ACTIVE'};
 await page.route('**/api/**', async route=>{
  const path=route.request().url().split('/api/')[1]; let body={};let status=200;
  if(path==='sessions/current') body={id:'qa',status:'OPEN',openingAmount:50};
  else if(path==='vouchers' && route.request().method()==='POST') {issued++;body=voucher;}
  else if(path==='vouchers/send-email') {mailed++;if(mailed===1){status=500;body={error:'Fallo simulado'};}else body={sent:true};}
  else if(path==='vouchers') body=issued?[voucher]:[];
  else if(path==='vouchers/stats') body={total:issued,active:issued,exhausted:0,cancelled:0,activeBalance:issued*10};
  else if(path==='operations/pending') body=[];
  else if(path==='graphql') body={data:{products:{edges:[],pageInfo:{hasNextPage:false}}}};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:5174');
 await page.getByLabel('Usuario',{exact:true}).fill('qa');
 await page.getByLabel('Contraseña',{exact:true}).fill('qa');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByRole('button',{name:'Vales',exact:true}).filter({visible:true}).click();
 await page.getByRole('button',{name:'Emitir Vale',exact:true}).click();
 await page.getByLabel('Monto *',{exact:true}).fill('10');
 await page.getByLabel('Email del cliente',{exact:true}).fill('qa@example.com');
 await page.getByRole('dialog').getByRole('button',{name:'Emitir Vale',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Fallo simulado'}).waitFor();
 if(issued!==1||mailed!==1) throw new Error('Unexpected issuance/send counts');
 await page.getByRole('button',{name:'Enviar vale por correo',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Shopify ha aceptado'}).waitFor();
 if(issued!==1||mailed!==2) throw new Error('Email retry issued another voucher');
 await page.evaluate(()=>{window.__printHtml='';window.open=()=>({document:{open(){},write(s){window.__printHtml=s;},close(){},fonts:{ready:Promise.resolve()}},closed:false,focus(){},print(){window.__printed=true;}});});
 await page.getByRole('button',{name:'Imprimir vale',exact:true}).click();
 const printed=await page.evaluate(()=>window.__printed && window.__printHtml.includes('QA12345678901234') && window.__printHtml.includes('10,00'));
 if(!printed) throw new Error('Missing full voucher code or print call');
 for(const width of [1366,768,390,320]) {
  await page.setViewportSize({width,height:700});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Overflow '+width);
 }
 await page.screenshot({path:'output/playwright/voucher-delivery-320.png'});
 const html = await page.evaluate(()=>window.__printHtml);
 const preview = await page.context().newPage();
 await preview.setViewportSize({width:320,height:500});
 await preview.setContent(html);
 await preview.emulateMedia({media:'print'});
 await preview.screenshot({path:'output/playwright/voucher-print.png'});
 await preview.close();
}
