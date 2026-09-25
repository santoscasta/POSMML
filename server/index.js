import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { getAccessToken } from './lib/shopify.js';
import graphqlRoutes from './routes/graphql.js';
import sessionRoutes from './routes/sessions.js';
import paymentRoutes from './routes/payments.js';
import voucherRoutes from './routes/vouchers.js';
import dashboardRoutes from './routes/dashboard.js';
import refundRoutes from './routes/refunds.js';
import { requireAuth, checkOrigin } from './lib/auth.js';
import { getStore } from './lib/operationStore.js';
import mailRoutes from './routes/mail.js';
import customerRoutes from './routes/customers.js';
import { getMailService } from './lib/mail/service.js';
import { createMailMonitor } from './lib/mail/monitor.js';
import shopifyGQL from './lib/shopifyGQL.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// CORS: in production the frontend is served from the same origin
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173'];
app.use(checkOrigin);
app.use(cors({ origin: allowedOrigins.map(origin => origin.trim()) }));
app.use(express.json());
app.use('/api', requireAuth);
app.use('/auth', requireAuth);
getStore(); // Fail at startup if durable storage is not configured.

// API Routes
app.get('/api/access', (req, res) => res.json({ authenticated: true }));
app.use('/api', graphqlRoutes);
app.use('/api', sessionRoutes);
app.use('/api', paymentRoutes);
app.use('/api', voucherRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', refundRoutes);
app.use('/api', mailRoutes);
app.use('/api', customerRoutes);

const mailMonitor = createMailMonitor({ mail: getMailService(), posStore: getStore(), gql: shopifyGQL });
const checkMail = () => void mailMonitor.tick().catch(() => console.error('No se pudo ejecutar el servicio de correo; revisa el almacenamiento persistente.'));
setInterval(checkMail, 60000).unref();
// Delivery has its own clock so a paginated Shopify scan cannot hold up tickets.
const deliverMail = () => void getMailService().flush().catch(() => console.error('No se pudo procesar la cola de correo.'));
setInterval(deliverMail, 15000).unref();
deliverMail();
checkMail();

// Auth / status
app.get('/auth', async (req, res) => {
  const token = await getAccessToken();
  if (token) {
    res.send(`<html><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0f0f0"><div style="text-align:center;background:white;padding:40px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><h1 style="color:#91A1BB">Conectado!</h1><p>POS MML conectado con Shopify.</p></div></body></html>`);
  } else {
    res.status(500).send('Error al obtener token.');
  }
});

app.get('/api/status', async (req, res) => {
  const token = await getAccessToken();
  res.json({ connected: !!token, store: process.env.SHOPIFY_STORE });
});

// Production: serve Vite build
if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  // SPA fallback — send index.html for any non-API route
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`POS API server running on port ${PORT} (${isProduction ? 'production' : 'development'})`);
  const token = await getAccessToken();
  if (token) console.log('Shopify store connected.');
  else console.log('Not connected. Visit /auth');
});
