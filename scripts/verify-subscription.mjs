// Phase 9 HTTP E2E — subscription billing.
//
// Covers: lazy trial provisioning, plan catalogue, product limit from plan,
// staff seat limit via invite, calendar-driven status flips ON THE STOREFRONT
// (the second checkSubscription call site), storefront offline when cancelled,
// dashboard write-freeze when cancelled, checkout blocking when suspended,
// platform-key webhook activation (+ idempotency + bad signature), storefront
// coming back online after reactivation, tenant isolation.
//
// Run against a dev server started with SUBSCRIPTION_STATE_TTL_MS=0 so direct
// DB mutations are observed immediately.

import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3200';
const EMAILS = { ownerA: 'p9-owner-a@shopora.dev', ownerB: 'p9-owner-b@shopora.dev' };
const BUSINESS_NAME = 'Phase9 Store';
const BUSINESS_NAME_B = 'Phase9 Store B';

const prisma = new PrismaClient();
let failed = false;
const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${label}`);
  else { console.error(`  FAIL  ${label}  ${extra}`); failed = true; }
};

function envValue(name, fallback = '') {
  for (const file of ['.env.local', '.env']) {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', file);
    if (!existsSync(path)) continue;
    const found = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.startsWith(name + '='));
    if (found) return found.slice(name.length + 1).replace(/^["']|["']$/g, '');
  }
  return fallback;
}

async function req(path, method = 'GET', body, headers = {}) {
  const isStringBody = typeof body === 'string';
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body != null ? (isStringBody ? body : JSON.stringify(body)) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text, location: res.headers.get('location'), setCookie: res.headers.get('set-cookie') };
}

function accessCookie(setCookie) {
  const m = (setCookie || '').match(/shopora_session=([^;]*)/);
  return m ? `shopora_session=${m[1]}` : '';
}

function cartCookie(setCookie) {
  const m = (setCookie || '').match(/shopora_cart_session=([^;]*)/);
  return `shopora_cart_session=${m ? m[1] : ''}`;
}

async function register(email, businessName) {
  const r = await req('/api/auth/register', 'POST', {
    email, password: 'Phase9Pass123!', firstName: 'P', lastName: 'Nine', kind: 'business', businessName,
  });
  return { status: r.status, cookie: accessCookie(r.setCookie) };
}

async function completeOnboarding(cookie) {
  const auth = { cookie };
  let r = await req('/api/businesses/me', 'PATCH', { step: 2, category: 'Fashion' }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step2', status: r.status };
  const me = await req('/api/businesses/me', 'GET', undefined, auth);
  r = await req('/api/businesses/me', 'PATCH', { step: 3, slug: me.data.slug }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step3', status: r.status, slug: me.data.slug };
  r = await req('/api/businesses/me', 'PATCH', { step: 4, brandColor: '#123456' }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step4', status: r.status };
  r = await req('/api/businesses/complete', 'POST', undefined, auth);
  if (r.status !== 200) return { ok: false, stage: 'complete', status: r.status };
  const final = await req('/api/businesses/me', 'GET', undefined, auth);
  return { ok: true, slug: final.data.slug };
}

async function cleanup() {
  const bizIds = await prisma.business.findMany({ where: { name: { in: [BUSINESS_NAME, BUSINESS_NAME_B] } }, select: { id: true } });
  const ids = bizIds.map((b) => b.id);
  if (ids.length > 0) {
    await prisma.orderItem.deleteMany({ where: { order: { businessId: { in: ids } } } });
    await prisma.orderStatusHistory.deleteMany({ where: { order: { businessId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { businessId: { in: ids } } });
  }
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: Object.values(EMAILS) } } } });
  await prisma.business.deleteMany({ where: { name: { in: [BUSINESS_NAME, BUSINESS_NAME_B] } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.subscriptionPlan.deleteMany({ where: { name: { startsWith: 'p9-micro' } } });
}

async function createTempPlan(productLimit, staffLimit) {
  const name = `p9-micro-${Date.now()}`;
  await prisma.subscriptionPlan.create({
    data: {
      name,
      displayName: 'P9 Micro',
      description: 'test plan',
      monthlyPriceNaira: 100,
      annualPriceNaira: 1000,
      productLimit,
      staffLimit,
      customDomain: false,
      analyticsTier: 'basic',
      isActive: true,
      sortOrder: 99,
    },
  });
  return name;
}

async function main() {
  console.log('== Phase 9 subscription E2E ==\n');
  await cleanup();

  // 1. Register + onboard business A
  console.log('1. Register + onboard business A');
  const a = await register(EMAILS.ownerA, BUSINESS_NAME);
  ok('store registered', a.status === 201, `status=${a.status}`);
  const doneA = await completeOnboarding(a.cookie);
  ok('onboarding complete', doneA.ok, JSON.stringify(doneA));
  const slugA = doneA.slug;
  const authA = { cookie: a.cookie };
  const businessA = await prisma.business.findUnique({ where: { slug: slugA }, select: { id: true, slug: true } });
  ok('business A exists', !!businessA, 'missing');
  const bizAId = businessA.id;

  // 2. Lazy trial provisioning (dashboard entry)
  console.log('\n2. Trial provisioned on first dashboard load');
  const subGet = await req('/api/subscription', 'GET', undefined, authA);
  ok('GET /api/subscription 200', subGet.status === 200, `status=${subGet.status} ${subGet.text}`);
  ok('status = trial', subGet.data?.status === 'trial', JSON.stringify(subGet.data?.status));
  ok('plan = starter', subGet.data?.planKey === 'starter', JSON.stringify(subGet.data?.planKey));
  ok('starter productLimit 50', subGet.data?.plans?.find((p) => p.key === 'starter')?.productLimit === 50, JSON.stringify(subGet.data?.plans));
  const trialRowA = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('subscription row exists', !!trialRowA, 'missing');
  ok('trial 14 days out', trialRowA?.trialEndsAt && trialRowA.trialEndsAt.getTime() > Date.now() + 13 * 86400_000, `trialEndsAt=${trialRowA?.trialEndsAt}`);
  ok('catalogue has 3 plans', (subGet.data?.plans?.length ?? 0) === 3, `n=${subGet.data?.plans?.length}`);
  ok('billing history has trial entry', await prisma.subscriptionHistory.count({ where: { subscription: { businessId: bizAId }, toStatus: 'trial' } }) >= 1, 'missing');

  // 3. Product limit enforced from the plan
  console.log('\n3. Product limit from plan (temp plan productLimit=3)');
  const tempPlan = await createTempPlan(3, 2);
  await prisma.subscription.update({ where: { businessId: bizAId }, data: { planId: (await prisma.subscriptionPlan.findUnique({ where: { name: tempPlan } })).id } });
  for (let i = 1; i <= 3; i++) {
    const r = await req('/api/products', 'POST', { name: `P9 Product ${i}`, price: 1000 + i }, authA);
    ok(`product ${i} created`, r.status === 201, `status=${r.status} ${r.text}`);
  }
  const product4 = await req('/api/products', 'POST', { name: 'P9 Product 4', price: 4000 }, authA);
  ok('4th product rejected 403', product4.status === 403, `status=${product4.status} ${product4.text}`);
  ok('rejection mentions limit', product4.text.includes('Product limit reached'), product4.text);

  // 4. Staff seat limit via invite (temp plan staffLimit=2)
  console.log('\n4. Staff seat limit');
  const inv1 = await req('/api/staff', 'POST', { email: 'p9-staff1@shopora.dev', firstName: 'St', lastName: 'One' }, authA);
  ok('staff 1 invited 201', inv1.status === 201, `status=${inv1.status} ${inv1.text}`);
  ok('temporary password returned once', typeof inv1.data?.temporaryPassword === 'string' && inv1.data.temporaryPassword.length > 0, JSON.stringify(inv1.data?.temporaryPassword));
  const invDup = await req('/api/staff', 'POST', { email: 'p9-staff1@shopora.dev', firstName: 'St', lastName: 'One' }, authA);
  ok('duplicate staff 409', invDup.status === 409, `status=${invDup.status} ${invDup.text}`);
  const inv2 = await req('/api/staff', 'POST', { email: 'p9-staff2@shopora.dev', firstName: 'St', lastName: 'Two' }, authA);
  ok('staff 2 invited 201', inv2.status === 201, `status=${inv2.status} ${inv2.text}`);
  const inv3 = await req('/api/staff', 'POST', { email: 'p9-staff3@shopora.dev', firstName: 'St', lastName: 'Three' }, authA);
  ok('3rd staff rejected 403', inv3.status === 403, `status=${inv3.status} ${inv3.text}`);
  ok('rejection mentions staff limit', inv3.text.includes('Staff limit reached'), inv3.text);

  // 5. Calendar-driven flips driven by the STOREFRONT layout (second call site)
  console.log('\n5. Storefront-driven status transitions');
  const now = new Date();
  const past = new Date(Date.now() - 86400_000 * 40);

  const homeTrial = await req(`/${slugA}`, 'GET');
  ok('storefront live during trial', homeTrial.status === 200, `status=${homeTrial.status}`);

  // trial → past_due (grace): trialEndsAt in the past.
  await prisma.subscription.update({ where: { businessId: bizAId }, data: { trialEndsAt: past, currentPeriodEnd: past } });
  const homePastDue = await req(`/${slugA}`, 'GET');
  ok('storefront still live (past_due grace)', homePastDue.status === 200, `status=${homePastDue.status}`);
  const subAfterTrialEnd = await prisma.subscription.findUnique({ where: { businessId: bizAId }, select: { status: true } });
  ok('trial flipped to past_due by storefront hit', subAfterTrialEnd?.status === 'past_due', subAfterTrialEnd?.status);

  // past_due: checkout allowed.
  const productA = await prisma.product.create({
    data: { businessId: bizAId, name: 'P9 Cart Tee', price: 5000, status: 'active', stockQuantity: 10, slug: `p9-cart-tee-${Date.now()}` },
  });
  const addCart = await req(`/api/store/${slugA}/cart`, 'POST', { productId: productA.id, quantity: 1 });
  ok('cart add during past_due 201', addCart.status === 201, `status=${addCart.status}`);
  const guestCookie = cartCookie(addCart.setCookie);
  const checkoutPastDue = await req(`/api/store/${slugA}/checkout`, 'POST', {
    name: 'Ada P9', email: 'ada-p9@test.com', deliveryMethod: 'pickup', paymentMethod: 'bank_transfer',
  }, { cookie: guestCookie });
  ok('checkout allowed during past_due', checkoutPastDue.status === 201, `status=${checkoutPastDue.status} ${checkoutPastDue.text}`);
  const checkoutOrderId = checkoutPastDue.data?.orderId;
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: checkoutOrderId } });
  await prisma.orderItem.deleteMany({ where: { orderId: checkoutOrderId } });
  await prisma.order.delete({ where: { id: checkoutOrderId } });

  // past_due → suspended (grace over).
  await prisma.subscription.update({ where: { businessId: bizAId }, data: { currentPeriodEnd: past } });
  const homeSuspended = await req(`/${slugA}`, 'GET');
  ok('storefront still viewable (suspended)', homeSuspended.status === 200, `status=${homeSuspended.status}`);
  const subSuspended = await prisma.subscription.findUnique({ where: { businessId: bizAId }, select: { status: true } });
  ok('flipped to suspended', subSuspended?.status === 'suspended', subSuspended?.status);

  const checkoutSuspended = await req(`/api/store/${slugA}/checkout`, 'POST', {
    name: 'Ada P9', email: 'ada-p9@test.com', deliveryMethod: 'pickup', paymentMethod: 'bank_transfer',
  }, { cookie: guestCookie });
  ok('checkout blocked 423 when suspended', checkoutSuspended.status === 423, `status=${checkoutSuspended.status} ${checkoutSuspended.text}`);
  await req(`/api/store/${slugA}/cart`, 'POST', { productId: productA.id, quantity: 1 }, { cookie: guestCookie });
  const checkoutPageSusp = await req(`/${slugA}/checkout`, 'GET', undefined, { cookie: guestCookie });
  ok('checkout page shows paused banner', checkoutPageSusp.status === 200 && (checkoutPageSusp.text.includes('not accepting orders') || checkoutPageSusp.text.includes('paused checkout')), `status=${checkoutPageSusp.status}`);

  // suspended → cancelled (suspension over).
  await prisma.subscription.update({ where: { businessId: bizAId }, data: { currentPeriodEnd: past } });
  const homeCancelled = await req(`/${slugA}`, 'GET');
  ok('storefront 404 when cancelled', homeCancelled.status === 404, `status=${homeCancelled.status}`);
  const subCancelled = await prisma.subscription.findUnique({ where: { businessId: bizAId }, select: { status: true, cancelledAt: true } });
  ok('flipped to cancelled', subCancelled?.status === 'cancelled', subCancelled?.status);
  ok('cancelledAt stamped', !!subCancelled?.cancelledAt, 'missing cancelledAt');
  const cancelPages = await req(`/${slugA}/products`, 'GET');
  ok('product listing 404 when cancelled', cancelPages.status === 404, `status=${cancelPages.status}`);
  const cancelCartReq = await req(`/api/store/${slugA}/cart`, 'POST', { productId: productA.id, quantity: 1 });
  ok('cart add 404 when cancelled', cancelCartReq.status === 404, `status=${cancelCartReq.status}`);
  const cancelCheckout = await req(`/api/store/${slugA}/checkout`, 'POST', { name: 'Ada', email: 'a@b.com', deliveryMethod: 'pickup' }, { cookie: guestCookie });
  ok('checkout 404 when cancelled', cancelCheckout.status === 404, `status=${cancelCheckout.status}`);

  // 6. Dashboard freeze when cancelled (read-only except subscription)
  console.log('\n6. Dashboard read-only when cancelled');
  const subRead = await req('/api/subscription', 'GET', undefined, authA);
  ok('GET /api/subscription still works', subRead.status === 200, `status=${subRead.status}`);
  ok('GET reports cancelled', subRead.data?.status === 'cancelled', JSON.stringify(subRead.data?.status));
  const orderPatch = await req('/api/orders/fake-000/status', 'PATCH', { status: 'paid' }, authA);
  ok('order status PATCH blocked 423', orderPatch.status === 423, `status=${orderPatch.status} ${orderPatch.text}`);
  const prodCreate = await req('/api/products', 'POST', { name: 'Blocked', price: 1 }, authA);
  ok('product create blocked 423', prodCreate.status === 423, `status=${prodCreate.status} ${prodCreate.text}`);
  const staffInvite = await req('/api/staff', 'POST', { email: 'p9-staff4@shopora.dev', firstName: 'S', lastName: 'F' }, authA);
  ok('staff invite blocked 423', staffInvite.status === 423, `status=${staffInvite.status} ${staffInvite.text}`);
  const subCheckoutNoBody = await req('/api/subscription', 'POST', {}, authA);
  ok('subscription checkout route exempt (400, not 423)', subCheckoutNoBody.status === 400, `status=${subCheckoutNoBody.status} ${subCheckoutNoBody.text}`);

  // 7. Webhook activation (platform key) — reactivates a cancelled store
  console.log('\n7. Subscription webhook activation');
  const platformSecret = envValue('PAYSTACK_SECRET_KEY', 'sk_test_FAKE_PLATFORM_SUB_KEY_123456789');
  const ref = `SP-SUB-webhook-${Date.now()}`;
  await prisma.transaction.create({
    data: {
      businessId: bizAId,
      orderId: null,
      provider: 'paystack',
      providerRef: ref,
      amount: 15000,
      status: 'initiated',
      type: 'subscription',
    },
  });
  const subPayload = JSON.stringify({
    event: 'charge.success',
    data: {
      reference: ref,
      amount: 15000 * 100,
      customer: { customer_code: 'CUS_p9test' },
      authorization: { authorization_code: 'AUTH_p9test_123' },
    },
  });
  const goodSig = createHmac('sha512', platformSecret).update(subPayload).digest('hex');
  const hook = await req('/api/webhooks/paystack', 'POST', subPayload, { 'x-paystack-signature': goodSig, 'Content-Type': 'text/plain' });
  ok('subscription webhook 200', hook.status === 200, `status=${hook.status} ${hook.text}`);
  const subActive = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('subscription reactivated → active', subActive?.status === 'active', subActive?.status);
  ok('authorization code stored', subActive?.paystackAuthorizationCode === 'AUTH_p9test_123', JSON.stringify(subActive?.paystackAuthorizationCode));
  ok('customer code stored', subActive?.paystackCustomerCode === 'CUS_p9test', JSON.stringify(subActive?.paystackCustomerCode));
  ok('period extended past now', subActive && subActive.currentPeriodEnd > now, `currentPeriodEnd=${subActive?.currentPeriodEnd}`);
  ok('txn flipped to success', await prisma.transaction.count({ where: { businessId: bizAId, providerRef: ref, status: 'success' } }) === 1, 'missing');
  ok('active history entry written', await prisma.subscriptionHistory.count({ where: { subscription: { businessId: bizAId }, toStatus: 'active' } }) >= 1, 'missing');

  const hookReplay = await req('/api/webhooks/paystack', 'POST', subPayload, { 'x-paystack-signature': goodSig, 'Content-Type': 'text/plain' });
  ok('replay idempotent 200', hookReplay.status === 200, `status=${hookReplay.status}`);
  ok('no duplicate active history', await prisma.subscriptionHistory.count({ where: { subscription: { businessId: bizAId }, toStatus: 'active' } }) === 1, 'duplicate history');

  const badSig = createHmac('sha512', 'wrong_secret').update(subPayload).digest('hex');
  const hookBad = await req('/api/webhooks/paystack', 'POST', subPayload, { 'x-paystack-signature': badSig, 'Content-Type': 'text/plain' });
  ok('bad signature rejected 403', hookBad.status === 403, `status=${hookBad.status}`);

  const homeReactive = await req(`/${slugA}`, 'GET');
  ok('storefront back online after reactivation', homeReactive.status === 200, `status=${homeReactive.status}`);

  // 8. Tenant isolation + storefront-only provisioning (business B never hits the dashboard)
  console.log('\n8. Tenant isolation + storefront-only provisioning');
  const b = await register(EMAILS.ownerB, BUSINESS_NAME_B);
  ok('store B registered', b.status === 201, `status=${b.status}`);
  const doneB = await completeOnboarding(b.cookie);
  ok('onboarding B complete', doneB.ok, JSON.stringify(doneB));
  const slugB = doneB.slug;
  const authB = { cookie: b.cookie };
  const businessB = await prisma.business.findUnique({ where: { slug: slugB }, select: { id: true } });
  const homeB = await req(`/${slugB}`, 'GET');
  ok('storefront B live', homeB.status === 200, `status=${homeB.status}`);
  const subRowB = await prisma.subscription.findUnique({ where: { businessId: businessB.id }, select: { status: true, businessId: true } });
  ok('storefront hit provisioned B a trial', subRowB?.status === 'trial', JSON.stringify(subRowB));
  ok('B has own subscription (isolated)', subRowB?.businessId === businessB.id, JSON.stringify(subRowB?.businessId));
  const subGetB = await req('/api/subscription', 'GET', undefined, authB);
  ok('B GET subscription = its own trial', subGetB.data?.status === 'trial' && subGetB.data?.planKey === 'starter', JSON.stringify(subGetB.data));
  ok('A cannot see B through B session', subGetB.data?.usage !== undefined, 'missing usage');

  console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });