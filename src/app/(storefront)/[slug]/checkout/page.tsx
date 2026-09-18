import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getStorefrontBusiness } from '@/lib/storefront';
import { emptyCartView, findCart, getCartView } from '@/lib/cart';
import { getDeliveryMethods } from '@/lib/order';
import prisma from '@/lib/prisma';
import { isPaymentGatewayConnected } from '@/lib/payments';
import { PAYMENT_METHODS } from '@/lib/payments/types';
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

  const paystackEnabled = await isPaymentGatewayConnected(biz.id);

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

      <div className="mt-6">
        <CheckoutForm
          slug={biz.slug}
          cart={cart}
          deliveryMethods={deliveryMethods}
          paystackEnabled={paystackEnabled}
        />
      </div>
    </div>
  );
}