import { PosError } from './operationStore.js';
import { mutationResult } from './posService.js';

export async function sendVoucherEmail(gql, { id, email } = {}) {
  email = typeof email === 'string' ? email.trim() : '';
  if (!/^gid:\/\/shopify\/GiftCard\/\d+$/.test(id || '') || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PosError('Vale o correo inválido');
  }
  const data = await gql(`query PosEmailVoucher($id: ID!) { giftCard(id: $id) { id enabled customer { id email } } }`, { id });
  const card = data?.giftCard;
  if (!card?.enabled) throw new PosError('Vale inexistente o cancelado');
  let customer = card.customer;
  if (customer && customer.email?.toLowerCase() !== email.toLowerCase()) {
    throw new PosError('Este vale pertenece a otro correo. Revisa el cliente en Shopify.');
  }
  if (!customer) {
    const found = await gql(`query PosEmailCustomer($query: String!) { customers(first: 10, query: $query) { nodes { id email } } }`, { query: `email:${JSON.stringify(email)}` });
    customer = found.customers.nodes.find(c => c.email?.toLowerCase() === email.toLowerCase());
    if (!customer) customer = mutationResult(await gql(`mutation PosEmailCustomerCreate($input: CustomerInput!) {
      customerCreate(input: $input) { customer { id } userErrors { message } }
    }`, { input: { email } }), 'customerCreate', 'customer');
    mutationResult(await gql(`mutation PosEmailVoucherAssign($id: ID!, $input: GiftCardUpdateInput!) {
      giftCardUpdate(id: $id, input: $input) { giftCard { id } userErrors { message } }
    }`, { id, input: { customerId: customer.id } }), 'giftCardUpdate', 'giftCard');
  }
  mutationResult(await gql(`mutation PosEmailVoucherSend($id: ID!) {
    giftCardSendNotificationToCustomer(id: $id) { giftCard { id } userErrors { message } }
  }`, { id }), 'giftCardSendNotificationToCustomer', 'giftCard');
  return { sent: true, email };
}
