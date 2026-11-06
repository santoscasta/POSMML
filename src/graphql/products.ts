const PRODUCT_VARIANT_FIELDS = `
  id title price sku barcode inventoryQuantity
  selectedOptions { name value }
  image { url altText }
`;

export const PRODUCT_SEARCH_VARIANTS_QUERY = `
  query ProductSearchVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 100, after: $after) {
        edges { node { ${PRODUCT_VARIANT_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      edges {
        cursor
        node {
          id title description vendor tags
          categoryMembership: metafield(namespace: "custom", key: "categorias") { value }
          productType
          featuredImage { url altText }
          status totalInventory
          variants(first: 20) {
            edges { node { ${PRODUCT_VARIANT_FIELDS} } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const PRODUCT_BY_BARCODE_QUERY = `
  query ProductByBarcode($barcode: String!) {
    products(first: 1, query: $barcode) {
      edges {
        node {
          id
          title
          categoryMembership: metafield(namespace: "custom", key: "categorias") { value }
          productType
          featuredImage { url altText }
          status
          totalInventory
          variants(first: 20) {
            edges {
              node {
                id title price sku barcode inventoryQuantity
                selectedOptions { name value }
                image { url altText }
              }
            }
          }
        }
      }
    }
  }
`;
