let authorization = '';

export function setCredentials(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  authorization = `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))}`;
}

export function authHeaders(): Record<string, string> {
  return authorization ? { Authorization: authorization } : {};
}

export function clearCredentials() {
  authorization = '';
  window.dispatchEvent(new Event('pos:unauthorized'));
}
