import { Router, raw } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';
import { requireAdmin } from '../lib/access.js';
import { updateProduct, updateVariant, createProduct, addProductImage, uploadProductImage, getVariantInventory, setVariantInventory, addVariant, deleteVariant, enableInventoryTracking } from '../lib/products.js';

export function createProductsRouter(gql = shopifyGQL) {
  const router = Router();
  const route = work => async (req, res) => {
    try { res.json(await work(req)); }
    catch (error) { res.status(error.status || 500).json({ error: error.message, code: error.code, safeToRestart: error.safeToRestart }); }
  };
  router.post('/products/:id', requireAdmin, route(req => updateProduct(gql, req.params.id, req.body)));
  router.post('/products', requireAdmin, route(req => createProduct(gql, req.body)));
  router.post('/products/:id/images', requireAdmin, route(req => addProductImage(gql, req.params.id, req.body)));
  router.post('/products/:id/images/upload', requireAdmin, raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }), route(req => uploadProductImage(gql, req.params.id, req.body, req.get('Content-Type')?.split(';')[0], decodeURIComponent(req.get('X-File-Name') || 'producto'))));
  router.post('/products/:id/variants', requireAdmin, route(req => addVariant(gql, req.params.id, req.body)));
  router.delete('/products/:id/variants/:variantId', requireAdmin, route(req => deleteVariant(gql, req.params.id, req.params.variantId)));
  router.post('/products/:id/variants/:variantId/tracking', requireAdmin, route(req => enableInventoryTracking(gql, req.params.id, req.params.variantId)));
  router.get('/products/:id/variants/:variantId/inventory', requireAdmin, route(req => getVariantInventory(gql, req.params.id, req.params.variantId)));
  router.post('/products/:id/variants/:variantId/inventory', requireAdmin, route(req => setVariantInventory(gql, req.params.id, req.params.variantId, req.body)));
  router.post('/products/:id/variants/:variantId', requireAdmin, route(req => updateVariant(gql, req.params.id, req.params.variantId, req.body)));
  return router;
}
