export const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      edges {
        cursor
        node {
          id
          title
          productType
          featuredImage {
            url
            altText
          }
          status
          totalInventory
          variants(first: 20) {
            edges {
              node {
                id
                title
                price
                sku
                barcode
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
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
