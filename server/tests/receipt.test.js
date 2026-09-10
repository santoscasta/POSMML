import test from 'node:test';
import assert from 'node:assert/strict';
import { sendReceipt } from '../lib/receipt.js';
const store = { read: () => ({ movements: [{ type: 'sale', shopifyOrderName: '#1', shopifyOrderId: 'gid://shopify/Order/1' }] }) };
test('receipt requires a completed sale and valid email before sending', async () => {
  let calls = 0;
  const gql = async () => { calls++; };
  await assert.rejects(sendReceipt(gql, store, {order:'#1',email:'bad'}));
  await assert.rejects(sendReceipt(gql, store, {order:'#2',email:'qa@example.com'}));
  assert.equal(calls, 0);
});
test('receipt sends to the requested recipient and never reports Shopify rejection as success', async () => {
  const input = {order:'#1',email:'qa@example.com'};
  assert.deepEqual(await sendReceipt(async (_q, vars) => {
    assert.equal(vars.id, 'gid://shopify/Order/1');
    assert.equal(vars.email.to, input.email);
    return { orderInvoiceSend: { order: {id:vars.id}, userErrors:[] } };
  }, store, input), {sent:true});
  await assert.rejects(sendReceipt(async () => ({ orderInvoiceSend: { order:null,userErrors:[{message:'Denied'}] } }), store, input), /Denied/);
});
