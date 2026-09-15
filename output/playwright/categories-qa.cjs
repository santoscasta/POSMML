async (page) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  let denied=false; const queries=[];
  const leaf={id:'menu-leaf',title:'Camisas de prueba',type:'COLLECTION',resourceId:'gid://shopify/Collection/22',tags:[],items:[]};
  const menus=[{id:'menu-1',handle:'main-menu',title:'Catálogo tienda',items:[{id:'menu-root',title:'Infantil desde Shopify',type:'HTTP',resourceId:null,items:[{id:'menu-middle',title:'Ropa desde Shopify',type:'HTTP',resourceId:null,items:[leaf]}]}]}];
  const product={id:'gid://shopify/Product/1',title:'Camisa de prueba Shopify',totalInventory:5,featuredImage:null,variants:{edges:[{node:{id:'gid://shopify/ProductVariant/1',title:'Default Title',price:'18.95',inventoryQuantity:5,selectedOptions:[]}}]}};
  await page.route('**/api/**',async route=>{
    const url=route.request().url(); let body={};
    if(url.endsWith('/sessions/current')) body={id:'qa',status:'OPEN',openingAmount:50};
    else if(url.endsWith('/graphql')) {
      const input=route.request().postDataJSON();
      if(input.query.includes('PosCategoryMenus')) body=denied?{errors:[{message:'Access denied for menus field.'}]}:{data:{menus:{nodes:menus,pageInfo:{hasNextPage:false}}}};
      else if(input.query.includes('PosCollections')) body={data:{collections:{nodes:[{id:'gid://shopify/Collection/22',title:leaf.title,image:null,productsCount:{count:1}}],pageInfo:{hasNextPage:false}}}};
      else {queries.push(input.variables?.query??''); body={data:{products:{edges:[{node:product}],pageInfo:{hasNextPage:false}}}};}
    } else if(url.endsWith('/operations/pending')) body=[];
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.reload();
  await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('qa');
  await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('qa');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const visible = (name) => page.getByRole('button',{name,exact:typeof name === 'string'}).filter({visible:true});
  await visible(/Infantil desde Shopify/).click();
  await visible(/Ropa desde Shopify/).click();
  await visible(/Camisas de prueba/).click();
  await page.locator('[aria-label="Catálogo de productos"]').filter({visible:true}).getByText(product.title,{exact:true}).waitFor();
  if(!queries.at(-1).includes('collection_id:22')) throw new Error('Missing collection filter');
  await page.locator('[aria-label="Catálogo de productos"]').filter({visible:true}).getByText(product.title,{exact:true}).click();
  await visible('Volver a la categoría anterior').click();
  await visible('Categorías').click();
  for(const width of [1500,1024,768,390,320]) {
    await page.setViewportSize({width,height:800});
    await visible(/Infantil desde Shopify/).waitFor();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Overflow '+width);
  }
  await page.setViewportSize({width:1500,height:900});
  await page.screenshot({path:'output/playwright/categories-root.png'});
  const allResponse = page.waitForResponse(response => response.url().endsWith('/graphql') && response.request().postDataJSON().query.includes('GetProducts') && !response.request().postDataJSON().variables?.query?.includes('collection_id:'));
  await visible('Todos los productos').click();
  await allResponse;
  await page.locator('[aria-label="Catálogo de productos"]').filter({visible:true}).getByText(product.title,{exact:true}).waitFor();
  if(queries.at(-1).includes('collection_id:')) throw new Error('All products still filtered');
  denied=true;
  await page.reload();
  await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('qa');
  await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('qa');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('alert').filter({visible:true}).filter({hasText:'read_online_store_navigation'}).waitFor();
  denied=false;
  await visible('Reintentar categorías').click();
  await visible(/Infantil desde Shopify/).waitFor();
  if(errors.length) throw new Error(errors.join('; '));
  console.log('PASS: Shopify menu → 3 levels → collection product → cart; back/root; 5 widths; all products; permission error and retry.');
}
