import { Router } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';
import { registerCustomer } from '../lib/customerRegistration.js';

const router = Router();

router.post('/customers', async (req, res) => {
  try {
    res.status(201).json(await registerCustomer(shopifyGQL, req.body));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
