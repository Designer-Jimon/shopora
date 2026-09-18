// Post-Phase-7 fix E2E — dashboard order detail view (customer + delivery info).
// Places a real order as a guest customer with full contact + address, then
// confirms the business owner sees it all on the detail page and that a
// DIFFERENT business cannot see it (tenant scoping).

import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE || 'http://localhost:3200';
const prisma = new PrismaClient();
let failed = false;
const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${label}`);
  else {
    console.error(`  FAIL  ${label}  ${extra}`);
    failed = true;
  }
};

async function req(path, method = 'GET', body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, text, location: res.headers.get('location'), setCookie: res.headers.get('set-cookie') };
}

function accessCookie(setCookie) {
  const m = (setCookie || '').match(/shopora_session=([^;]*)/);
  return m ? `shopora_session=${m[1]}` : '';
}

function cartCookie(setCookie) {
  const m = (setCookie || '').match(/shopora_cart_session=([^;]*)/);
  return m ? `shopora_cart_session=${m[1]}` : '';
}

async function register(email, businessName) {
  const r = await req('/api/auth/register', 'POST', {
    email,
    password: 'OrderDetail123!',
    firstName: 'Owner',
    lastName: 'One',
    kind: 'business',
    businessName,
  });
  return { status: r.status, cookie: accessCookie(r.setCookie) };
}

async function login(email) {
  const r = await req('/api/auth/login', 'POST', { email, password: 'OrderDetail123!' });
  return accessCookie(r.setCookie);
}

async function main() {
  console.log('== Dashboard order detail (customer + delivery info) ==\n');
  const suffix = Date.now();
  const EMAIL_A = `odetail-owner-a-${suffix}@shopora.dev`;
  const EMAIL_B = `odetail-owner-b-${suffix}@shopora.dev`;
  const BUS_A = `ODetail Store A ${suffix}`;
  const BUS_B = `ODetail Store B ${suffix}`;

  console.log('1. Prepare data (two businesses + products)');
  const a = await register(EMAIL_A, BUS_A);
  ok('store A registered', a.status === 201, `status=${a.status}`);
  const b = await register(EMAIL_B, BUS_B);
  ok('store B registered', b.status === 201, `status=${b.status}`);

  // Onboard both stores, preserving the soft-matching slug the wizard chose.
  const slugOf = async (cookie, cat, color, name) => {
    await req('/api/businesses/me', 'PATCH', { step: 2, name, category: cat }, { cookie });
    const me = await req('/api/businesses/me', 'GET', undefined, { cookie });
    await req('/api/businesses/me', 'PATCH', { step: 3, slug: me.data.slug }, { cookie });
    await req('/api/businesses/me', 'PATCH', { step: 4, brandColor: color }, { cookie });
    const done = await req('/api/businesses/complete', 'POST', undefined, { cookie });
    return done.status === 200 ? me.data.slug : null;
  };
  const slugA = await slugOf(a.cookie, 'Groceries', '#722F37', BUS_A);
  const slugB = await slugOf(b.cookie, 'Fashion', '#0d9488', BUS_B);
  ok('store A onboarding complete', !!slugA, 'slug missing');
  ok('store B onboarding complete', !!slugB, 'slug missing');

  const authA = { cookie: a.cookie };
  const authB = { cookie: b.cookie };
  const prodA = await req('/api/products', 'POST', { name: 'OrderDetail Tee', price: 8000, status: 'active', stockQuantity: 10 }, authA);
  ok('store A product created', prodA.status === 201, `${prodA.status} ${prodA.text}`);
  await req('/api/products', 'POST', { name: 'OrderDetail Dress', price: 4000, status: 'active', stockQuantity: 5 }, authB);
  const productAId = prodA.data?.id;

  console.log('\n2. Place an order as a guest customer (with phone + delivery address)');
  const add = await req(`/api/store/${slugA}/cart`, 'POST', { productId: productAId, quantity: 2 });
  const guestCookie = cartCookie(add.setCookie);
  ok('cart add 201', add.status === 201, `status=${add.status}`);
  const checkout = await req(`/api/store/${slugA}/checkout`, 'POST', {
    name: 'Ada Demo Customer',
    email: 'ada.demo@example.com',
    phone: '+2348012345678',
    deliveryMethod: 'standard',
    deliveryAddress: { state: 'Lagos', city: 'Ikoyi', address: '12 Bourdillon Rd', landmark: 'Near Club' },
    notes: 'Leave with security',
  }, { cookie: guestCookie });
  ok('checkout 201', checkout.status === 201, `${checkout.status} ${checkout.text}`);
  const orderId = checkout.data?.orderId ?? '';
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  ok('order persisted with customer + address', !!order && order.customerName === 'Ada Demo Customer' && order.customerPhone === '+2348012345678' && order.deliveryAddress?.address === '12 Bourdillon Rd', JSON.stringify(order));
  const orderNum = order?.orderNumber ?? '';
  const total = Number(order?.total ?? 0); // 8000*2 + 1500 = 17500

  console.log('\n3. Owner A sees full detail on the order page');
  const loginA = await login(EMAIL_A);
  const detailA = await req(`/sales/orders/${orderId}`, 'GET', undefined, { cookie: loginA });
  ok('detail page 200 for owner A', detailA.status === 200, `status=${detailA.status}`);
  const html = detailA.text.replace(/<!-- -->/g, ''); // React SSR comment separators
  ok('order number shown', html.includes(`#${orderNum}`), 'missing', html.slice(0, 200));
  ok('customer name shown', html.includes('Ada Demo Customer'), 'missing');
  ok('customer email shown', html.includes('ada.demo@example.com'), 'missing');
  ok('customer phone shown', html.includes('+2348012345678'), 'missing');
  ok('delivery method shown', html.includes('Standard Delivery'), 'missing');
  ok('delivery fee shown', html.includes('1,500'), 'missing');
  ok('delivery address shown', html.includes('12 Bourdillon Rd') && html.includes('Ikoyi') && html.includes('Lagos'), 'missing');
  ok('landmark shown', html.includes('Near Club'), 'missing');
  ok('order notes shown', html.includes('Leave with security'), 'missing');
  ok('items with qty + price shown', html.includes('2 × OrderDetail Tee') && html.includes('16,000'), 'missing');
  ok('subtotal/total shown', html.includes('Subtotal') && html.includes('17,500'), 'missing');
  ok('status label shown', html.includes('Awaiting payment'), 'missing');
  ok('status history shown', html.includes('Status history') && html.includes('Order placed — awaiting payment'), 'missing');

  console.log('\n4. Tenant scoping — owner B cannot see the order');
  const loginB = await login(EMAIL_B);
  const detailB = await req(`/sales/orders/${orderId}`, 'GET', undefined, { cookie: loginB });
  ok('owner B detail → 404', detailB.status === 404, `status=${detailB.status}`);
  const listB = await req('/sales/orders', 'GET', undefined, { cookie: loginB });
  const htmlB = listB.text.replace(/<!-- -->/g, '');
  ok('owner B order list does NOT contain order number', !htmlB.includes(`#${orderNum}`), 'leaked');
  ok('owner B order list does NOT contain customer name', !htmlB.includes('Ada Demo Customer'), 'leaked');

  console.log('\nCleanup');
  await prisma.cartItem.deleteMany({ where: { cart: { businessId: (await prisma.business.findFirst({ where: { name: BUS_A } }))?.id ?? 'x' } } });
  await prisma.cart.deleteMany({ where: { businessId: (await prisma.business.findFirst({ where: { name: BUS_A } }))?.id ?? 'x' } });
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: [EMAIL_A, EMAIL_B] } } } });
  await prisma.order.deleteMany({ where: { customerEmail: 'ada.demo@example.com' } });
  await prisma.business.deleteMany({ where: { name: { in: [BUS_A, BUS_B] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
  await prisma.$disconnect();

  if (failed) process.exit(1);
  console.log('\n== ALL ORDER DETAIL CHECKS PASSED ==');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});