import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStorefrontBusiness, getStorefrontProduct } from '@/lib/storefront';
import Gallery from '../../../_components/Gallery';
import BuyPanel from '../../../_components/BuyPanel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string; productSlug: string };
}): Promise<Metadata> {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) return { title: 'Store not found' };
  const product = await getStorefrontProduct(biz.id, params.productSlug);
  if (!product) return { title: 'Product not found' };
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.description ?? undefined,
  };
}

export default async function StoreProductDetail({
  params,
}: {
  params: { slug: string; productSlug: string };
}) {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) notFound();

  const product = await getStorefrontProduct(biz.id, params.productSlug);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav className="text-xs text-[var(--sf-muted)]">
        <Link href={`/${biz.slug}`} className="hover:text-[var(--sf-primary)]">
          {biz.name}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/${biz.slug}/products`} className="hover:text-[var(--sf-primary)]">
          Products
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium" style={{ color: 'var(--sf-text)' }}>
          {product.name}
        </span>
      </nav>

      <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-10">
        <Gallery images={product.images} alt={product.name} />

        <div>
          <h1 className="text-xl font-black sm:text-2xl" style={{ color: 'var(--sf-text)' }}>
            {product.name}
          </h1>

          {product.brand && (
            <p className="mt-1 text-sm text-[var(--sf-muted)]">Brand: {product.brand}</p>
          )}
          {product.category && (
            <p className="mt-1 text-sm text-[var(--sf-muted)]">
              Category:
              <Link
                href={`/${biz.slug}/products?category=${product.category.id}`}
                className="ml-1 font-medium text-[var(--sf-primary)] hover:underline"
              >
                {product.category.name}
              </Link>
            </p>
          )}

          {product.description && (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[var(--sf-text)]">
              {product.description}
            </p>
          )}

          <div className="mt-6">
            <BuyPanel product={product} slug={biz.slug} />
          </div>

          {product.sku && (
            <p className="mt-4 text-xs text-[var(--sf-muted)]">SKU: {product.sku}</p>
          )}
        </div>
      </div>
    </div>
  );
}