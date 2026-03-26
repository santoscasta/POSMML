export function extractId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

export function buildGid(resource: string, id: string | number): string {
  return `gid://shopify/${resource}/${id}`;
}
