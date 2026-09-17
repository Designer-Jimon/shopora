import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getStorefrontBusiness } from '@/lib/storefront';
import { getCartCount } from '@/lib/cart';
import { themeCssVars } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) return { title: 'Store not found' };
  return {
    title: biz.name,
    description: biz.description ?? `${biz.name} — storefront on SHOPORA`,
  };
}

export async function generateViewport({
  params,
}: {
  params: { slug: string };
}): Promise<Viewport> {
  const biz = await getStorefrontBusiness(params.slug);
  return { themeColor: biz?.theme.primaryColor ?? '#722F37' };
}

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) notFound();

  const sessionId = (await cookies()).get('shopora_cart_session')?.value;
  const cartCount = sessionId ? await getCartCount(biz.id, sessionId) : 0;

  return (
    <>
      <style>{`[data-theme="storefront"]{${themeCssVars(biz.theme)}}`}</style>
      <div
        className="flex min-h-screen flex-col"
        style={{ background: 'var(--sf-bg)', color: 'var(--sf-text)' }}
      >
        <header
          className="sticky top-0 z-20 border-b bg-[var(--sf-bg)]/95 backdrop-blur"
          style={{ borderColor: 'var(--sf-border)' }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href={`/${biz.slug}`} className="flex min-w-0 items-center gap-2">
              {biz.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={biz.logoUrl}
                  alt={`${biz.name} logo`}
                  className="h-8 w-8 shrink-0 rounded-full bg-[var(--sf-tint)] object-cover"
                />
              ) : (
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sf-primary)] text-sm font-bold"
                  style={{ color: 'var(--sf-on-primary)' }}
                >
                  {(biz.name || 'S').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
                {biz.name}
              </span>
            </Link>
            <nav className="flex items-center gap-4 sm:gap-6">
              <Link
                href={`/${biz.slug}/products`}
                className="text-sm font-medium text-[var(--sf-muted)] hover:text-[var(--sf-primary)]"
              >
                Products
              </Link>
              <Link
                href={`/${biz.slug}/cart`}
                aria-label={`Cart, ${cartCount} items`}
                className="relative rounded-md border px-3 py-1.5 text-sm font-semibold transition hover:brightness-95"
                style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
              >
                Cart
                {cartCount > 0 && (
                  <span
                    className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold"
                    style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
                style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
              >
                SHOPORA
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t" style={{ borderColor: 'var(--sf-border)', background: 'var(--sf-tint)' }}>
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
                {biz.name}
              </p>
              {biz.description && (
                <p className="mt-1 text-sm text-[var(--sf-muted)]">{biz.description}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
                Contact
              </p>
              {biz.phone && <p className="mt-1 text-sm text-[var(--sf-text)]">{biz.phone}</p>}
              {biz.whatsappNumber && (
                <p className="mt-1 text-sm text-[var(--sf-text)]">WhatsApp: {biz.whatsappNumber}</p>
              )}
              {biz.address && <p className="mt-1 text-sm text-[var(--sf-text)]">{biz.address}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
                Powered by
              </p>
              <p className="mt-1 text-sm">
                <Link href="/" className="font-semibold text-[var(--sf-primary)]">
                  SHOPORA
                </Link>{' '}
                <span className="text-[var(--sf-muted)]">Build. Sell. Grow.</span>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}