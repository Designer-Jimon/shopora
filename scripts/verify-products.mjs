// Phase 5 HTTP E2E — product & inventory management.
// Covers: category CRUD, product create with variants+images, inventory
// adjustment (InventoryTransaction row written, stock reflects change),
// search/filter/sort/pagination on the All Products page, and tenant
// isolation (Business B cannot see Business A's products).

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3200';
const EMAILS = {
  ownerA: 'p5-owner-a@shopora.dev',
  ownerB: 'p5-owner-b@shopora.dev',
};

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
  return { status: res.status, data, location: res.headers.get('location'), setCookie: res.headers.get('set-cookie') };
}

function accessCookie(setCookie) {
  const m = (setCookie || '').match(/shopora_session=([^;]*)/);
  return m ? `shopora_session=${m[1]}` : '';
}

async function register(email, businessName) {
  const r = await req('/api/auth/register', 'POST', {
    email, password: 'Phase5Pass123!', firstName: 'P', lastName: 'Five', kind: 'business', businessName,
  });
  return { status: r.status, cookie: accessCookie(r.setCookie) };
}

async function completeOnboarding(cookie) {
  const auth = { cookie };
  let r = await req('/api/businesses/me', 'PATCH', { step: 2, category: 'Fashion' }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step2', status: r.status, body: r };
  const me = await req('/api/businesses/me', 'GET', undefined, auth);
  r = await req('/api/businesses/me', 'PATCH', { step: 3, slug: me.data.slug }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step3', status: r.status, body: r };
  r = await req('/api/businesses/me', 'PATCH', { step: 4, brandColor: '#722F37' }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step4', status: r.status, body: r };
  r = await req('/api/businesses/complete', 'POST', undefined, auth);
  if (r.status !== 200) return { ok: false, stage: 'complete', status: r.status, body: r };
  return { ok: true };
}

async function main() {
  console.log('== Phase 5 products & inventory ==\n');

  console.log('1. Prepare data (clean + register two businesses)');
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: Object.values(EMAILS) } } } });
  await prisma.business.deleteMany({ where: { name: { in: ['Phase5 Mart A', 'Phase5 Mart B'] } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });

  const a = await register(EMAILS.ownerA, 'Phase5 Mart A');
  ok('business A registered', a.status === 201, `status=${a.status}`);
  const doneA = await completeOnboarding(a.cookie);
  ok('business A onboarding complete', doneA.ok, JSON.stringify(doneA));

  const b = await register(EMAILS.ownerB, 'Phase5 Mart B');
  ok('business B registered', b.status === 201, `status=${b.status}`);
  const doneB = await completeOnboarding(b.cookie);
  ok('business B onboarding complete', doneB.ok, JSON.stringify(doneB));

  const authA = { cookie: a.cookie };
  const authB = { cookie: b.cookie };

  console.log('\n2. Category CRUD');
  const catR = await req('/api/categories', 'POST', { name: 'Fashion', description: 'Clothing & accessories' }, authA);
  ok('category created', catR.status === 201, `status=${catR.status}`);
  const cat = catR.data;
  ok('category has slug', !!cat?.slug, JSON.stringify(cat));

  const subCatR = await req('/api/categories', 'POST', { name: 'Shoes', parentId: cat.id }, authA);
  ok('nested category created (parentId)', subCatR.status === 201, `status=${subCatR.status}`);

  const listCats = await req('/api/categories?tree=1', 'GET', undefined, authA);
  const treeOk =
    Array.isArray(listCats.data) &&
    listCats.data.some((c) => c.name === 'Fashion' && Array.isArray(c.children) && c.children.some((ch) => ch.name === 'Shoes'));
  ok('category tree nests child under parent', treeOk, JSON.stringify(listCats.data));

  console.log('\n3. Product create with variants + images');
  const prodPayload = {
    name: 'Ankara Wax Print Dress',
    description: 'Beautiful wax print dress',
    brand: 'Vlisco',
    sku: 'ANK-001',
    price: 25000,
    discountPrice: 22000,
    status: 'active',
    categoryId: cat.id,
    imageUrls: ['/uploads/products/2026-09-15/test-dress-1.png', '/uploads/products/2026-09-15/test-dress-2.png'],
    variants: [
      { sku: 'ANK-001-RED-M', color: 'Red', size: 'M', weight: 500, priceOverride: null, stockQuantity: 10 },
      { sku: 'ANK-001-BLU-S', color: 'Blue', size: 'S', weight: 480, priceOverride: 24000, stockQuantity: 4 },
    ],
  };
  const prodR = await req('/api/products', 'POST', prodPayload, authA);
  ok('product created', prodR.status === 201, `status=${prodR.status} body=${JSON.stringify(prodR.data)}`);
  const prod = prodR.data;
  ok('product got slug', !!prod?.slug, JSON.stringify(prod));
  ok('product has 2 images', prod?.images?.length === 2, JSON.stringify(prod?.images));
  ok('product has 2 variants', prod?.variants?.length === 2, JSON.stringify(prod?.variants));

  const imageUpload = new FormData();
  imageUpload.append('file', new Blob([Buffer.from('fake-png'), { type: 'image/png' }]), 'dress.png');
  const upR = await fetch(BASE + '/api/uploads/product', { method: 'POST', headers: { cookie: a.cookie }, body: imageUpload });
  ok('product image upload endpoint works', upR.status === 200, `status=${upR.status}`);

  // second product (for search/filter tests), no variants
  const prod2 = await req('/api/products', 'POST', {
    name: 'Leather Sandals', brand: 'Nike', sku: 'SNK-002', price: 15000, status: 'draft', categoryId: cat.id, stockQuantity: 2,
  }, authA);
  ok('second product created', prod2.status === 201, `status=${prod2.status}`);
  ok('second product persisted base stockQuantity=2', prod2.data?.stockQuantity === 2, `got=${prod2.data?.stockQuantity}`);
  ok('second product has no variants → effectiveStock = base stock (2)', prod2.data?.effectiveStock === 2, `got=${prod2.data?.effectiveStock}`);
  const prod2b = await req('/api/products', 'POST', {
    name: 'Silk Scarf', sku: 'SCF-003', price: 8000, status: 'active', stockQuantity: 0,
  }, authA);
  ok('third product created', prod2b.status === 201, `status=${prod2b.status}`);
  ok('third product persisted base stockQuantity=0', prod2b.data?.stockQuantity === 0, `got=${prod2b.data?.stockQuantity}`);
  ok('third product effectiveStock uses base stock (0)', prod2b.data?.effectiveStock === 0, `got=${prod2b.data?.effectiveStock}`);

  console.log('\n4. Inventory adjustment → InventoryTransaction + stock');
  const adjustR = await req('/api/inventory', 'POST', { productId: prod.id, variantId: prod.variants[0].id, changeQty: 25, reason: 'Restock from supplier' }, authA);
  ok('stock adjustment accepted', adjustR.status === 200, `status=${adjustR.status} ${JSON.stringify(adjustR.data)}`);
  ok('InventoryTransaction row written', !!adjustR.data?.id, JSON.stringify(adjustR.data));

  const invTx = await prisma.inventoryTransaction.findUnique({ where: { id: adjustR.data.id } });
  ok('transaction persisted in DB', !!invTx, `missing id=${adjustR.data.id}`);
  ok('transaction has changeQty=25', invTx?.changeQty === 25, `got=${invTx?.changeQty}`);
  ok('transaction has reason', invTx?.reason === 'Restock from supplier', `got=${invTx?.reason}`);
  ok('transaction businessId = owner A business', !!invTx && invTx.businessId === prod.businessId);

  const fetched = await req(`/api/products/${prod.id}`, 'GET', undefined, authA);
  const redVariant = fetched.data?.variants?.find((v) => v.color === 'Red');
  ok('variant stock reflects adjustment (10+25=35)', redVariant?.stockQuantity === 35, `got=${redVariant?.stockQuantity}`);

  console.log('\n5. All Products page — search/filter/sort/pagination');
  const listAll = await req('/api/products?sort=newest&pageSize=25', 'GET', undefined, authA);
  ok('all products listed (3)', listAll.data?.total === 3, `total=${listAll.data?.total}`);

  const search = await req('/api/products?q=ankara', 'GET', undefined, authA);
  ok('search finds "ankara" (1)', search.data?.total === 1, `total=${search.data?.total}`);

  const statusFilter = await req('/api/products?status=active', 'GET', undefined, authA);
  ok('status filter active (2)', statusFilter.data?.total === 2, `total=${statusFilter.data?.total}`);

  const catFilter = await req(`/api/products?category=${cat.id}`, 'GET', undefined, authA);
  ok('category filter (2)', catFilter.data?.total === 2, `total=${catFilter.data?.total}`);

  const stockFilter = await req('/api/products?stock=out', 'GET', undefined, authA);
  ok('stock filter out-of-stock (1)', stockFilter.data?.total === 1, `total=${stockFilter.data?.total}`);

  const stockLow = await req('/api/products?stock=low', 'GET', undefined, authA);
  ok('stock filter low (≤6) finds sandals or dress', stockLow.data?.total >= 1, `total=${stockLow.data?.total}`);

  const sortPriceAsc = await req('/api/products?sort=price_asc', 'GET', undefined, authA);
  ok('sort price asc first=8000', sortPriceAsc.data?.products?.[0]?.price === 8000, JSON.stringify(sortPriceAsc.data?.products?.[0]));

  // pagination: pageSize=2 → 2 pages, page 2 has 1
  const page1 = await req('/api/products?page=1&pageSize=2', 'GET', undefined, authA);
  const page2 = await req('/api/products?page=2&pageSize=2', 'GET', undefined, authA);
  ok('pagination totalPages=2', page1.data?.totalPages === 2, `totalPages=${page1.data?.totalPages}`);
  ok('page1 has 2 products', page1.data?.products?.length === 2, `len=${page1.data?.products?.length}`);
  ok('page2 has 1 product', page2.data?.products?.length === 1, `len=${page2.data?.products?.length}`);
  const page1Ids = new Set(page1.data?.products?.map((p) => p.id));
  ok('page2 does not repeat page1', !page2.data?.products?.some((p) => page1Ids.has(p.id)));

  console.log('\n5b. Product CRUD — update + status');
  const patchR = await req(`/api/products/${prod2.data.id}`, 'PATCH', { price: 14000, status: 'active' }, authA);
  ok('product updated', patchR.status === 200, `status=${patchR.status} ${JSON.stringify(patchR.data)}`);
  ok('updated price persisted', patchR.data?.price === 14000, `got=${patchR.data?.price}`);
  ok('updated product still keeps base stockQuantity=2', patchR.data?.stockQuantity === 2, `got=${patchR.data?.stockQuantity}`);

  const patchStockR = await req(`/api/products/${prod2b.data.id}`, 'PATCH', { stockQuantity: 20 }, authA);
  ok('base stockQuantity updated via PATCH', patchStockR.status === 200 && patchStockR.data?.stockQuantity === 20, `status=${patchStockR.status} got=${patchStockR.data?.stockQuantity}`);
  const fetchedStock = await req(`/api/products/${prod2b.data.id}`, 'GET', undefined, authA);
  ok('PATCHed base stock persisted and effectiveStock=20', fetchedStock.data?.stockQuantity === 20 && fetchedStock.data?.effectiveStock === 20, `got=${fetchedStock.data?.stockQuantity}/${fetchedStock.data?.effectiveStock}`);
  const stockOutAfterPatch = await req('/api/products?stock=out', 'GET', undefined, authA);
  ok('silky scarf (20) not counted as out of stock', !stockOutAfterPatch.data?.products?.some((p) => p.id === prod2b.data.id), `ids=${stockOutAfterPatch.data?.products?.map((p) => p.id).join(',')}`);

  const delR = await req(`/api/products/${prod2b.data.id}`, 'DELETE', undefined, authA);
  ok('product deleted', delR.status === 204, `status=${delR.status}`);
  const afterDel = await req('/api/products?sort=newest&pageSize=25', 'GET', undefined, authA);
  ok('product count after delete = 2', afterDel.data?.total === 2, `total=${afterDel.data?.total}`);

  console.log('\n6. Tenant isolation');
  const bizAProductsAsB = await req('/api/products?sort=newest&pageSize=100', 'GET', undefined, authB);
  ok('Business B sees 0 products from Business A', bizAProductsAsB.data?.total === 0, `total=${bizAProductsAsB.data?.total}`);
  const directFetchAsB = await req(`/api/products/${prod.id}`, 'GET', undefined, authB);
  ok('Business B cannot GET Business A product', directFetchAsB.status === 404, `status=${directFetchAsB.status}`);
  const catAsB = await req(`/api/categories/${cat.id}`, 'PATCH', { name: 'Hacked' }, authB);
  ok('Business B cannot PATCH Business A category', catAsB.status === 404, `status=${catAsB.status}`);
  const invAsB = await req('/api/inventory', 'POST', { productId: prod.id, changeQty: 5, reason: 'sneaky' }, authB);
  ok('Business B cannot adjust Business A stock', invAsB.status === 422, `status=${invAsB.status}`);

  const prodLimitR = await req('/api/products', 'POST', { name: 'Limit Test', price: 100 }, authA);
  ok('product limit not hit (create succeeds)', prodLimitR.status === 201, `status=${prodLimitR.status} ${JSON.stringify(prodLimitR.data)}`);

  // Cleanup (leave the two businesses as-is for manual inspection)
  await prisma.product.deleteMany({ where: { business: { name: 'Phase5 Mart A' } } });
  await prisma.category.deleteMany({ where: { business: { name: 'Phase5 Mart A' } } });
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: Object.values(EMAILS) } } } });
  await prisma.business.deleteMany({ where: { name: { in: ['Phase5 Mart A', 'Phase5 Mart B'] } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ALL PHASE 5 CHECKS PASSED =='));
  await prisma.$disconnect();
  if (failed) process.exit(1);
}

main().catch(async (e) => { console.error('crash', e); await prisma.$disconnect(); process.exit(1); });