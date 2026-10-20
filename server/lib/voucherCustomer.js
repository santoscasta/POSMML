import { PosError } from './operationStore.js';
import { mutationResult } from './posService.js';

export async function assignVoucherCustomer(gql, { id, customerId } = {}) {
  if (!/^gid:\/\/shopify\/GiftCard\/\d+$/.test(id || '') || !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId || '')) {
    throw new PosError('Vale o cliente inválido');
  }
  const fields = 'id firstName lastName email phone';
  const data = await gql(`query PosVoucherCustomer($id: ID!, $customerId: ID!) {
    giftCard(id: $id) { id enabled customer { ${fields} } }
    customer(id: $customerId) { ${fields} }
  }`, { id, customerId });
  if (!data.giftCard?.enabled) throw new PosError('Vale inexistente o cancelado');
  if (!data.customer) throw new PosError('Cliente no encontrado');
  if (data.giftCard.customer) {
    if (data.giftCard.customer.id !== customerId) throw new PosError('Este vale ya tiene otro cliente asociado. Revisa sus datos en Shopify.', 409);
    return { customer: data.giftCard.customer };
  }
  const card = mutationResult(await gql(`mutation PosVoucherCustomerAssign($id: ID!, $input: GiftCardUpdateInput!) {
    giftCardUpdate(id: $id, input: $input) { giftCard { id customer { ${fields} } } userErrors { message } }
  }`, { id, input: { customerId } }), 'giftCardUpdate', 'giftCard');
  if (card.customer?.id !== customerId) throw new PosError('No se ha confirmado la asociación del cliente. Reintenta.', 409);
  return { customer: card.customer };
}
