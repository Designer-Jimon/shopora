import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getStorefrontBusiness,
  listNewArrivals,
  listStorefrontCategories,
  getStorefrontPublishedDesign,
  getStorefrontLatestDesign,
  canPreviewDraft,
} from '@/lib/storefront';
import DesignCover from '@/components/storefront-design/DesignCover';
import ProductCard from '../_components/ProductCard';

export const dynamic = 'force-dynamic';

export default async function StoreHome({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Promise<{ preview?: string }>;
}) {
  const sp = await searchParams;
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) notFound();

  const [arrivals, categories] = await Promise.all([
    listNewArrivals(biz.id, 8),
    listStorefrontCategories(biz.id),
  ]);

  const previewOnly = sp.preview === '1' && (await canPreviewDraft(biz.id));
  const design = previewOnly
    ? await getStorefrontLatestDesign(biz.id)
    : await getStorefrontPublishedDesign(biz.id);

  const hasBanner = !!biz.bannerUrl;

  return (
    <div>
      {previewOnly && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-800">
          Previewing the latest saved draft — visible only to your team. Publish, then check the public store to confirm.
        </div>
      )}

      {/* Hero */}
      {design ? (
        <section className="relative overflow-hidden">
          <DesignCover
            doc={design}
            buttonHref={`/${biz.slug}/products`}
            uid={`cover-${biz.id}`}
          />
        </section>
      ) : (
        <section className="relative overflow-hidden">
          {hasBanner ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={biz.bannerUrl!}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, var(--sf-tint-strong) 0%, var(--sf-tint) 100%)`,
            }}
          />
        )}
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
          <div className="max-w-lg">
            {biz.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={biz.logoUrl}
                alt={`${biz.name} logo`}
                className="mb-4 h-12 w-12 rounded-lg bg-white object-cover sm:h-14 sm:w-14"
              />
            ) : null}
            <h1
              className="text-2xl font-black tracking-tight sm:text-3xl"
              style={{ color: hasBanner ? '#ffffff' : 'var(--sf-text)' }}
            >
              {biz.name}
            </h1>
            {biz.description && (
              <p
                className="mt-2 max-w-md text-sm sm:text-base"
                style={{
                  color: hasBanner ? 'rgba(255,255,255,0.85)' : 'var(--sf-muted)',
                }}
              >
                {biz.description}
              </p>
            )}
            <div className="mt-5">
              <Link
                href={`/${biz.slug}/products`}
                className="inline-block rounded-md px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:brightness-110"
                style={{
                  background: 'var(--sf-primary)',
                  color: 'var(--sf-on-primary)',
                }}
              >
                Shop products
              </Link>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Featured categories */}
      {categories.length > 0 && (
        <section className="border-b" style={{ borderColor: 'var(--sf-border)' }}>
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <h2 className="text-lg font-bold" style={{ color: 'var(--sf-text)' }}>
              Shop by category
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/${biz.slug}/products?category=${cat.id}`}
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition hover:brightness-95"
                  style={{
                    borderColor: 'var(--sf-border)',
                    background: 'var(--sf-bg)',
                    color: 'var(--sf-text)',
                  }}
                >
                  {cat.name}
                  <span className="text-xs text-[var(--sf-muted)]">
                    {cat.productCount}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* New arrivals */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--sf-text)' }}>
            New arrivals
          </h2>
          <Link
            href={`/${biz.slug}/products`}
            className="text-sm font-semibold text-[var(--sf-primary)] hover:underline"
          >
            View all
          </Link>
        </div>

        {arrivals.length === 0 ? (
          <p className="mt-6 rounded-lg border p-8 text-center text-sm text-[var(--sf-muted)]"
             style={{ borderColor: 'var(--sf-border)' }}>
            No products available yet — check back soon.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {arrivals.map((product) => (
              <ProductCard key={product.id} product={product} basePath={`/${biz.slug}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}