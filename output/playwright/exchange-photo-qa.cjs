async page => {
  await page.unrouteAll({behavior:'ignoreErrors'});
  await page.setViewportSize({width:1366,height:1000});
  const money={shopMoney:{amount:'26',currencyCode:'EUR'}};
  const order={id:'gid://shopify/Order/1',name:'#15054',createdAt:'2026-10-07T08:00:00Z',tags:[],displayFinancialStatus:'PAID',displayFulfillmentStatus:'FULFILLED',customer:null,totalPriceSet:money,subtotalPriceSet:money,totalTaxSet:money,totalDiscountsSet:{shopMoney:{amount:'0',currencyCode:'EUR'}},totalRefundedSet:{shopMoney:{amount:'0',currencyCode:'EUR'}},refunds:[],transactions:[],lineItems:{edges:[{node:{id:'gid://shopify/LineItem/1',title:'Pantalón corto Ladera',quantity:2,variant:{title:'3-4 años'},originalTotalSet:money,originalUnitPriceSet:money}}]}};
  const variant=(id,title,stock=5)=>({id,title,price:'26',inventoryQuantity:stock,selectedOptions:[]});
  const nodes=Array.from({length:35},(_,i)=>({id:`product-${i}`,title:i===34?'Vestido Ladera':i===33?'Prenda sin foto':`Prenda ${String(i+1).padStart(2,'0')}`,status:'ACTIVE',productType:'',totalInventory:5,featuredImage:i===33?null:{url:'/qa-photo.svg',altText:null},categoryMembership:{value:JSON.stringify([i===34?'child':'other'])},variants:{edges:(i===34?[variant('dress-small','3-4 años',0),variant('dress-large','6-8 años')]:[variant(`variant-${i}`,'Default Title')]).map(node=>({node}))}}));
  let categoryFailure=false, productFailure=false, quoteItems;
  await page.route('**/qa-photo.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><rect width="240" height="180" fill="#f8f5ef"/><path d="M92 32 L73 42 58 75 81 85 79 150 161 150 159 85 182 75 167 42 148 32 Q120 57 92 32" fill="#d9baaf" stroke="#b58e7f" stroke-width="2"/><path d="M110 35 Q120 46 130 35" fill="none" stroke="#fff" stroke-width="3"/></svg>'}));
  await page.route('**/api/**',async route=>{
    const path=route.request().url().split('/api/')[1]; let body={};
    if(path==='sessions/current') body={id:'qa',status:'OPEN'};
    else if(path==='locations') body=[{id:'location-1',name:'Shop location'}];
    else if(path==='operations/pending'||path.startsWith('payments')) body=[];
    else if(path==='exchanges/quote') { quoteItems=route.request().postDataJSON().items; body={token:'qa-quote',credit:26,total:26,due:0,voucher:0}; }
    else if(path==='exchanges') body={name:'#NUEVO',due:0,change:0,receipt:{}};
    else if(path==='graphql') {
      const {query,variables}=route.request().postDataJSON();
      if(query.includes('GetOrders')) body={data:{orders:{edges:[{node:order}],pageInfo:{hasNextPage:false}}}};
      else if(query.includes('OrderDetail')) body={data:{order}};
      else if(query.includes('PosCategories')) body=categoryFailure?{errors:[{message:'Fallo de categorías simulado'}]}:{data:{metaobjects:{nodes:[{id:'parent',displayName:'Ropa',fields:[{key:'nombre',value:'Ropa'}]},{id:'child',displayName:'Vestidos',fields:[{key:'nombre',value:'Vestidos'},{key:'padre',value:'parent'}]},{id:'other',displayName:'Otros',fields:[]}],pageInfo:{hasNextPage:false}}}};
      else if(query.includes('GetProducts')) {
        if(productFailure) body={errors:[{message:'Fallo de catálogo simulado'}]};
        else {
          const rows=variables.query?.includes('Vestido')?nodes.slice(34):variables.query?.includes('inexistente')?[]:nodes;
          const after=variables.after?30:0, batch=rows.slice(after,after+30);
          body={data:{products:{edges:batch.map(node=>({cursor:node.id,node})),pageInfo:{hasNextPage:after+30<rows.length,endCursor:batch.at(-1)?.id}}}};
        }
      }
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5176/orders');
  await page.getByLabel('Usuario',{exact:true}).fill('qa');
  await page.getByLabel('Contraseña',{exact:true}).fill('qa');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByText('#15054',{exact:true}).click();
  await page.getByRole('button',{name:'Cambiar artículos',exact:true}).click();
  const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Cambiar artículos · #15054',exact:true})});
  const region=dialog.getByRole('region',{name:'Catálogo visual para el cambio'});
  const category=dialog.getByLabel('Categoría de artículos para el cambio');
  await region.getByRole('button',{name:'Seleccionar Vestido Ladera',exact:true}).waitFor();
  if(await region.getByRole('button',{name:/^Seleccionar /}).count()!==35) throw Error('Catálogo truncado');
  await category.selectOption('parent');
  if(await region.getByRole('button',{name:/^Seleccionar /}).count()!==1) throw Error('Filtro no incluye descendientes');
  await page.screenshot({path:'output/playwright/exchange-photos-desktop.png'});
  await region.getByRole('button',{name:'Seleccionar Vestido Ladera',exact:true}).locator('img').click();
  if(!await region.getByRole('button',{name:/3-4 años.*Agotado/}).isDisabled()) throw Error('Talla agotada seleccionable');
  await region.getByRole('button',{name:/6-8 años.*Añadir/}).click();
  const quantity=dialog.getByLabel('Cantidad de Vestido Ladera · 6-8 años');
  await quantity.waitFor();
  await region.getByRole('button',{name:'Seleccionar Vestido Ladera',exact:true}).click();
  await region.getByRole('button',{name:/6-8 años.*Añadir/}).click();
  if(await quantity.inputValue()!=='2') throw Error('Añadir otra vez no suma cantidad');
  await quantity.fill('1');
  await category.selectOption('');
  await region.getByRole('button',{name:'Seleccionar Prenda sin foto',exact:true}).click();
  await dialog.getByRole('button',{name:'Quitar',exact:true}).last().click();
  await dialog.getByLabel('Buscar artículos para el cambio').fill('Vestido');
  await region.getByRole('button',{name:'Seleccionar Vestido Ladera',exact:true}).waitFor();
  await dialog.getByLabel('Buscar artículos para el cambio').fill('inexistente');
  await region.getByText('No se encontraron productos.',{exact:true}).waitFor();
  await dialog.getByLabel('Buscar artículos para el cambio').fill('');
  await region.getByRole('button',{name:'Seleccionar Vestido Ladera',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/exchange-photos-mobile.png'});
  const overflow=await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1);
  if(overflow) throw Error('Desbordamiento horizontal móvil');
  await region.getByRole('button',{name:'Seleccionar Vestido Ladera',exact:true}).click();
  await page.screenshot({path:'output/playwright/exchange-sizes-mobile.png'});
  await region.getByRole('button',{name:'Volver a las fotos',exact:true}).click();
  await dialog.getByLabel('Devolver Pantalón corto Ladera').fill('1');
  await dialog.getByRole('button',{name:'Calcular diferencia',exact:true}).click();
  await dialog.getByText('Mismo importe: sin cobro y sin vale',{exact:true}).waitFor();
  if(JSON.stringify(quoteItems)!==JSON.stringify([{variantId:'dress-large',quantity:1}])) throw Error('Variante incorrecta al calcular');
  await dialog.getByRole('button',{name:'Confirmar cambio',exact:true}).click();
  await dialog.getByText('Cambio completado. Nuevo pedido #NUEVO.',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  categoryFailure=true;productFailure=true;
  await page.getByText('#15054',{exact:true}).click();
  await page.getByRole('button',{name:'Cambiar artículos',exact:true}).click();
  await dialog.getByRole('button',{name:'Reintentar categorías',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Reintentar productos',exact:true}).waitFor();
  productFailure=false;
  await dialog.getByRole('button',{name:'Reintentar productos',exact:true}).click();
  await region.getByRole('button',{name:'Seleccionar Vestido Ladera',exact:true}).waitFor();
  await region.getByRole('button',{name:'Seleccionar Prenda sin foto',exact:true}).click();
  await dialog.getByLabel('Cantidad de Prenda sin foto').waitFor();
  categoryFailure=false;
  await dialog.getByRole('button',{name:'Reintentar categorías',exact:true}).click();
  await category.selectOption('child');
  if(await region.getByRole('button',{name:/^Seleccionar /}).count()!==1) throw Error('Reintento categorías fallido');
  return {passed:true,fullCatalog:35,photoSelection:true,categoryDescendants:true,unavailableSizeBlocked:true,repeatedAdd:true,noPhoto:true,search:true,mobile:true,quoteVariant:true,completedExchange:true,errorRecovery:true};
}
