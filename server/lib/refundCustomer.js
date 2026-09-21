import { PosError } from './operationStore.js';
import { mutationResult } from './posService.js';

const fields = 'id firstName lastName email phone';

// Runs inside the durable refund operation, before money or stock is changed.
export async function resolveRefundCustomer(gql, ctx, input) {
  if (ctx.op.voucherCustomer !== undefined) return ctx.op.voucherCustomer;
  if (input.customerId && input.newCustomer) throw new PosError('Selecciona un cliente o registra uno nuevo');
  let customer = null;
  if (input.customerId) {
    if (!/^gid:\/\/shopify\/Customer\/\d+$/.test(input.customerId)) throw new PosError('Cliente inválido');
    const data = await gql(`query RefundCustomer($id: ID!) { customer(id: $id) { ${fields} } }`, { id: input.customerId });
    if (!data.customer) throw new PosError('Cliente no encontrado');
    customer = data.customer;
  } else if (input.newCustomer) {
    const value = input.newCustomer;
    const details = {};
    for (const key of ['firstName', 'lastName', 'email', 'phone']) {
      if (value[key] != null && typeof value[key] !== 'string') throw new PosError('Datos del cliente inválidos');
      const text = (value[key] || '').trim();
      if (text.length > 250) throw new PosError('Datos del cliente demasiado largos');
      if (text) details[key] = text;
    }
    if (!details.firstName || (!details.email && !details.phone)) throw new PosError('Indica el nombre y un email o teléfono del cliente');
    if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) throw new PosError('Email del cliente inválido');
    if (details.phone && !/^\+[1-9]\d{6,14}$/.test(details.phone)) throw new PosError('Indica el teléfono con prefijo internacional, por ejemplo +34607140250');
    const tag = `pos-customer-${ctx.op.key}`;
    customer = await ctx.step('refund-customer-create', async () => mutationResult(await gql(`mutation RefundCustomerCreate($input: CustomerInput!) {
      customerCreate(input: $input) { customer { ${fields} } userErrors { message } }
    }`, { input: { ...details, tags: [tag] } }), 'customerCreate', 'customer'), async () => {
      const data = await gql(`query RefundCustomerRecovery($query: String!) {
        customers(first: 2, query: $query) { nodes { ${fields} tags } }
      }`, { query: `tag:${tag}` });
      const matches = data.customers.nodes.filter(c => c.tags.includes(tag));
      return matches.length === 1 ? matches[0] : null;
    });
  }
  ctx.op.voucherCustomer = customer;
  ctx.save();
  return customer;
}
