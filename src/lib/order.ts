// SHOPORA checkout/order server helpers.
//
// placeOrder runs in a single Prisma transaction:
//   1. Re-load the cart + items with live product/variant stock + prices.
//   2. Validate every line against available stock (variant or base product).
//   3. Decrement stock with a race-condition-safe updateMany(stock >= qty).
//   4. Write one InventoryTransaction row per line (reason "sale").
//   5. Create the Order + OrderItems (price snapshots) + OrderStatusHistory.
//   6. Empty the cart.
//
// Payment is intentionally NOT processed — ORDER_STATUS.payment_pending order
// lands and payment arrives in Phase 8.

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { findCart, linePrice } from '@/lib/cart';

export type DeliveryMethod = {
  id: string;
  name: string;
  description: string;
  fee: number;
};

export const DEFAULT_DELIVERY_METHODS: DeliveryMethod[] = [
  { id: 'pickup', name: 'Pickup', description: 'Collect in person', fee: 0 },
  { id: 'standard', name: 'Standard Delivery', description: '2–4 business days', fee: 1500 },
  { id: 'express', name: 'Express Delivery', description: 'Same-day / next-day', fee: 3000 },
];

export const ORDER_STATUSES = {
  paymentPending: 'payment_pending',
  confirmed: 'confirmed',
  processing: 'processing',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
} as const;

/** Per-business delivery methods from deliveryConfig (falls back to defaults). */
export function getDeliveryMethods(deliveryConfig: unknown): DeliveryMethod[] {
  const raw = deliveryConfig as { methods?: unknown } | null;
  const methods = raw?.methods;
  if (!Array.isArray(methods) || methods.length === 0) return DEFAULT_DELIVERY_METHODS;

  const parsed: DeliveryMethod[] = [];
  for (const m of methods) {
    const id = (m as { id?: unknown })?.id;
    if (typeof id !== 'string' || !id.trim()) continue;
    const name = (m as { name?: unknown })?.name;
    const feeRaw = Number((m as { fee?: unknown })?.fee ?? 0);
    const descRaw = (m as { description?: unknown })?.description;
    parsed.push({
      id: id.trim(),
      name: typeof name === 'string' && name.trim() ? name.trim() : id.trim(),
      description: typeof descRaw === 'string' ? descRaw : '',
      fee: Number.isFinite(feeRaw) && feeRaw >= 0 ? feeRaw : 0,
    });
  }
  return parsed.length > 0 ? parsed : DEFAULT_DELIVERY_METHODS;
}

export function getDeliveryMethod(deliveryConfig: unknown, id: string): DeliveryMethod | null {
  return getDeliveryMethods(deliveryConfig).find((m) => m.id === id) ?? null;
}

export type DeliveryAddress = {
  state: string;
  city: string;
  address: string;
  landmark?: string | null;
};

