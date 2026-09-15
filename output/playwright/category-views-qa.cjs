async (page) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  let failCategories=false;
  const cat=(id,nombre,padre)=>({id,displayName:nombre,fields:[{key:'nombre',value:nombre},{key:'padre',value:padre}]});
  const categories=[cat('root','KIDS',null),cat('middle','Accesorios','root'),cat('leaf','Lazos','middle'),cat('empty','Sin productos',null)];
  const product=(id,title,ids)=>({id,title,categoryMembership:{value:JSON.stringify(ids)},totalInventory:3,featuredImage:null,variants:{edges:[{node:{id:'variant-'+id,title:'Default Title',price:'12.50',inventoryQuantity:3,selectedOptions:[]}}]}});
  const products=[product('p1','Lazo rosa',['leaf','middle']),product('p2','Producto sin categoría',[]),product('p3','Producto del padre',['root'])];
  const calls=[];
  await page.route('**/api/**',async route=>{
    let body={};const url=route.request().url();
    if(url.endsWith('/sessions/current')) body={id:'qa',status:'OPEN',openingAmount:50};
    else if(url.endsWith('/operations/pending')) body=[];
    else if(url.endsWith('/graphql')) {
      const input=route.request().postDataJSON();calls.push(input);
      if(input.query.includes('PosCategories')) body=failCategories?{errors:[{message:'Error de conexión simulado'}]}:{data:{metaobjects:{nodes:categories,pageInfo:{hasNextPage:false}}}};
      else {
        const found=input.variables?.query?.includes('rosa')?products.slice(0,1):products;
        body={data:{products:{edges:found.map(node=>({node})),pageInfo:{hasNextPage:false}}}};
      }
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  async function login(){await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('qa');await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('qa');await page.getByRole('button',{name:'Entrar',exact:true}).click();}
  const button=name=>page.getByRole('button',{name,exact:typeof name==='string'}).filter({visible:true});
  const catalog=()=>page.locator('[aria-label="Catálogo de productos"]').filter({visible:true});
  await login();
  await page.setViewportSize({width:1366,height:900});
  await button(/^KIDS/).click();
  await button(/^Accesorios/).click();
  await button(/^Lazos/).click();
  await catalog().getByText('Lazo rosa',{exact:true}).waitFor();
  if(await catalog().getByText('Producto sin categoría',{exact:true}).count())throw new Error('Category leaked unassigned product');
  await catalog().getByText('Lazo rosa',{exact:true}).click();
  await button('Todos los productos').click();
  await catalog().getByText('Producto sin categoría',{exact:true}).waitFor();
  await catalog().getByText('Producto del padre',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/all-products-view.png'});
  await page.reload();await login();
  await catalog().getByText('Producto sin categoría',{exact:true}).waitFor();
  if(await button('Todos los productos').getAttribute('aria-pressed')!=='true') throw new Error('View preference lost');
  await button('Por categorías').click();await button(/^KIDS/).click();
  await button('Ver todos los productos de KIDS').click();
  await catalog().getByText('Producto del padre',{exact:true}).waitFor();
  if(await catalog().getByText('Lazo rosa',{exact:true}).count()!==1) throw new Error('Duplicate category membership duplicates product');
  await button('Todos los productos').click();
  const searchResponse=page.waitForResponse(r=>r.url().endsWith('/graphql')&&r.request().postDataJSON().variables?.query?.includes('rosa'));
  await catalog().getByPlaceholder('Buscar productos...').fill('rosa');await searchResponse;
  await catalog().getByText('Lazo rosa',{exact:true}).waitFor();
  await button('Por categorías').click();
  if(await catalog().getByPlaceholder('Buscar productos...').inputValue())throw new Error('View did not reset search');
  await button(/^Sin productos/).click();
  await catalog().getByText('No se encontraron productos',{exact:true}).waitFor();
  await button('Categorías').click();
  for(const width of [1366,1024,768,390,320]){
    await page.setViewportSize({width,height:850});
    await button('Todos los productos').click();
    await catalog().getByText('Producto sin categoría',{exact:true}).waitFor();
    await button('Por categorías').click();
    await button(/^KIDS/).waitFor();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Overflow '+width);
  }
  await page.screenshot({path:'output/playwright/category-view-mobile.png'});
  await page.setViewportSize({width:1366,height:900});
  await page.screenshot({path:'output/playwright/category-view-desktop.png'});
  failCategories=true;await page.reload();await login();
  await page.getByRole('alert').filter({visible:true}).waitFor();
  await button('Todos los productos').click();await catalog().getByText('Producto sin categoría',{exact:true}).waitFor();
  if(calls.some(c=>c.query.includes('menus(')||c.query.includes('collections(')))throw new Error('Old category source still used');
  if(errors.length)throw new Error(errors.join(';'));
  console.log('PASS: both views, metaobject tree, 3 levels, parent products, no duplicates, uncategorized products, search/reset, remembered selection, empty categories, 5 widths, categories failure independent of all products.');
}
