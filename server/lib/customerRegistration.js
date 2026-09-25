import { PosError } from './operationStore.js';
import { mutationResult } from './posService.js';

const fields = 'id firstName lastName email phone';

export async function registerCustomer(gql, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PosError('Datos del cliente inválidos');
  const details = {};
  for (const key of ['firstName', 'lastName', 'email', 'phone']) {
    if (input[key] != null && typeof input[key] !== 'string') throw new PosError('Datos del cliente inválidos');
    const value = (input[key] || '').trim();
    if (value.length > 250) throw new PosError('Datos del cliente demasiado largos');
    if (value) details[key] = value;
  }
  if (!details.firstName || !details.email) throw new PosError('Indica el nombre y el correo del cliente');
  if (details.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) throw new PosError('Correo del cliente inválido');
  if (details.phone && !/^\+[1-9]\d{6,14}$/.test(details.phone)) throw new PosError('Indica el teléfono con prefijo internacional, por ejemplo +34607140250');
  if (typeof input.emailMarketingConsent !== 'boolean') throw new PosError('Indica si el cliente acepta recibir promociones');

  const found = await gql(`query PosRegisterCustomerLookup($query: String!) {
    customers(first: 10, query: $query) { nodes { id email } }
  }`, { query: `email:${JSON.stringify(details.email)}` });
  if (found.customers.nodes.some(customer => customer.email?.toLowerCase() === details.email.toLowerCase())) {
    const error = new PosError('Este correo ya pertenece a un cliente. Búscalo y selecciónalo en el carrito.');
    error.status = 409;
    throw error;
  }

  const customerInput = {
    ...details,
    emailMarketingConsent: input.emailMarketingConsent
      ? { marketingState: 'SUBSCRIBED', marketingOptInLevel: 'SINGLE_OPT_IN', consentUpdatedAt: new Date().toISOString() }
      : { marketingState: 'UNSUBSCRIBED' },
  };
  return mutationResult(await gql(`mutation PosRegisterCustomer($input: CustomerInput!) {
    customerCreate(input: $input) { customer { ${fields} } userErrors { message } }
  }`, { input: customerInput }), 'customerCreate', 'customer');
}
