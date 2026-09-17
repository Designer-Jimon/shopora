// Phase 6 HTTP E2E — customer storefront.
// Covers: real tenant-by-slug resolution + per-business theme (two stores, two
// colours, zero bleed), proper 404 for missing/inactive stores and for
// cross-tenant/draft products, listing search/category/price/sort/pagination,
// and that the global (landing) theme is untouched by storefront overrides.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3200';
const EMAILS = { ownerA: 'p6-owner-a@shopora.dev', ownerB: 'p6-owner-b@shopora.dev' };
const COLOR_A = '#6d28d9';
const COLOR_B = '#0d9488';

const prisma = new PrismaClient();
let failed = false;
const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${label}`);
  else { console.error(`  FAIL  ${label}  ${extra}`); failed = true; }
};

async function req(path, method = 'GET', body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text, location: res.headers.get('location'), setCookie: res.headers.get('set-cookie') };
}

function accessCookie(setCookie) {
  const m = (setCookie || '').match(/shopora_session=([^;]*)/);
  return m ? `shopora_session=${m[1]}` : '';
}

async function register(email, businessName) {
  const r = await req('/api/auth/register', 'POST', {
    email, password: 'Phase6Pass123!', firstName: 'P', lastName: 'Six', kind: 'business', businessName,
  });
  return { status: r.status, cookie: accessCookie(r.setCookie) };
}

async function completeOnboarding(cookie, brandColor) {
  const auth = { cookie };
  let r = await req('/api/businesses/me', 'PATCH', { step: 2, category: 'Fashion' }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step2', status: r.status };
  const me = await req('/api/businesses/me', 'GET', undefined, auth);
  r = await req('/api/businesses/me', 'PATCH', { step: 3, slug: me.data.slug }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step3', status: r.status, slug: me.data.slug };
  r = await req('/api/businesses/me', 'PATCH', { step: 4, brandColor }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step4', status: r.status };
  r = await req('/api/businesses/complete', 'POST', undefined, auth);
  if (r.status !== 200) return { ok: false, stage: 'complete', status: r.status };
  const final = await req('/api/businesses/me', 'GET', undefined, auth);
  return { ok: true, slug: final.data.slug };
}

async function main() {
  console.log('== Phase 6 customer storefront ==\n');

  console.log('1. Prepare data (two businesses, distinct themes + products)');
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: Object.values(EMAILS) } } } });
  await prisma.business.deleteMany({ where: { name: { in: ['Phase6 Store A', 'Phase6 Store B'] } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });

  const a = await register(EMAILS.ownerA, 'Phase6 Store A');
  ok('business A registered', a.status === 201, `status=${a.status}`);
  const doneA = await completeOnboarding(a.cookie, COLOR_A);
  ok('business A onboarding complete', doneA.ok, JSON.stringify(doneA));
  const slugA = doneA.slug;

  const b = await register(EMAILS.ownerB, 'Phase6 Store B');
  ok('business B registered', b.status === 201, `status=${b.status}`);
  const doneB = await completeOnboarding(b.cookie, COLOR_B);
  ok('business B onboarding complete', doneB.ok, JSON.stringify(doneB));
  const slugB = doneB.slug;

  const authA = { cookie: a.cookie };

  const catFashion = await req('/api/categories', 'POST', { name: 'Fashion' }, authA);
  const catAccessories = await req('/api/categories', 'POST', { name: 'Accessories' }, authA);
  ok('store A categories created', catFashion.status === 201 && catAccessories.status === 201);

  const productNames = {};
  async function createProduct(payload) {
    const r = await req('/api/products', 'POST', payload, authA);
    if (r.status !== 201) console.error('   !! product create failed', JSON.stringify(payload), r.text);
    productNames[r.data?.name] = r.data?.slug;
    return r.data;
  }

  await createProduct({ name: 'Ankara Dress', price: 25000, discountPrice: 22000, status: 'active', categoryId: catFashion.data.id, description: 'Vibrant wax-print dress', variants: [{ color: 'Red', size: 'M', stockQuantity: 10 }, { color: 'Blue', size: 'S', stockQuantity: 4 }] });
  await createProduct({ name: 'Leather Sandals', price: 15000, status: 'active', categoryId: catFashion.data.id, stockQuantity: 12 });
  await createProduct({ name: 'Gold Necklace', price: 3000, status: 'active', categoryId: catAccessories.data.id, stockQuantity: 0 });
  await createProduct({ name: 'Silk Scarf', price: 8000, status: 'draft', stockQuantity: 5 });
  await createProduct({ name: 'Denim Jacket', price: 18000, status: 'active', categoryId: catFashion.data.id, stockQuantity: 2 });
  await createProduct({ name: 'Spare Part', price: 4000, status: 'archived', stockQuantity: 3 });
  for (let i = 1; i <= 14; i++) {
    await createProduct({ name: `Bulk #${i}`, price: i * 100, status: 'active', stockQuantity: 10 });
  }

  const catB = await req('/api/categories', 'POST', { name: 'Groceries' }, { cookie: b.cookie });
  await req('/api/products', 'POST', { name: 'Plantain Chips', price: 500, status: 'active', categoryId: catB.data.id, stockQuantity: 9 }, { cookie: b.cookie });

  console.log('\n2. Tenant-by-slug resolution + per-store theme');
  const homeA = await req(`/${slugA}`);
  ok('store A home 200', homeA.status === 200, `status=${homeA.status}`);
  ok('store A shows own name', homeA.text.includes('Phase6 Store A'));
  ok('store A applies its own theme colour', homeA.text.includes(`--sf-primary:${COLOR_A}`), COLOR_A);
  ok('store A does NOT expose store B products', !homeA.text.includes('Plantain Chips'));
  ok('store A does NOT contain store B theme colour', !homeA.text.includes(COLOR_B));

  const homeB = await req(`/${slugB}`);
  ok('store B home 200', homeB.status === 200, `status=${homeB.status}`);
  ok('store B applies its own theme colour', homeB.text.includes(`--sf-primary:${COLOR_B}`), COLOR_B);
  ok('store B does NOT expose store A products', !homeB.text.includes('Ankara Dress'));
  ok('store B does NOT contain store A theme colour', !homeB.text.includes(COLOR_A));

  console.log('\n3. 404s — missing store, inactive store, cross-tenant + non-active products');
  const missing = await req('/some-nonexistent-store-xyz');
  ok('missing slug → 404', missing.status === 404, `status=${missing.status}`);

  await prisma.business.update({ where: { slug: slugB }, data: { isActive: false } });
  const inactive = await req(`/${slugB}`);
  ok('inactive store → 404', inactive.status === 404, `status=${inactive.status}`);
  await prisma.business.update({ where: { slug: slugB }, data: { isActive: true } });

  const crossTenant = await req(`/${slugA}/products/${productNames['Plantain Chips'] || 'plantain-chips'}`);
  ok('store A cannot serve store B product → 404', crossTenant.status === 404, `status=${crossTenant.status}`);
  const draft = await req(`/${slugA}/products/${productNames['Silk Scarf']}`);
  ok('draft product → 404', draft.status === 404, `status=${draft.status}`);
  const archived = await req(`/${slugA}/products/${productNames['Spare Part']}`);
  ok('archived product → 404', archived.status === 404, `status=${archived.status}`);

  console.log('\n4. Listing page — scoping + search/filter/sort/pagination');
  const listA = await req(`/${slugA}/products`);
  ok('listing 200', listA.status === 200, `status=${listA.status}`);
  ok('listing default page = newest active prod', listA.text.includes('Bulk #14'));
  ok('listing excludes draft (Silk Scarf)', !listA.text.includes('Silk Scarf'));
  ok('listing excludes archived (Spare Part)', !listA.text.includes('Spare Part'));
  ok('listing excludes store B product', !listA.text.includes('Plantain Chips'));
  ok('listing says 18 products', listA.text.includes('of 18 products'), 'count line');

  const search = await req(`/${slugA}/products?q=ankara`);
  ok('search q=ankara only matches Ankara', search.text.includes('Ankara Dress') && search.text.includes('1 of 1'));

  const catFilter = await req(`/${slugA}/products?category=${catFashion.data.id}`);
  ok('category filter narrows to Fashion', catFilter.text.includes('Ankara Dress') && catFilter.text.includes('Denim Jacket') && !catFilter.text.includes('Gold Necklace'));

  const priceRange = await req(`/${slugA}/products?minPrice=10000&maxPrice=20000`);
  ok('price range 10000-20000 keeps 15000/18000', priceRange.text.includes('Leather Sandals') && priceRange.text.includes('Denim Jacket'));
  ok('price range excludes cheap Gold Necklace', !priceRange.text.includes('Gold Necklace'));

  const asc = await req(`/${slugA}/products?sort=price_asc`);
  const iB1 = asc.text.indexOf('Bulk #1');
  const iB2 = asc.text.indexOf('Bulk #2');
  const iB12 = asc.text.indexOf('Bulk #12');
  ok('sort price_asc orders cheapest first', iB1 > 0 && iB1 < iB2 && iB2 < iB12, `b1=${iB1} b2=${iB2} b12=${iB12}`);

  const desc = await req(`/${slugA}/products?sort=price_desc`);
  const dAnk = desc.text.indexOf('Ankara Dress');
  const dDen = desc.text.indexOf('Denim Jacket');
  const dLea = desc.text.indexOf('Leather Sandals');
  const dGol = desc.text.indexOf('Gold Necklace');
  ok('sort price_desc orders priciest first', dAnk > 0 && dAnk < dDen && dDen < dLea && dLea < dGol, `ank=${dAnk} den=${dDen} lea=${dLea} gol=${dGol}`);

  const p1 = await req(`/${slugA}/products`);
  const p2 = await req(`/${slugA}/products?page=2`);
  ok('page 1 shows newest 12, Ankara is on page 2', p2.text.includes('Ankara Dress') && !p1.text.includes('Ankara Dress'));
  ok('page 2 surfaces all earlier active products', ['Gold Necklace', 'Leather Sandals', 'Denim Jacket'].every((n) => p2.text.includes(n)));
  ok('page 2 still excludes non-active + foreign products', !p2.text.includes('Silk Scarf') && !p2.text.includes('Plantain Chips'));
  ok('page 1 has pagination next link', p1.text.includes('>Next<') || p1.text.includes('Next'));

  console.log('\n5. Product detail');
  const slugAnkara = productNames['Ankara Dress'];
  const detail = await req(`/${slugA}/products/${slugAnkara}`);
  ok('detail 200', detail.status === 200, `status=${detail.status}`);
  ok('detail shows name + description', detail.text.includes('Ankara Dress') && detail.text.includes('Vibrant wax-print dress'));
  ok('detail shows discount price ₦22,000', detail.text.includes('₦22,000'));
  ok('detail shows variant colour selector (Red)', detail.text.includes('>Red<') || detail.text.includes('Red'));
  ok('detail shows Add to cart stub', detail.text.includes('Add to cart'));
  ok('detail shows Buy now stub', detail.text.includes('Buy now'));

  const slugJacket = productNames['Denim Jacket'];
  const jacketDetail = await req(`/${slugA}/products/${slugJacket}`);
  ok('no-variant low stock shows "Only 2 left in stock"', jacketDetail.text.includes('Only 2 left in stock'), 'Jacket detail');
  const slugSandals = productNames['Leather Sandals'];
  const sandalsDetail = await req(`/${slugA}/products/${slugSandals}`);
  ok('no-variant in-stock shows "In stock"', sandalsDetail.text.includes('In stock'), 'Sandals detail');
  const slugNecklace = productNames['Gold Necklace'];
  const necklaceDetail = await req(`/${slugA}/products/${slugNecklace}`);
  ok('no-variant out-of-stock shows "Sold out"', necklaceDetail.text.includes('Sold out'), 'Necklace detail');

  console.log('\n6. Global theming untouched by storefront overrides');
  const landing = await req('/');
  ok('landing 200', landing.status === 200, `status=${landing.status}`);
  ok('landing does NOT contain store A theme colour', !landing.text.includes(COLOR_A));
  ok('landing does NOT contain storefront CSS vars', !landing.text.includes('--sf-primary'));

  console.log('\n7. Mobile-first markers');
  const viewport = homeA.text.includes('width=device-width');
  ok('responsive viewport meta present', viewport);
  ok('home uses mobile-first 2-col grid', homeA.text.includes('grid-cols-2'));
  ok('listing uses responsive grid classes', listA.text.includes('grid-cols-2') && listA.text.includes('lg:grid-cols-4'));
  ok('detail uses responsive 2-col split', detail.text.includes('lg:grid-cols-2'));
  ok('filters layout is mobile-first', listA.text.includes('grid-cols-2') && listA.text.includes('sm:grid-cols-3'));

  console.log('\nCleanup');
  await prisma.product.deleteMany({ where: { business: { name: 'Phase6 Store A' } } });
  await prisma.category.deleteMany({ where: { business: { name: 'Phase6 Store A' } } });
  await prisma.product.deleteMany({ where: { business: { name: 'Phase6 Store B' } } });
  await prisma.category.deleteMany({ where: { business: { name: 'Phase6 Store B' } } });
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: Object.values(EMAILS) } } } });
  await prisma.business.deleteMany({ where: { name: { in: ['Phase6 Store A', 'Phase6 Store B'] } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ALL PHASE 6 CHECKS PASSED =='));
  await prisma.$disconnect();
  if (failed) process.exit(1);
}

main().catch(async (e) => { console.error('crash', e); await prisma.$disconnect(); process.exit(1); });