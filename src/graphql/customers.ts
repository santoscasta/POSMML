export const CUSTOMERS_SEARCH_QUERY = `
  query SearchCustomers($query: String!) {
    customers(first: 10, query: $query) {
      edges {
        node {
          id
          firstName
          lastName
          email
          phone
        }
      }
    }
  }
`;
