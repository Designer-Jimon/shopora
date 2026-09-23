import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getStorefrontBusiness } from '@/lib/storefront';
import { emptyCartView, findCart, getCartView } from '@/lib/cart';
import { getDeliveryMethods } from '@/lib/order';
import prisma from '@/lib/prisma';
import { isPaymentGatewayConnected } from '@/lib/payments';
import { getSubscriptionState } from '@/lib/subscriptions/state';
import { SUBSCRIPTION_STATUSES } from '@/lib/subscriptions/plans';
import CheckoutForm from '../../_components/CheckoutForm';

export const dynamic = 'force-dynamic';

export default async function StorefrontCheckoutPage({
  params,
}: {
  params: { slug: string };
}) {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) notFound();

  const bizRow = await prisma.business.findUnique({
    where: { slug: biz.slug },
    select: { deliveryConfig: true },
  });
  const deliveryMethods = getDeliveryMethods(bizRow?.deliveryConfig);

  const sessionId = (await cookies()).get('shopora_cart_session')?.value;
  let cart = emptyCartView(biz.id, sessionId ?? '');
  if (sessionId) {
    const existing = await findCart(biz.id, sessionId);
    if (existing) cart = await getCartView(existing);
  }

  if (cart.empty) {
    redirect(`/${biz.slug}/cart`);
  }

  const sub = await getSubscriptionState(biz.id);
  const paystackEnabled = await isPaymentGatewayConnected(biz.id);

  const checkoutBlocked = sub.status === SUBSCRIPTION_STATUSES.suspended || sub.status === SUBSCRIPTION_STATUSES.cancelled;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav className="text-xs text-[var(--sf-muted)]">
        <Link href={`/${biz.slug}`} className="hover:text-[var(--sf-primary)]">{biz.name}</Link>
        <span className="mx-1.5">/</span>
        <Link href={`/${biz.slug}/cart`} className="hover:text-[var(--sf-primary)]">Cart</Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium" style={{ color: 'var(--sf-text)' }}>Checkout</span>
      </nav>

      <h1 className="mt-3 text-xl font-black sm:text-2xl" style={{ color: 'var(--sf-text)' }}>
        Checkout
      </h1>

      {checkoutBlocked ? (
        <div
          className="mt-6 rounded-lg border p-6 text-center"
          style={{ borderColor: 'var(--sf-border)', background: 'var(--sf-tint)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--sf-text)' }}>
            This store is not accepting orders right now.
          </p>
          <p className="mt-2 text-sm text-[var(--sf-muted)]">
            The store owner has paused checkout. Please check back soon.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <CheckoutForm
            slug={biz.slug}
            cart={cart}
            deliveryMethods={deliveryMethods}
            paystackEnabled={paystackEnabled}
          />
        </div>
      )}
    </div>
  );
}