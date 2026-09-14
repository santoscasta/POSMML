import { randomBytes } from 'node:crypto';
import { cents } from './accounting.js';
import { PosError } from './operationStore.js';
import { mutationResult } from './posService.js';

export async function issueVoucher(gql, store, operationId, input, fields) {
  return store.operation(operationId, 'voucher_issue', input, async ctx => {
    const { amount, customerName, customerEmail, notes } = input;
    if (typeof amount !== 'number' || cents(amount) <= 0) throw new PosError('Importe inválido');
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new PosError('Correo inválido');
    ctx.op.giftCardCode ||= randomBytes(8).toString('hex').toUpperCase();
    ctx.save();
    const metadata = { ...(customerName ? { customerName } : {}), ...(customerEmail ? { customerEmail } : {}), operationId };
    const note = `${notes || `Vale POS MML${customerName ? ` - ${customerName}` : ''}`}\n---POS_META---\n${JSON.stringify(metadata)}`;
    const card = await ctx.step('voucher-create', async () => mutationResult(await gql(`mutation IssuePosVoucher($input: GiftCardCreateInput!) {
      giftCardCreate(input: $input) { giftCard { ${fields} } userErrors { message } }
    }`, { input: { code: ctx.op.giftCardCode, initialValue: (cents(amount) / 100).toFixed(2), note } }), 'giftCardCreate', 'giftCard'), async () => {
      let after = null;
      const cursors = new Set();
      const matches = [];
      do {
        const data = await gql(`query RecoverPosVoucher($query: String!, $after: String) {
          giftCards(first: 10, after: $after, query: $query) { nodes { ${fields} } pageInfo { hasNextPage endCursor } }
        }`, { query: ctx.op.giftCardCode.slice(-4), after });
        matches.push(...data.giftCards.nodes.filter(card => card.lastCharacters.toUpperCase() === ctx.op.giftCardCode.slice(-4)
          && card.note === note && cents(card.initialValue.amount) === cents(amount)));
        if (!data.giftCards.pageInfo.hasNextPage) break;
        after = data.giftCards.pageInfo.endCursor;
        if (!after || cursors.has(after)) throw new Error('No se ha podido completar la comprobación del vale');
        cursors.add(after);
      } while (after);
      return matches.length === 1 ? matches[0] : null;
    });
    return { card, fullCode: ctx.op.giftCardCode };
  });
}

export async function allGiftCards(gql, fields, first = 10, query = null) {
  const cards = new Map();
  const cursors = new Set();
  let after = null;
  do {
    const data = await gql(`query PosGiftCards($first: Int!, $after: String, $query: String) {
      giftCards(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges { node { ${fields} } } pageInfo { hasNextPage endCursor }
      }
    }`, { first, after, query });
    for (const { node } of data.giftCards.edges) cards.set(node.id, node);
    if (!data.giftCards.pageInfo.hasNextPage) break;
    after = data.giftCards.pageInfo.endCursor;
    if (!after || cursors.has(after)) throw new Error('No se han podido cargar todos los vales. Reintenta.');
    cursors.add(after);
  } while (after);
  return [...cards.values()];
}
