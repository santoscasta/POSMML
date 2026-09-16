import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getMailService } from '../lib/mail/service.js';
import { message } from '../lib/mail/templates.js';
import { queueGiftReceipt } from '../lib/mail/giftReceipt.js';
import { getStore } from '../lib/operationStore.js';
import shopifyGQL from '../lib/shopifyGQL.js';

const router = Router();
const route = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
};
router.get('/mail', route(async (_req, res) => res.json(getMailService().status())));
router.post('/mail/settings', route(async (req, res) => res.json(await getMailService().settings(req.body))));
router.post('/mail/test', route(async (_req, res) => {
  const mail = getMailService();
  res.json(await mail.enqueue(`test:${randomUUID()}`, mail.read().settings.recipient, message('Prueba de correo del TPV', ['El envío propio del TPV está configurado.'])));
}));
router.post('/mail/:id/retry', route(async (req, res) => res.json(await getMailService().retry(req.params.id, req.body?.confirmUnknown === true))));
router.post('/send-gift-receipt', route(async (req, res) => res.json(await queueGiftReceipt(shopifyGQL, getStore(), getMailService(), req.body))));
export default router;
