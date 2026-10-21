const STORAGE_KEY = 'pos.access-session.v1';
let token = '';
try { token = sessionStorage.getItem(STORAGE_KEY) || ''; } catch { /* Memory-only access is still available. */ }
export function setSessionToken(value: string) {
  token = value;
  try { sessionStorage.setItem(STORAGE_KEY, value); } catch { /* Reload will require signing in again. */ }
}
export function hasCredentials() { return Boolean(token); }

export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function clearCredentials() {
  token = '';
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* No stored session. */ }
  window.dispatchEvent(new Event('pos:unauthorized'));
}
