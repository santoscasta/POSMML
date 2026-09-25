import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCustomer } from '../lib/customerRegistration.js';

test('registers a new customer for a normal order without subscribing by default', async () => {
  const calls = [];
  const customer = { id: 'gid://shopify/Customer/1', firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com', phone: null };
  const result = await registerCustomer(async (query, variables) => {
    calls.push({ query, variables });
    return query.includes('PosRegisterCustomerLookup')
      ? { customers: { nodes: [] } }
      : { customerCreate: { customer, userErrors: [] } };
  }, { firstName: ' Ana ', lastName: ' Pérez ', email: ' ANA@example.com ', emailMarketingConsent: false });
  assert.deepEqual(result, customer);
  assert.deepEqual(calls[1].variables.input, {
    firstName: 'Ana', lastName: 'Pérez', email: 'ANA@example.com',
    emailMarketingConsent: { marketingState: 'UNSUBSCRIBED' },
  });
});

test('subscribes only after explicit email marketing consent', async () => {
  let createInput;
  await registerCustomer(async (query, variables) => {
    if (query.includes('PosRegisterCustomerLookup')) return { customers: { nodes: [] } };
    createInput = variables.input;
    return { customerCreate: { customer: { id: 'gid://shopify/Customer/2' }, userErrors: [] } };
  }, { firstName: 'Ana', email: 'ana@example.com', emailMarketingConsent: true });
  assert.equal(createInput.emailMarketingConsent.marketingState, 'SUBSCRIBED');
  assert.equal(createInput.emailMarketingConsent.marketingOptInLevel, 'SINGLE_OPT_IN');
  assert.ok(Date.parse(createInput.emailMarketingConsent.consentUpdatedAt));
});

test('an existing email cannot create a duplicate or change marketing consent', async () => {
  let calls = 0;
  await assert.rejects(registerCustomer(async () => {
    calls++;
    return { customers: { nodes: [{ id: 'gid://shopify/Customer/3', email: 'ana@example.com' }] } };
  }, { firstName: 'Ana', email: 'ANA@example.com', emailMarketingConsent: true }), /ya pertenece a un cliente/);
  assert.equal(calls, 1);
});
