// SHOPORA payment provider abstraction — Phase 8.
//
// Every gateway implements the PaymentProvider interface so checkout, the
// webhook layer and the dashboard don't care WHICH provider is connected.
// Paystack covers today; Flutterwave can implement the same interface later
// without touching any of the call-site code.

export const PAYMENT_METHODS = {
  paystack: 'paystack',
  bankTransfer: 'bank_transfer',
  cashOnDelivery: 'cash_on_delivery',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

/** Allowed provider identifiers (column values on PaymentProvider.provider). */
export const PAYMENT_PROVIDERS = {
  paystack: 'paystack',
  manual: 'manual',
} as const;

export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[keyof typeof PAYMENT_PROVIDERS];

/** A gateway that can be offered at checkout. Currently only Paystack. */
export const CONNECTED_GATEWAYS: Exclude<PaymentMethod, 'bank_transfer' | 'cash_on_delivery'>[] = [
  'paystack',
];

export type InitializeTransactionInput = {
  /** Order id the payment is for. */
  orderId: string;
  /** Shopify-ish human reference shown to the customer (Order.orderNumber). */
  orderNumber: string;
  /** Amount in NGN. The provider converts to kobo internally. */
  amount: number;
  email: string;
  /** Absolute callback URL the gateway should bounce the customer back to. */
  callbackUrl: string;
};

export type InitializeTransactionResult =
  | { ok: true; providerRef: string; authorizationUrl: string }
  | { ok: false; error: string };

export type VerifyTransactionResult = {
  status: 'success' | 'failed' | 'pending' | 'unknown';
  /** Amount actually paid in NGN (null when gateway doesn't report it). */
  amountPaid: number | null;
  providerRef: string;
};

export type WebhookEventType = 'charge.success' | 'charge.failed' | string;

export type ParsedWebhook = {
  event: WebhookEventType;
  providerRef: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
};

export interface PaymentProvider {
  name: PaymentProviderName;
  /**
   * Start a hosted-checkout transaction (Paystack: initialize →
   * authorization_url). NEVER called from the browser with secrets — the
   * calling API loads the secret server-side.
   */
  initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult>;
  /** Server-side verify. Trustworthy auth signal (never client redirects). */
  verifyTransaction(reference: string): Promise<VerifyTransactionResult>;
  /** HMAC signature check over the RAW body. Throws on mismatch. */
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
  /** Parse + validate a webhook payload. */
  parseWebhook(rawBody: string): ParsedWebhook | null;
}