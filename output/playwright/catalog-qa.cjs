async page => {
 await page.unrouteAll({behavior:'wait'});
 await page.setViewportSize({width:1366,height:768});
 let pages=0;
 const product=i=>({id:`gid://shopify/Product/${i}`,title:`Producto QA ${String(i).padStart(3,'0')}`,productType:i>60?'Última categoría':'Primera categoría',totalInventory:5,featuredImage:null,variants:{edges:[{node:{id:`gid://shopify/ProductVariant/${i}`,title:'Default Title',price:'10',inventoryQuantity:5,selectedOptions:[]}}]}});
 await page.route('**/api/**',async route=>{
  const path=route.request().url().split('/api/')[1];let body={};
  if(path==='sessions/current') body={id:'qa',status:'OPEN',openingAmount:50};
  else if(path==='operations/pending') body=[];
  else if(path==='graphql') {
   const vars=route.request().postDataJSON().variables;
   const offset=Number(vars.after||0);pages++;
   body={data:{products:{edges:Array.from({length:30},(_,i)=>({node:product(offset+i+1)})),pageInfo:{hasNextPage:offset<60,endCursor:String(offset+30)}}}};
  }
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:5174');
 await page.getByLabel('Usuario',{exact:true}).fill('qa');
 await page.getByLabel('Contraseña',{exact:true}).fill('qa');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByText('Producto QA 090',{exact:true}).filter({visible:true}).waitFor();
 if(pages!==3) throw new Error('Not all catalog pages loaded: '+pages);
 if(await page.getByRole('button',{name:'Cargar más',exact:true}).count()) throw new Error('Load more remains');
 await page.getByText('Última categoría',{exact:true}).filter({visible:true}).waitFor();
 await page.getByText('Producto QA 001',{exact:true}).filter({visible:true}).click();
 for(const width of [1366,1024]) {
  await page.setViewportSize({width,height:700});
  const cart=page.getByLabel('Cesta de la compra',{exact:true});
  const before=await cart.boundingBox();
  const catalog=page.getByLabel('Catálogo de productos',{exact:true}).filter({visible:true});
  await catalog.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const after=await cart.boundingBox();
  if(!before||!after||Math.abs(after.y-before.y)>1||after.y<0||after.y+after.height>700) throw new Error('Cart left viewport '+width);
  if(await catalog.evaluate(el=>el.scrollTop===0)) throw new Error('Catalog did not scroll');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Overflow');
 }
 await page.screenshot({path:'output/playwright/catalog-cart-1024.png'});
 await page.getByText('Producto QA 090',{exact:true}).filter({visible:true}).click();
 await page.getByLabel('Cesta de la compra',{exact:true}).getByText('Producto QA 090',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:700});
 await page.getByRole('button',{name:/^Carrito/}).click();
 await page.getByText('Producto QA 090',{exact:true}).filter({visible:true}).waitFor();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Mobile overflow');
}
