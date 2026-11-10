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
  categoryIds?: string[];
  id: string;
  title: string;
  productType?: string;
  description?: string;
  vendor?: string;
  tags?: string[];
  featuredImage: { url: string; altText: string | null } | null;
  status: string;
  totalInventory: number;
  variants: ProductVariant[];
}

export interface ProductSnapshot extends Product {
  createdAt: string;
  updatedAt: string;
  onlineStoreUrl: string | null;
  adminUrl: string | null;
  categories: { id: string; displayName: string }[];
  images: { id: string; url: string; altText: string | null }[];
  variants: (ProductVariant & { inventoryItem: { inventoryHistoryUrl: string | null } })[];
}

export interface ProductHistoryPage {
  events: { id: string; createdAt: string; message: string; action: string; author: string | null; appTitle: string | null }[];
  nextCursor: string | null;
}
