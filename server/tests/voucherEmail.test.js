import test from 'node:test';
import assert from 'node:assert/strict';
import { sendVoucherEmail } from '../lib/voucherEmail.js';
const id = 'gid://shopify/GiftCard/1';
const email = 'customer@example.com';

test('voucher email attaches exact matching customer and explicitly sends without issuing another card', async () => {
  const calls = [];
  const gql = async (query, variables) => {
    calls.push(query);
    if (query.includes('query PosEmailVoucher')) return { giftCard: { id, enabled: true, customer: null } };
    if (query.includes('query PosEmailCustomer')) return { customers: { nodes: [{ id: 'wrong', email: 'other@example.com' }, { id: 'right', email }] } };
    if (query.includes('PosEmailVoucherAssign')) {
      assert.equal(variables.input.customerId, 'right');
      return { giftCardUpdate: { giftCard: { id } } };
    }
    assert.match(query, /giftCardSendNotificationToCustomer/);
    return { giftCardSendNotificationToCustomer: { giftCard: { id } } };
  };
  assert.deepEqual(await sendVoucherEmail(gql, { id, email }), { sent: true, email });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(q => !q.includes('giftCardCreate')));
});

test('voucher email cannot silently reassign an existing customer or send an invalid address', async () => {
  let calls = 0;
  const gql = async () => { calls++; return { giftCard: { id, enabled: true, customer: { id: 'old', email: 'other@example.com' } } }; };
  await assert.rejects(sendVoucherEmail(gql, { id, email: 'invalid' }), /inválido/);
  assert.equal(calls, 0);
  await assert.rejects(sendVoucherEmail(gql, { id, email }), /otro correo/);
  assert.equal(calls, 1);
});

test('notification rejection or missing response never reports sent', async () => {
  for (const result of [{ userErrors: [{ message: 'Delivery rejected' }] }, {}]) {
    const gql = async query => query.includes('query PosEmailVoucher')
      ? { giftCard: { id, enabled: true, customer: { id: 'customer', email } } }
      : { giftCardSendNotificationToCustomer: result };
    await assert.rejects(sendVoucherEmail(gql, { id, email }));
  }
});

test('creates an email-only customer when needed, then assigns and sends the existing voucher', async () => {
  const calls = [];
  const gql = async (query, variables) => {
    calls.push(query);
    if (query.includes('query PosEmailVoucher')) return { giftCard: { id, enabled: true } };
    if (query.includes('query PosEmailCustomer')) return { customers: { nodes: [] } };
    if (query.includes('PosEmailCustomerCreate')) {
      assert.deepEqual(variables.input, { email });
      return { customerCreate: { customer: { id: 'new' } } };
    }
    if (query.includes('PosEmailVoucherAssign')) return { giftCardUpdate: { giftCard: { id } } };
    return { giftCardSendNotificationToCustomer: { giftCard: { id } } };
  };
  await sendVoucherEmail(gql, { id, email });
  assert.equal(calls.length, 5);
});
