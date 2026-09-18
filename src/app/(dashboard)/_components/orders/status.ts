// Shared dashboard order display helpers (used by the orders list + detail).

export const STATUS_LABELS: Record<string, string> = {
  payment_pending: 'Awaiting payment',
  paid: 'Paid',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  paystack: 'Pay online (Paystack)',
  bank_transfer: 'Bank transfer',
  cash_on_delivery: 'Cash on delivery',
};