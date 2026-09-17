import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getStorefrontBusiness } from '@/lib/storefront';
import { emptyCartView, findCart, getCartView } from '@/lib/cart';
import CartPanel from '../../_components/CartPanel';

export const dynamic = 'force-dynamic';

export default async function StorefrontCartPage({
  params,
}: {
  params: { slug: string };
}) {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) notFound();

  const sessionId = (await cookies()).get('shopora_cart_session')?.value;
  let cart = emptyCartView(biz.id, sessionId ?? '');
  if (sessionId) {
    const existing = await findCart(biz.id, sessionId);
    if (existing) cart = await getCartView(existing);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav className="text-xs text-[var(--sf-muted)]">
        <Link href={`/${biz.slug}`} className="hover:text-[var(--sf-primary)]">{biz.name}</Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium" style={{ color: 'var(--sf-text)' }}>Cart</span>
      </nav>

      <h1 className="mt-3 text-xl font-black sm:text-2xl" style={{ color: 'var(--sf-text)' }}>
        Your cart
      </h1>

      <div className="mt-6">
        <CartPanel slug={biz.slug} initialCart={cart} />
      </div>
    </div>
  );
}