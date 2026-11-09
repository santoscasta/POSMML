import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSessionDefinition, SESSION_TYPE } from '../lib/sessionDefinition.js';

test('a new Shopify store gets its missing cash session definition before opening', async () => {
  let definition = null;
  let creations = 0;
  const gql = async (query, variables) => {
    if (query.includes('query PosSessionDefinition')) {
      assert.equal(variables.type, SESSION_TYPE);
      return { metaobjectDefinitionByType: definition };
    }
    assert.match(query, /mutation PosCreateSessionDefinition/);
    creations++;
    assert.equal(variables.definition.type, '$app:pos_session');
    const fields = Object.fromEntries(variables.definition.fieldDefinitions.map(f => [f.key, f.type]));
    assert.deepEqual(fields, {
      cashier_name: 'single_line_text_field', opening_amount: 'number_decimal',
      closing_amount: 'number_decimal', expected_amount: 'number_decimal',
      difference: 'number_decimal', status: 'single_line_text_field',
      closed_at: 'single_line_text_field', notes: 'multi_line_text_field',
    });
    assert.equal(variables.definition.access.storefront, 'NONE');
    definition = { id: 'definition-production' };
    return { metaobjectDefinitionCreate: { metaobjectDefinition: definition, userErrors: [] } };
  };
  assert.deepEqual(await ensureSessionDefinition(gql), { id: 'definition-production' });
  assert.deepEqual(await ensureSessionDefinition(gql), { id: 'definition-production' });
  assert.equal(creations, 1);
});

test('an existing session definition is preserved without a mutation', async () => {
  const result = await ensureSessionDefinition(async query => {
    assert.match(query, /^query /);
    return { metaobjectDefinitionByType: { id: 'existing-definition' } };
  });
  assert.equal(result.id, 'existing-definition');
});

test('definition permission errors and incomplete responses prevent opening', async () => {
  for (const payload of [
    { metaobjectDefinition: null, userErrors: [{ message: 'Access denied' }] },
    { metaobjectDefinition: null, userErrors: [] },
  ]) {
    await assert.rejects(ensureSessionDefinition(async query => query.startsWith('query ')
      ? { metaobjectDefinitionByType: null }
      : { metaobjectDefinitionCreate: payload }), /Access denied|Respuesta incompleta/);
  }
});
