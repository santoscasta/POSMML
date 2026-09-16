import { PosError } from './operationStore.js';

// Each fulfillment order is its own journaled step (orders may span locations).
export async function fulfillSale(gql, ctx, orderId) {
  const status = async () => {
    const data = await gql(`query PosFulfillmentStatus($id: ID!) {
      order(id: $id) { id displayFulfillmentStatus }
    }`, { id: orderId });
    return data.order?.displayFulfillmentStatus;
  };
  if (await status() === 'FULFILLED') return;

  if (!ctx.op.fulfillmentOrderIds) {
    const orders = [];
    let after = null;
    do {
      const data = await gql(`query PosFulfillmentOrders($id: ID!, $after: String) {
        order(id: $id) { fulfillmentOrders(first: 100, after: $after) {
          nodes { id status supportedActions { action } }
          pageInfo { hasNextPage endCursor }
        } }
      }`, { id: orderId, after });
      const page = data.order?.fulfillmentOrders;
      if (!page) throw new Error('No se pudo consultar la preparación del pedido');
      orders.push(...page.nodes.filter(o => !['CLOSED', 'CANCELLED'].includes(o.status)));
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
    if (!orders.length || orders.some(o => !o.supportedActions.some(a => a.action === 'CREATE_FULFILLMENT'))) {
      throw new PosError('Shopify aún no permite preparar todos los artículos. Reanuda la operación cuando estén disponibles.', 409);
    }
    ctx.op.fulfillmentOrderIds = orders.map(o => o.id);
    ctx.save();
  }

  for (const id of ctx.op.fulfillmentOrderIds) {
    const recovered = async () => {
      const data = await gql(`query PosFulfillmentRecovery($id: ID!) {
        fulfillmentOrder(id: $id) { id status }
      }`, { id });
      return data.fulfillmentOrder?.status === 'CLOSED' ? { id } : null;
    };
    await ctx.step(`fulfill-${id}`, async () => {
      // Reads cannot leave an unknown mutation outcome.
      try { if (await recovered()) return { id }; }
      catch (error) { error.definiteRejection = true; throw error; }
      const data = await gql(`mutation PosFulfill($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id status } userErrors { message }
        }
      }`, { fulfillment: { notifyCustomer: false, lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: id }] } });
      const result = data?.fulfillmentCreate;
      if (result?.userErrors?.length) {
        const error = new PosError(result.userErrors.map(e => e.message).join(', '));
        error.definiteRejection = !result.fulfillment;
        throw error;
      }
      if (!result?.fulfillment?.id || result.fulfillment.status !== 'SUCCESS') throw new Error('Preparación sin confirmar');
      return result.fulfillment;
    }, recovered);
  }
  if (await status() !== 'FULFILLED') {
    throw new PosError('Shopify todavía no confirma todos los artículos como preparados. Reanuda la operación para comprobarlo.', 409);
  }
}
