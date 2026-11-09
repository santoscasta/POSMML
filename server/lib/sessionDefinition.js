import { mutationResult } from './posService.js';

export const SESSION_TYPE = '$app:pos_session';

// Definitions belong to each Shopify store. Installing the app in another
// store does not copy the definition from the development store.
export async function ensureSessionDefinition(gql) {
  const data = await gql(`query PosSessionDefinition($type: String!) {
    metaobjectDefinitionByType(type: $type) { id }
  }`, { type: SESSION_TYPE });
  if (data.metaobjectDefinitionByType) return data.metaobjectDefinitionByType;

  const created = await gql(`mutation PosCreateSessionDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id }
      userErrors { field message }
    }
  }`, {
    definition: {
      name: 'Sesión de caja POS MML',
      type: SESSION_TYPE,
      access: { admin: 'MERCHANT_READ_WRITE', storefront: 'NONE' },
      fieldDefinitions: [
        { key: 'cashier_name', name: 'Cajero', type: 'single_line_text_field' },
        { key: 'opening_amount', name: 'Apertura', type: 'number_decimal' },
        { key: 'closing_amount', name: 'Cierre', type: 'number_decimal' },
        { key: 'expected_amount', name: 'Esperado', type: 'number_decimal' },
        { key: 'difference', name: 'Diferencia', type: 'number_decimal' },
        { key: 'status', name: 'Estado', type: 'single_line_text_field' },
        { key: 'closed_at', name: 'Cerrado', type: 'single_line_text_field' },
        { key: 'notes', name: 'Notas', type: 'multi_line_text_field' },
      ],
    },
  });
  return mutationResult(created, 'metaobjectDefinitionCreate', 'metaobjectDefinition');
}