export type PlaceOrderInput = {
  businessId: string;
  sessionId: string;
  userId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  deliveryMethodId: string;
  deliveryConfig: unknown;
  deliveryAddress?: DeliveryAddress | null;
  notes?: string | null;
};

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: string; total: number }
  | { ok: false; error: string; fieldErrors?: { field: string; message: string }[] };

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const {
    businessId,
    sessionId,
    userId,
    customerName,
    customerEmail,
    customerPhone,
    deliveryMethodId,
    deliveryConfig,
    deliveryAddress,
    notes,
  } = input;

  // Validate customer info.
  if (!customerName.trim()) {
    return { ok: false, error: 'Customer name is required', fieldErrors: [{ field: 'name', message: 'Name is required' }] };
  }
  if (!customerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
    return { ok: false, error: 'A valid email is required', fieldErrors: [{ field: 'email', message: 'A valid email is required' }] };
  }

  const method = getDeliveryMethod(deliveryConfig, deliveryMethodId);
  if (!method) {
    return { ok: false, error: 'Unknown delivery method' };
  }

  if (method.id !== 'pickup') {
    const badField = ['state', 'city', 'address'].find(
      (f) => !(deliveryAddress?.[f as keyof DeliveryAddress] as string | undefined)?.trim(),
    );
    if (badField) {
      return {
        ok: false,
        error: `${badField.charAt(0).toUpperCase() + badField.slice(1)} is required for delivery`,
        fieldErrors: [{ field: badField, message: `${badField.charAt(0).toUpperCase() + badField.slice(1)} is required` }],
      };
    }
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const cart = await findCart(businessId, sessionId);
      if (!cart) throw new CheckoutError('Cart not found');

      const items = await tx.cartItem.findMany({
        where: { cartId: cart.id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              discountPrice: true,
              status: true,
            },
          },
          variant: {
            select: {
              id: true,
              color: true,
              size: true,
              priceOverride: true,
              stockQuantity: true,
            },
          },
        },
      });

      if (items.length === 0) throw new CheckoutError('Your cart is empty');

      // Inspect each line and verify the product/variant still exists + stock.
      type PreparedLine = {
        itemId: string;
        product: (typeof items)[number]['product'];
        variant: (typeof items)[number]['variant'];
        quantity: number;
        unit: number;
        original: number;
      };

      const prepared: PreparedLine[] = [];
      for (const item of items) {
        if (item.product.status !== 'active') {
          throw new CheckoutError(`"${item.product.name}" is no longer available for purchase`);
        }

        let liveVariant: (typeof items)[number]['variant'] = null;
        let liveStock: number;
        if (item.variantId) {
          liveVariant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            select: { id: true, color: true, size: true, priceOverride: true, stockQuantity: true },
          });
          if (!liveVariant) throw new CheckoutError('A product option is no longer available');
          liveStock = liveVariant.stockQuantity;
        } else {
          liveStock = (await tx.product.findUnique({ where: { id: item.productId }, select: { stockQuantity: true } }))
            ?.stockQuantity ?? 0;
        }

        if (liveStock < item.quantity) {
          throw new CheckoutError(
            `Only ${liveStock} of "${item.product.name}" left in stock. Please adjust your cart.`,
          );
        }

        const { unit, original } = linePrice(item.product, liveVariant);
        prepared.push({
          itemId: item.id,
          product: item.product,
          variant: liveVariant,
          quantity: item.quantity,
          unit,
          original,
        });
      }

      // Decrement stock (race-condition safe).
      for (const line of prepared) {
        if (line.variant) {
          const res = await tx.productVariant.updateMany({
            where: { id: line.variant.id, stockQuantity: { gte: line.quantity } },
            data: { stockQuantity: { decrement: line.quantity } },
          });
          if (res.count === 0) {
            throw new CheckoutError(`Not enough stock for "${line.product.name}". Please adjust your cart.`);
          }
        } else {
          const res = await tx.product.updateMany({
            where: { id: line.product.id, businessId, stockQuantity: { gte: line.quantity } },
            data: { stockQuantity: { decrement: line.quantity } },
          });
          if (res.count === 0) {
            throw new CheckoutError(`Not enough stock for "${line.product.name}". Please adjust your cart.`);
          }
        }
      }

      // Totals.
      const subtotal = prepared.reduce((s, l) => s + l.unit * l.quantity, 0);
      const discountTotal = prepared.reduce((s, l) => s + (l.original - l.unit) * l.quantity, 0);
      const total = subtotal + method.fee;

      // Sequential per-business order number.
      const existing = await tx.order.count({ where: { businessId } });
      const orderNumber = (existing + 1).toString().padStart(4, '0');

      const order = await tx.order.create({
        data: {
          businessId,
          userId: userId ?? null,
          orderNumber,
          status: ORDER_STATUSES.paymentPending,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim().toLowerCase(),
          customerPhone: customerPhone?.trim() || null,
          deliveryMethod: method.id,
          deliveryAddress: deliveryAddress !== null ? (deliveryAddress as Prisma.InputJsonValue) : Prisma.DbNull,
          subtotal: subtotal.toFixed(2),
          discountTotal: discountTotal.toFixed(2),
          deliveryFee: method.fee.toFixed(2),
          total: total.toFixed(2),
          notes: notes?.trim() || null,
          items: {
            create: prepared.map((l) => ({
              productId: l.product.id,
              variantId: l.variant?.id ?? null,
              productName: l.product.name,
              variantLabel:
                l.variant != null
                  ? [l.variant.color, l.variant.size].filter(Boolean).join(' / ') || null
                  : null,
              quantity: l.quantity,
              unitPrice: l.unit.toFixed(2),
              total: (l.unit * l.quantity).toFixed(2),
            })),
          },
          history: {
            create: {
              status: ORDER_STATUSES.paymentPending,
              note: 'Order placed — awaiting payment',
            },
          },
        },
      });

      // Inventory audit trail + clear the cart.
      const now = new Date();
      await tx.inventoryTransaction.createMany({
        data: prepared.map((l) => ({
          businessId,
          productId: l.product.id,
          variantId: l.variant?.id ?? null,
          changeQty: -l.quantity,
          reason: 'sale',
          createdAt: now,
        })),
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order;
    });

    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.total),
    };
  } catch (err) {
    if (err instanceof CheckoutError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function getDeliveryMethodsForBusiness(businessId: string): Promise<DeliveryMethod[]> {
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { deliveryConfig: true },
  });
  return getDeliveryMethods(biz?.deliveryConfig);
}

export type OrderView = {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  deliveryMethod: string;
  deliveryAddress: DeliveryAddress | null;
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  total: number;
  notes: string | null;
  createdAt: Date;
  methodName: string;
  items: {
    id: string;
    productName: string;
    variantLabel: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  history: { status: string; note: string | null; changedAt: Date }[];
};

/** Order confirmation view scoped by business + order id. */
export async function getOrderView(businessId: string, orderId: string): Promise<OrderView | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: {
      items: { select: { id: true, productName: true, variantLabel: true, quantity: true, unitPrice: true, total: true } },
      history: { select: { status: true, note: true, changedAt: true }, orderBy: { changedAt: 'asc' } },
    },
  });

  if (!order) return null;

  const method = getDeliveryMethod(
    await prisma.business.findUnique({ where: { id: businessId }, select: { deliveryConfig: true } })
      .then((b) => b?.deliveryConfig),
    order.deliveryMethod,
  );

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    deliveryMethod: order.deliveryMethod,
    deliveryAddress: order.deliveryAddress as DeliveryAddress | null,
    subtotal: Number(order.subtotal),
    discountTotal: Number(order.discountTotal),
    deliveryFee: Number(order.deliveryFee),
    total: Number(order.total),
    notes: order.notes,
    createdAt: order.createdAt,
    methodName: method?.name ?? order.deliveryMethod,
    items: order.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      total: Number(i.total),
    })),
    history: order.history.map((h) => ({ status: h.status, note: h.note, changedAt: h.changedAt })),
  };
}

class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}