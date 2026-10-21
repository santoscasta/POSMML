import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Railway values and login tokens stay in memory, never in CI logs or artifacts.
function railway(...args) {
  try {
    return JSON.parse(execFileSync('npx', ['--yes', '@railway/cli@5.71.0', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    }));
  } catch (error) {
    // stdout can contain secrets from `variable list`; never include it in errors.
    const diagnostic = String(error.stderr || '').replaceAll(process.env.RAILWAY_TOKEN || '\0', '[redacted]').trim();
    throw new Error(`No se pudo consultar Railway (${args[0]}): ${diagnostic || 'respuesta JSON no válida'}`);
  }
}
function check(ok, message) {
  if (!ok) throw new Error(message);
}

async function main() {
  const service = process.env.RAILWAY_SERVICE_ID;
  check(service, 'Falta RAILWAY_SERVICE_ID.');
  const variables = railway('variable', 'list', '--service', service, '--json');
  check(/^[a-zA-Z0-9._-]{2,60}$/.test(variables.POS_USERNAME || ''), 'POS_USERNAME no es compatible con la cuenta inicial.');
  check(typeof variables.POS_PASSWORD === 'string' && variables.POS_PASSWORD.length >= 8 && variables.POS_PASSWORD.length <= 128, 'POS_PASSWORD debe tener entre 8 y 128 caracteres.');
  check(typeof variables.POS_DATA_DIR === 'string' && path.posix.isAbsolute(variables.POS_DATA_DIR), 'POS_DATA_DIR debe ser una ruta absoluta en el volumen persistente.');
  if (process.argv.includes('--preflight')) {
    const status = railway('status', '--json');
    const mounts = [];
    function visit(value) {
      if (!value || typeof value !== 'object') return;
      if (typeof value.mountPath === 'string') mounts.push(value.mountPath);
      for (const child of Object.values(value)) visit(child);
    }
    visit(status);
    check(mounts.some(mount => variables.POS_DATA_DIR === mount || variables.POS_DATA_DIR.startsWith(`${mount.replace(/\/$/, '')}/`)), 'No se ha confirmado un volumen persistente para POS_DATA_DIR.');
    console.log(`Almacenamiento persistente confirmado: ${variables.POS_DATA_DIR}. Credenciales iniciales compatibles.`);
    return;
  }

  const base = 'https://posmml-production.up.railway.app';
  const expectedAsset = readFileSync('dist/index.html', 'utf8').match(/src="([^"]+\.js)"/)?.[1];
  check(expectedAsset, 'Falta el JavaScript de producción.');
  const request = (url, options = {}) => fetch(`${base}${url}`, { ...options, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const deadline = Date.now() + 300000;
  let ready = false;
  console.log('Esperando a que Railway sirva la nueva versión…');
  while (Date.now() < deadline) {
    try {
      const response = await request('/');
      if (response.ok && (await response.text()).includes(expectedAsset)) {
        const asset = await request(expectedAsset);
        if (asset.ok) { ready = true; break; }
      }
    } catch { /* Rollouts can briefly close connections. */ }
    await delay(5000);
  }
  check(ready, 'Railway no ha servido la nueva versión en cinco minutos. Revisa el despliegue.');
  const anonymous = await request('/api/auth/me');
  check(anonymous.status === 401 && (await anonymous.json()).code === 'SESSION_EXPIRED', 'No se ha confirmado la API de sesiones de la nueva versión.');
  const loginResponse = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: variables.POS_USERNAME, password: variables.POS_PASSWORD }),
  });
  // The initial account can later be renamed, deactivated or given a new password
  // in Settings. Environment variables must never reset those account changes.
  if (loginResponse.status === 401) {
    for (const endpoint of ['/api/auth/users', '/api/auth/sessions', '/api/attendance/employees', '/api/attendance/overview']) {
      check((await request(endpoint)).status === 401, `La ruta ${endpoint} debe exigir una sesión.`);
    }
    console.log('Nueva versión y API de sesiones operativas. Las credenciales iniciales ya no corresponden a una cuenta activa; se conserva la configuración de usuarios.');
    return;
  }
  check(loginResponse.ok, 'La nueva versión no permite acceder con las credenciales configuradas.');
  const login = await loginResponse.json();
  check(login.token && login.user?.role === 'admin', 'No se ha confirmado el perfil administrador.');
  const headers = { Authorization: `Bearer ${login.token}` };
  try {
    for (const endpoint of ['/api/auth/me', '/api/auth/users', '/api/auth/sessions', '/api/attendance/employees', '/api/attendance/overview']) {
      const response = await request(endpoint, { headers });
      check(response.ok && response.headers.get('content-type')?.includes('application/json'), `Falló la comprobación de ${endpoint}.`);
      await response.json();
    }
    console.log('Nueva versión operativa: acceso de administrador, sesiones, empleados y fichajes verificados.');
  } finally {
    const logout = await request('/api/auth/logout', { method: 'POST', headers });
    check(logout.ok, 'No se pudo cerrar la sesión utilizada para verificar el despliegue.');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
