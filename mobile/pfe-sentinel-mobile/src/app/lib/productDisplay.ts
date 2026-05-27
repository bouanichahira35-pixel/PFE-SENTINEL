import type { ProductRow } from '../../core/db/productsRepo';

export function formatProductLabel(product: ProductRow | null, productId: string) {
  const code = product?.codeProduct ? String(product.codeProduct).trim() : '';
  const name = product?.name ? String(product.name).trim() : '';

  if (name && code) return `${name} • ${code}`;
  if (name) return name;
  if (code) return code;
  return `ID: ${productId.slice(-6)}`;
}

