// SHOPORA display formatting helpers (shared server + client).

const NGN = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return NGN.format(value);
}

/** Whole-number discount percentage, or null when not discounted. */
export function discountPercent(price: number, discount: number | null): number | null {
  if (discount == null || price <= 0 || discount >= price) return null;
  return Math.round((1 - discount / price) * 100);
}