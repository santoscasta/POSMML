export const CUSTOMERS_SEARCH_QUERY = `
  query SearchCustomers($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges {
        node {
          id firstName lastName displayName email phone note tags createdAt
          defaultAddress { company address1 address2 city province country zip phone }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
