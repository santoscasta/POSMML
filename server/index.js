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
import { createProductsRouter } from './routes/products.js';
import { getMailService } from './lib/mail/service.js';
import { createMailMonitor } from './lib/mail/monitor.js';
import shopifyGQL from './lib/shopifyGQL.js';
import { createAttendanceRouter } from './routes/attendance.js';
import { getAttendanceService } from './lib/attendance.js';
import { createAccessService, createAccessMiddleware, authorizeProfile, accessDirectory } from './lib/access.js';
import { createAccessRouter } from './routes/access.js';
import { createOperationStore } from './lib/operationStore.js';
import { requestDiagnostics, logEvent, logError } from './lib/diagnostics.js';
import { createDiagnosticsRouter } from './routes/diagnostics.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
app.use(requestDiagnostics());

// CORS: in production the frontend is served from the same origin
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173'];
app.use(checkOrigin);
app.use(cors({ origin: allowedOrigins.map(origin => origin.trim()), exposedHeaders: ['X-Request-ID'] }));
app.use(express.json());
app.use('/auth', requireAuth);
getStore(); // Fail at startup if durable storage is not configured.
const attendance = getAttendanceService();
const access = createAccessService(createOperationStore(accessDirectory()), { employeeExists: id => attendance.employees().some(employee => employee.id === id) });
if (process.env.POS_USERNAME && process.env.POS_PASSWORD) await access.bootstrap({ username: process.env.POS_USERNAME, password: process.env.POS_PASSWORD, name: 'Administración' });
app.use('/api', createAccessRouter(access));
app.use('/api', createAccessMiddleware(access), authorizeProfile);
app.use('/api', createDiagnosticsRouter());

// API Routes
app.get('/api/access', (req, res) => res.json({ authenticated: true, user: req.user }));
app.use('/api', createAttendanceRouter(attendance));
app.use('/api', graphqlRoutes);
app.use('/api', sessionRoutes);
app.use('/api', paymentRoutes);
app.use('/api', voucherRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', refundRoutes);
app.use('/api', mailRoutes);
app.use('/api', customerRoutes);
app.use('/api', createProductsRouter());

const mailMonitor = createMailMonitor({ mail: getMailService(), posStore: getStore(), gql: shopifyGQL });
const checkMail = () => void mailMonitor.tick().catch(error => logError('mail.monitor_failed', error));
setInterval(checkMail, 60000).unref();
// Delivery has its own clock so a paginated Shopify scan cannot hold up tickets.
const deliverMail = () => void getMailService().flush().catch(error => logError('mail.delivery_failed', error));
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

// Express 5 forwards rejected route promises here. Logging must not prevent the
// default fatal-exception behavior if the process itself becomes unhealthy.
app.use((error, req, res, next) => {
  logError('http.unhandled_error', error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.status === 400 ? 'Solicitud no válida.' : 'No se pudo completar la solicitud.' });
});
process.on('uncaughtExceptionMonitor', error => logError('process.uncaught_exception', error));
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (now - lastTick > 6000) logEvent('process.event_loop_delay', { durationMs: Math.round(now - lastTick - 1000) }, 'warn');
  lastTick = now;
}, 1000).unref();

app.listen(PORT, '0.0.0.0', async () => {
  logEvent('process.started', { mode: isProduction ? 'production' : 'development',
    deployment: /^[a-f0-9]{7,40}$/i.test(process.env.RAILWAY_GIT_COMMIT_SHA || '') ? process.env.RAILWAY_GIT_COMMIT_SHA : undefined });
  const token = await getAccessToken();
  logEvent(token ? 'shopify.connected' : 'shopify.disconnected', {}, token ? 'info' : 'warn');
});
