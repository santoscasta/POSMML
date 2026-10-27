import { PosError } from './operationStore.js';

const common = new Set([
  '123456789012345', '1234567890123456', '12345678901234567890',
  'passwordpassword', 'password123456789', 'password12345678',
  'contraseña123456', 'contrasena123456', 'contraseñacontraseña',
  'qwertyuiopasdfgh', 'qwerty1234567890', 'abcdefghijklmnop',
  'adminadminadmin', 'administrator123', 'letmeinletmein',
]);

export function validateNewPassword(password, username = '') {
  if (typeof password !== 'string' || password.length > 256 ||
      Array.from(password).length < 15 || Array.from(password).length > 128) {
    throw new PosError('La contraseña debe tener entre 15 y 128 caracteres.');
  }
  const candidate = password.normalize('NFKC').toLowerCase().replace(/\s/g, '');
  if (!candidate || common.has(candidate) || /^(.)\1+$/u.test(candidate) ||
      candidate === username.toLowerCase()) {
    throw new PosError('Elige una contraseña menos común. Puedes usar una frase larga.');
  }
}
