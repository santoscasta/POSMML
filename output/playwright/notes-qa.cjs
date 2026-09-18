async page => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const checkouts = [];
  await page.route('**/api/**', async route => {
    const path = route.request().url().split('?')[0];
    let body = {};
    if (path.endsWith('/sessions/current')) body = { id: 'qa', status: 'OPEN', openingAmount: 50 };
    else if (path.endsWith('/checkout')) { checkouts.push(route.request().postDataJSON()); body = { name: '#QA', success: true }; }
    else if (path.endsWith('/operations/pending')) body = [];
    else if (path.endsWith('/graphql')) {
      const query = route.request().postDataJSON().query;
      if (query.includes('PosCategories')) body = { data: { metaobjects: { nodes: [], pageInfo: { hasNextPage: false } } } };
      else body = { data: { products: { edges: [{ node: { id: 'gid://shopify/Product/1', title: 'Producto notas QA', status: 'ACTIVE', productType: '', featuredImage: null, totalInventory: 10, variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/1', title: 'Default Title', price: '14.50', inventoryQuantity: 10, availableForSale: true } }] } } }], pageInfo: { hasNextPage: false } } } };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:5176');
  await page.getByLabel('Usuario', { exact: true }).fill('qa');
  await page.getByLabel('Contraseña', { exact: true }).fill('qa');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('Producto notas QA', { exact: true }).filter({ visible: true }).first().click();
  const note = page.getByLabel('Nota del pedido (opcional)').filter({ visible: true });
  await note.fill('Nota de la primera venta');
  await page.getByRole('button', { name: /Crear Pedido/ }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar pago', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar y siguiente venta', exact: true }).click();
  await page.getByText('Producto notas QA', { exact: true }).filter({ visible: true }).first().click();
  if (await note.isDisabled()) throw new Error('Notes disabled on second sale');
  if (await note.inputValue() !== '') throw new Error('Previous sale note was retained');
  await note.fill('Nota de la segunda venta');
  await page.getByRole('button', { name: /Crear Pedido/ }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar pago', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar y siguiente venta', exact: true }).waitFor();
  if (checkouts.length !== 2 || checkouts[0].cart.note !== 'Nota de la primera venta' || checkouts[1].cart.note !== 'Nota de la segunda venta') throw new Error('Incorrect checkout notes');
  return { passed: true, sales: checkouts.length, notes: checkouts.map(c => c.cart.note) };
}
