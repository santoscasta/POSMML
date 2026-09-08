import { timingSafeEqual, createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest();

export function requireAuth(req, res, next) {
  const username = process.env.POS_USERNAME;
  const password = process.env.POS_PASSWORD;
  if (!username || !password) {
    return res.status(503).json({ error: 'Configura POS_USERNAME y POS_PASSWORD en el servidor para habilitar el acceso.' });
  }
  const header = req.headers.authorization || '';
  const supplied = /^Basic /i.test(header) ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  if (!timingSafeEqual(digest(supplied), digest(`${username}:${password}`))) {
    res.set('WWW-Authenticate', 'Basic realm="POS MML", charset="UTF-8"');
    res.set('Cache-Control', 'no-store');
    return res.status(401).json({ error: 'Acceso no autorizado' });
  }
  res.set('Cache-Control', 'no-store');
  next();
}

export function checkOrigin(req, res, next) {
  const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map(v => v.trim());
  const origin = req.headers.origin;
  // Reject cross-site requests even though browsers may reuse Basic credentials.
  if (origin ? !allowed.includes(origin) : req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'Origen no autorizado' });
  }
  next();
}
