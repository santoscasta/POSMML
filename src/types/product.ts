export interface ProductVariant {
  id: string;
  title: string;
  price: string;
  sku?: string;
  barcode?: string;
  inventoryQuantity: number;
  selectedOptions: { name: string; value: string }[];
  image?: { url: string; altText: string | null } | null;
}

export interface Product {
  id: string;
  title: string;
  productType?: string;
  featuredImage: { url: string; altText: string | null } | null;
  status: string;
  totalInventory: number;
  variants: ProductVariant[];
}
