import test from 'node:test';
import assert from 'node:assert/strict';
import { assignVoucherCustomer } from '../lib/voucherCustomer.js';

const id = 'gid://shopify/GiftCard/42';
const customer = { id: 'gid://shopify/Customer/7', firstName: 'Ana', lastName: 'López', email: 'ana@example.com', phone: null };
const input = { id, customerId: customer.id };

test('assigns a customer to an existing voucher without issuing another or sending email', async () => {
  const calls = [];
  const gql = async (query, variables) => {
    calls.push({ query, variables });
    if (query.includes('query PosVoucherCustomer')) return { giftCard: { id, enabled: true, customer: null }, customer };
    assert.match(query, /mutation PosVoucherCustomerAssign/);
    assert.deepEqual(variables, { id, input: { customerId: customer.id } });
    return { giftCardUpdate: { giftCard: { id, customer }, userErrors: [] } };
  };
  assert.deepEqual(await assignVoucherCustomer(gql, input), { customer });
  assert.equal(calls.length, 2);
});

test('retry after a lost assignment response reads the saved customer without another mutation', async () => {
  let assigned = null;
  let updates = 0;
  const gql = async query => {
    if (query.includes('query PosVoucherCustomer')) return { giftCard: { id, enabled: true, customer: assigned }, customer };
    updates++;
    assigned = customer;
    throw new Error('Connection lost');
  };
  await assert.rejects(assignVoucherCustomer(gql, input), /Connection lost/);
  assert.deepEqual(await assignVoucherCustomer(gql, input), { customer });
  assert.equal(updates, 1);
});

for (const [label, card, foundCustomer, message] of [
  ['another customer', { id, enabled: true, customer: { ...customer, id: 'gid://shopify/Customer/8' } }, customer, /otro cliente/],
  ['a cancelled voucher', { id, enabled: false }, customer, /cancelado/],
  ['a missing voucher', null, customer, /inexistente/],
  ['a missing customer', { id, enabled: true }, null, /Cliente no encontrado/],
]) {
  test(`rejects ${label} before updating the voucher`, async () => {
    await assert.rejects(assignVoucherCustomer(async query => {
      assert.match(query, /query PosVoucherCustomer/);
      return { giftCard: card, customer: foundCustomer };
    }, input), message);
  });
}

test('invalid identifiers never reach Shopify', async () => {
  for (const value of [{}, { ...input, id: '42' }, { ...input, customerId: '7' }]) {
    await assert.rejects(assignVoucherCustomer(() => assert.fail('Unexpected API request'), value), /inválido/);
  }
});

test('a Shopify rejection is shown without claiming association succeeded', async () => {
  await assert.rejects(assignVoucherCustomer(async query => query.includes('query PosVoucherCustomer')
    ? { giftCard: { id, enabled: true }, customer }
    : { giftCardUpdate: { giftCard: null, userErrors: [{ message: 'Assignment rejected' }] } }, input), /Assignment rejected/);
});

test('an unconfirmed customer in the update response never reports success', async () => {
  await assert.rejects(assignVoucherCustomer(async query => query.includes('query PosVoucherCustomer')
    ? { giftCard: { id, enabled: true }, customer }
    : { giftCardUpdate: { giftCard: { id, customer: null }, userErrors: [] } }, input), /No se ha confirmado/);
});
