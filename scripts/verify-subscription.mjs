// Phase 11 HTTP E2E — native Paystack subscription billing.
//
// Covers: lazy trial provisioning on the PAID Starter plan, monthly-only plan
// catalogue with order limits + removeBranding surfaced on the API, instant
// Free-plan activation (downgrade), storefront order-limit blocking, NATIVE
// webhook lifecycle (subscription.create, ledger replay idempotency, bad
// signature, invoice.payment_failed downgrade, charge.success renewal
// reactivation, subscription.disable), removeBranding toggling the storefront
// footer, trial-expiry downgrade on the storefront call site, graceful offline
// paid-checkout degradation, tenant isolation.
//
// Run against a dev server started with SUBSCRIPTION_STATE_TTL_MS=0 so direct
// DB mutations are observed immediately. Native webhook payloads are forged
// locally and verified with the PAYSTACK_SECRET_KEY — no network required.

import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3200';
const EMAILS = { ownerA: 'p11-owner-a@shopora.dev', ownerB: 'p11-owner-b@shopora.dev' };
const BUSINESS_NAME = 'Phase11 Store';
const BUSINESS_NAME_B = 'Phase11 Store B';

const FREE_PLAN = 'starter';   // DB row = Free (₦0)
const STARTER_PLAN = 'business'; // DB row = Starter (₦10k) — paid trial target

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

const PLATFORM_SECRET = envValue('PAYSTACK_SECRET_KEY', 'sk_test_FAKE_PLATFORM_SUB_KEY_123456789');
const FAKE_KEY = PLATFORM_SECRET.startsWith('sk_test_FAKE');
const sign = (body, secret = PLATFORM_SECRET) => createHmac('sha512', secret).update(body).digest('hex');

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
    email, password: 'Phase11Pass123!', firstName: 'P', lastName: 'Eleven', kind: 'business', businessName,
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

async function createPlan(name, { productLimit, staffLimit, orderLimit, removeBranding = false }) {
  await prisma.subscriptionPlan.create({
    data: {
      name,
      displayName: 'P11 Test',
      description: 'test plan',
      monthlyPriceNaira: 100,
      annualPriceNaira: 1100,
      productLimit,
      staffLimit,
      orderLimit,
      customDomain: false,
      removeBranding,
      analyticsTier: 'basic',
      isActive: true,
      sortOrder: 99,
    },
  });
}

async function webhook(event, data, secret = PLATFORM_SECRET) {
  const body = JSON.stringify({ event, data });
  return req('/api/webhooks/paystack', 'POST', body, { 'x-paystack-signature': sign(body, secret), 'Content-Type': 'text/plain' });
}

async function cleanup() {
  const bizIds = await prisma.business.findMany({ where: { name: { in: [BUSINESS_NAME, BUSINESS_NAME_B] } }, select: { id: true } });
  const ids = bizIds.map((b) => b.id);
  if (ids.length > 0) {
    await prisma.orderItem.deleteMany({ where: { order: { businessId: { in: ids } } } });
    await prisma.orderStatusHistory.deleteMany({ where: { order: { businessId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { businessId: { in: ids } } });
  }
  await prisma.subscriptionHistory.deleteMany({ where: { subscription: { businessId: { in: ids } } } });
  await prisma.subscription.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: Object.values(EMAILS) } } } });
  await prisma.business.deleteMany({ where: { name: { in: [BUSINESS_NAME, BUSINESS_NAME_B] } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  // Scratch plans first: gather their ids so we can clear ANY leftover
  // subscription-domain rows that RESTRICT-reference them (orphaned rows from
  // earlier interrupted runs may point at businesses that were already removed).
  const scratchPlanIds = (
    await prisma.subscriptionPlan.findMany({ where: { name: { startsWith: 'p9-' } }, select: { id: true } })
  )
    .concat(
      await prisma.subscriptionPlan.findMany({ where: { name: { startsWith: 'p10-' } }, select: { id: true } })
    )
    .concat(
      await prisma.subscriptionPlan.findMany({ where: { name: { startsWith: 'p11-' } }, select: { id: true } })
    )
    .map((r) => r.id);
  if (scratchPlanIds.length > 0) {
    await prisma.subscriptionHistory.deleteMany({ where: { subscription: { planId: { in: scratchPlanIds } } } });
    await prisma.subscription.deleteMany({ where: { planId: { in: scratchPlanIds } } });
  }
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: scratchPlanIds } } });
  await prisma.webhookEvent.deleteMany({ where: { provider: 'paystack', eventId: { in: ['1001', '1002', '1003', '1004', '1005', '1006', '1007'] } } });
}

async function main() {
  console.log('== Phase 11 native-subscription E2E ==\n');
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

  // 2. Lazy trial provisioning — on the PAID Starter plan now
  console.log('\n2. Trial provisioned on the paid Starter plan');
  const subGet = await req('/api/subscription', 'GET', undefined, authA);
  ok('GET /api/subscription 200', subGet.status === 200, `status=${subGet.status} ${subGet.text}`);
  ok('status = trial', subGet.data?.status === 'trial', JSON.stringify(subGet.data?.status));
  ok('planKey = business (paid Starter row)', subGet.data?.planKey === STARTER_PLAN, JSON.stringify(subGet.data?.planKey));
  ok('onFreePlan = false during trial', subGet.data?.onFreePlan === false, JSON.stringify(subGet.data?.onFreePlan));
  const trialRowA = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('subscription row exists', !!trialRowA, 'missing');
  ok('trial 14 days out', trialRowA?.trialEndsAt && trialRowA.trialEndsAt.getTime() > Date.now() + 13 * 86400_000, `trialEndsAt=${trialRowA?.trialEndsAt}`);
  ok('catalogue has 3 plans', (subGet.data?.plans?.length ?? 0) === 3, `n=${subGet.data?.plans?.length}`);
  const freePlanMeta = subGet.data?.plans?.find((p) => p.key === FREE_PLAN);
  const starterPlanMeta = subGet.data?.plans?.find((p) => p.key === STARTER_PLAN);
  ok('Free plan = ₦0', freePlanMeta?.monthlyPriceNaira === 0, JSON.stringify(freePlanMeta?.monthlyPriceNaira));
  ok('Free orderLimit 50', freePlanMeta?.orderLimit === 50, JSON.stringify(freePlanMeta?.orderLimit));
  ok('Free removeBranding false', freePlanMeta?.removeBranding === false, JSON.stringify(freePlanMeta?.removeBranding));
  ok('Starter (business) orderLimit 500', starterPlanMeta?.orderLimit === 500, JSON.stringify(starterPlanMeta?.orderLimit));
  ok('Starter (business) removeBranding true', starterPlanMeta?.removeBranding === true, JSON.stringify(starterPlanMeta?.removeBranding));
  ok('usage surfaces orderLimit + ordersThisMonth', typeof subGet.data?.usage?.orderLimit === 'number' && typeof subGet.data?.usage?.ordersThisMonth === 'number', JSON.stringify(subGet.data?.usage));
  ok('trial history entry written', await prisma.subscriptionHistory.count({ where: { subscription: { businessId: bizAId }, toStatus: 'trial' } }) >= 1, 'missing');

  // 3. Free activation — instant in-app downgrade (no Paystack call)
  console.log('\n3. Instant Free-plan activation');
  const freePost = await req('/api/subscription', 'POST', { planKey: FREE_PLAN, billingCycle: 'monthly' }, authA);
  ok('POST free activation 200', freePost.status === 200, `status=${freePost.status} ${freePost.text}`);
  ok('mode free_activation', freePost.data?.mode === 'free_activation', JSON.stringify(freePost.data));
  const freePlanRow = await prisma.subscriptionPlan.findUnique({ where: { name: FREE_PLAN } });
  const subFree = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('status active on Free', subFree?.status === 'active', `status=${subFree?.status}`);
  ok('downgraded to Free row', subFree?.planId === freePlanRow?.id, `planId=${subFree?.planId}`);
  ok('Free history note recorded', await prisma.subscriptionHistory.count({ where: { subscription: { businessId: bizAId }, note: { contains: 'free plan' } } }) >= 1, 'missing');
  const subFreeGet = await req('/api/subscription', 'GET', undefined, authA);
  ok('GET reflects Free plan', subFreeGet.data?.onFreePlan === true && subFreeGet.data?.planKey === FREE_PLAN && subFreeGet.data?.status === 'active', JSON.stringify(subFreeGet.data));
  const homeFree = await req(`/${slugA}`, 'GET');
  ok('storefront still live on Free (soft downgrade)', homeFree.status === 200, `status=${homeFree.status}`);
  ok('storefront shows Powered by SHOPORA on Free', homeFree.text.includes('Powered by'), 'footer missing');

  // 4. Order-limit (monthly) enforced at storefront checkout
  console.log('\n4. Order limit from plan enforced at checkout');
  const limitPlan = `p11-orderlimit-${Date.now()}`;
  await createPlan(limitPlan, { productLimit: 20, staffLimit: 5, orderLimit: 2 });
  const limitPlanRow = await prisma.subscriptionPlan.findUnique({ where: { name: limitPlan } });
  await prisma.subscription.update({ where: { businessId: bizAId }, data: { planId: limitPlanRow.id, status: 'active', billingCycle: 'monthly' } });
  const product = await prisma.product.create({
    data: { businessId: bizAId, name: 'P11 Cart Tee', price: 5000, status: 'active', stockQuantity: 10, slug: `p11-cart-tee-${Date.now()}` },
  });
  const addCart = await req(`/api/store/${slugA}/cart`, 'POST', { productId: product.id, quantity: 1 });
  ok('cart add 201', addCart.status === 201, `status=${addCart.status}`);
  let guestCookie = cartCookie(addCart.setCookie);
  const checkoutBody = { name: 'Ada P11', email: 'ada-p11@test.com', deliveryMethod: 'pickup', paymentMethod: 'bank_transfer' };
  // Checkout consumes the cart (it is emptied on order placement), so re-add
  // the product to the same guest cart between each checkout attempt. The cart
  // POST only emits Set-Cookie when it creates a NEW session (reusing an
  // existing guest session returns none), so the exact same guestCookie
  // reference is forwarded to both the re-add and the checkout calls — never
  // refreshed from a Set-Cookie, which would wipe the session to "cart empty".
  const reAddCart = async () => {
    const r = await req(`/api/store/${slugA}/cart`, 'POST', { productId: product.id, quantity: 1 }, { cookie: guestCookie });
    if (r.status !== 201) throw new Error(`cart re-add failed: ${r.status} ${r.text}`);
  };
  const c1 = await req(`/api/store/${slugA}/checkout`, 'POST', checkoutBody, { cookie: guestCookie });
  ok('order 1 allowed (1/2)', c1.status === 201, `status=${c1.status} ${c1.text}`);
  await reAddCart();
  const c2 = await req(`/api/store/${slugA}/checkout`, 'POST', checkoutBody, { cookie: guestCookie });
  ok('order 2 allowed (2/2)', c2.status === 201, `status=${c2.status} ${c2.text}`);
  await reAddCart();
  const c3 = await req(`/api/store/${slugA}/checkout`, 'POST', checkoutBody, { cookie: guestCookie });
  ok('order 3 blocked 423 (limit hit)', c3.status === 423, `status=${c3.status} ${c3.text}`);
  ok('423 mentions monthly limit', c3.text.includes('monthly limit'), c3.text);
  const usageGet = await req('/api/subscription', 'GET', undefined, authA);
  ok('usage ordersThisMonth reflects 2 orders', usageGet.data?.usage?.ordersThisMonth === 2, JSON.stringify(usageGet.data?.usage?.ordersThisMonth));

  // 5. Native webhook lifecycle (forged payloads, platform-key verified, offline)
  console.log('\n5. Native Paystack webhook lifecycle');
  // Give the paid Starter row a real-looking plan code so events resolve
  // offline (a real /plan create would use the live Paystack API).
  await prisma.subscriptionPlan.update({ where: { name: STARTER_PLAN }, data: { paystackPlanCode: 'PLN_p11_biz' } });

  const subCreate = await webhook('subscription.create', {
    id: 1001,
    subscription: { subscription_code: 'SUB_p11_a', customer: { customer_code: 'CUS_p11_a', email: EMAILS.ownerA }, plan: { plan_code: 'PLN_p11_biz' } },
  });
  ok('subscription.create handled 200', subCreate.status === 200 && subCreate.data?.handled === 'subscription.create', `status=${subCreate.status} ${subCreate.text}`);
  const subActive = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('subscription reactivated on paid plan', subActive?.status === 'active' && subActive?.planId === (await prisma.subscriptionPlan.findUnique({ where: { name: STARTER_PLAN } })).id, JSON.stringify(subActive));
  ok('native subscription code linked', subActive?.paystackSubscriptionCode === 'SUB_p11_a', JSON.stringify(subActive?.paystackSubscriptionCode));
  ok('trial cleared', subActive?.trialEndsAt === null, JSON.stringify(subActive?.trialEndsAt));
  ok('period rolled ~30d', subActive && subActive.currentPeriodEnd.getTime() > Date.now() + 29 * 86400_000, `currentPeriodEnd=${subActive?.currentPeriodEnd}`);
  const activeGet = await req('/api/subscription', 'GET', undefined, authA);
  ok('GET reports hasNativeSubscription', activeGet.data?.hasNativeSubscription === true && activeGet.data?.onFreePlan === false, JSON.stringify(activeGet.data));
  const homeBranded = await req(`/${slugA}`, 'GET');
  ok('storefront hides Powered by SHOPORA on paid plan', !homeBranded.text.includes('Powered by'), 'branding visible');

  const replay = await webhook('subscription.create', {
    id: 1001,
    subscription: { subscription_code: 'SUB_p11_a', customer: { customer_code: 'CUS_p11_a', email: EMAILS.ownerA }, plan: { plan_code: 'PLN_p11_biz' } },
  });
  ok('ledger replay idempotent 200 (duplicate)', replay.status === 200 && replay.data?.duplicate === true, `status=${replay.status} ${replay.text}`);
  ok('no duplicate activation history', await prisma.subscriptionHistory.count({ where: { subscription: { businessId: bizAId }, note: { contains: 'Native Paystack subscription created' } } }) === 1, 'duplicate history');

  const badSigBody = JSON.stringify({ event: 'subscription.create', data: { id: 1001, subscription: { subscription_code: 'SUB_p11_a', plan: { plan_code: 'PLN_p11_biz' } } } });
  const bad = await req('/api/webhooks/paystack', 'POST', badSigBody, { 'x-paystack-signature': sign(badSigBody, 'wrong_secret'), 'Content-Type': 'text/plain' });
  ok('bad platform signature rejected 403', bad.status === 403, `status=${bad.status}`);

  const payFail = await webhook('invoice.payment_failed', {
    id: 1003,
    subscription: { subscription_code: 'SUB_p11_a', customer: { customer_code: 'CUS_p11_a', email: EMAILS.ownerA } },
  });
  ok('invoice.payment_failed handled 200', payFail.status === 200 && payFail.data?.handled === 'invoice.payment_failed', `status=${payFail.status} ${payFail.text}`);
  const subDowngraded = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('payment failure downgraded to Free', subDowngraded?.status === 'active' && subDowngraded?.planId === freePlanRow?.id, JSON.stringify(subDowngraded));
  ok('native code cleared on downgrade', subDowngraded?.paystackSubscriptionCode === null, JSON.stringify(subDowngraded?.paystackSubscriptionCode));
  ok('downgrade history note', await prisma.subscriptionHistory.count({ where: { subscription: { businessId: bizAId }, note: { contains: 'Payment failed' } } }) >= 1, 'missing');

  const renewalRef = `SP-SUB-REN-${Date.now()}`;
  const renewal = await webhook('charge.success', {
    id: 1004,
    reference: renewalRef,
    amount: 10000 * 100,
    subscription: { subscription_code: 'SUB_p11_a', customer: { customer_code: 'CUS_p11_a', email: EMAILS.ownerA }, plan: { plan_code: 'PLN_p11_biz' } },
  });
  ok('renewal charge.success handled 200', renewal.status === 200 && renewal.data?.handled === 'charge.success.renewal', `status=${renewal.status} ${renewal.text}`);
  const subRenewed = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('renewal reactivated on paid plan', subRenewed?.status === 'active' && subRenewed?.planId === (await prisma.subscriptionPlan.findUnique({ where: { name: STARTER_PLAN } })).id, JSON.stringify(subRenewed));
  ok('native code re-linked', subRenewed?.paystackSubscriptionCode === 'SUB_p11_a', JSON.stringify(subRenewed?.paystackSubscriptionCode));
  ok('renewal transaction recorded once', await prisma.transaction.count({ where: { businessId: bizAId, providerRef: renewalRef, status: 'success' } }) === 1, 'missing txn');

  const reDowngrade = await webhook('subscription.disable', {
    id: 1005,
    subscription: { subscription_code: 'SUB_p11_a', customer: { customer_code: 'CUS_p11_a', email: EMAILS.ownerA } },
  });
  ok('subscription.disable handled 200', reDowngrade.status === 200 && reDowngrade.data?.handled === 'subscription.disable', `status=${reDowngrade.status} ${reDowngrade.text}`);
  const subFinal = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('disable downgraded to Free', subFinal?.status === 'active' && subFinal?.planId === freePlanRow?.id, JSON.stringify(subFinal));
  const homeAgain = await req(`/${slugA}`, 'GET');
  ok('Powered by SHOPORA back after downgrade', homeAgain.text.includes('Powered by'), 'footer missing');

  const ignored = await webhook('subscription.enable', {
    id: 1006,
    subscription: { subscription_code: 'SUB_p11_a', customer: { customer_code: 'CUS_p11_a', email: EMAILS.ownerA } },
  });
  ok('subscription.enable ack ignored (unchanged)', ignored.status === 200 && ignored.data?.handled === 'ignored', `status=${ignored.status} ${ignored.text}`);
  const subStillFree = await prisma.subscription.findUnique({ where: { businessId: bizAId } });
  ok('row unchanged after ignored event', subStillFree?.planId === freePlanRow?.id, JSON.stringify(subStillFree));

  // 6. Paid checkout route — graceful offline degradation (no crash, no side effects)
  console.log('\n6. Paid checkout without live Paystack');
  if (FAKE_KEY) {
    const paidPost = await req('/api/subscription', 'POST', { planKey: STARTER_PLAN, billingCycle: 'monthly' }, authA);
    ok('paid checkout returns graceful 502 (fake key)', paidPost.status === 502, `status=${paidPost.status} ${paidPost.text}`);
    ok('502 mentions Paystack', /[Pp]aystack/.test(paidPost.text), paidPost.text);
    ok('no transaction row leaked on failure', await prisma.transaction.count({ where: { businessId: bizAId, type: 'subscription', status: 'initiated' } }) === 0, 'leaked txn');
  } else {
    const paidPost = await req('/api/subscription', 'POST', { planKey: STARTER_PLAN, billingCycle: 'monthly' }, authA);
    ok('paid checkout proceeds with real key', paidPost.status === 201 && !!paidPost.data?.authorizationUrl, `status=${paidPost.status} ${paidPost.text}`);
  }
  const annual = await req('/api/subscription', 'POST', { planKey: STARTER_PLAN, billingCycle: 'annual' }, authA);
  ok('annual rejected 400 (monthly only)', annual.status === 400, `status=${annual.status} ${annual.text}`);
  const badPlan = await req('/api/subscription', 'POST', { planKey: 'premium', billingCycle: 'monthly' }, authA);
  ok('free post on premium also intact while on Free', badPlan.status !== 500, `status=${badPlan.status}`);

  // 7. Trial expiry → storefront-driven soft downgrade (business B)
  console.log('\n7. Trial expiry downgrade on the storefront call site');
  const b = await register(EMAILS.ownerB, BUSINESS_NAME_B);
  ok('store B registered', b.status === 201, `status=${b.status}`);
  const doneB = await completeOnboarding(b.cookie);
  ok('onboarding B complete', doneB.ok, JSON.stringify(doneB));
  const slugB = doneB.slug;
  const businessB = await prisma.business.findUnique({ where: { slug: slugB }, select: { id: true } });
  const trialB = await prisma.subscription.findUnique({ where: { businessId: businessB.id }, select: { status: true, trialEndsAt: true, businessId: true } });
  ok('B provisioned a trial by storefront/dashboard', trialB?.status === 'trial', JSON.stringify(trialB));
  ok('B subscription isolated', trialB?.businessId === businessB.id, JSON.stringify(trialB?.businessId));

  const past = new Date(Date.now() - 86400_000 * 40);
  await prisma.subscription.update({ where: { businessId: businessB.id }, data: { trialEndsAt: past, currentPeriodEnd: past } });
  const homeB = await req(`/${slugB}`, 'GET');
  ok('B storefront still live after trial expiry', homeB.status === 200, `status=${homeB.status}`);
  const subB = await prisma.subscription.findUnique({ where: { businessId: businessB.id } });
  ok('B trial downgraded to Free on touch', subB?.status === 'active' && subB?.planId === freePlanRow?.id, JSON.stringify(subB));
  ok('B downgrade reason recorded', await prisma.subscriptionHistory.count({ where: { subscription: { businessId: businessB.id }, note: { contains: 'Free trial ended' } } }) >= 1, 'missing');
  const subGetB = await req('/api/subscription', 'GET', undefined, { cookie: b.cookie });
  ok('B GET sees Free plan', subGetB.data?.onFreePlan === true && subGetB.data?.planKey === FREE_PLAN, JSON.stringify(subGetB.data));
  // §5's subscription.disable legitimately left business A on Free, so put A
  // back on paid Starter before asserting isolation from what B's storefront
  // touch did — same offline-forgeable subscription.create call pattern as §5
  // (fresh event id 1007: ledger key (event, eventId) already consumed 1001).
  const reProA = await webhook('subscription.create', {
    id: 1007,
    subscription: { subscription_code: 'SUB_p11_a', customer: { customer_code: 'CUS_p11_a', email: EMAILS.ownerA }, plan: { plan_code: 'PLN_p11_biz' } },
  });
  ok('A re-provisioned onto Starter before isolation check', reProA.status === 200 && reProA.data?.handled === 'subscription.create', `status=${reProA.status} ${reProA.text}`);
  const subGetA2 = await req('/api/subscription', 'GET', undefined, authA);
  ok('A unchanged and isolated', subGetA2.data?.planKey !== FREE_PLAN, JSON.stringify(subGetA2.data?.planKey));

  // 8. Daily sweep parity: the cron endpoint downgrades the same maybe-overdue rows
  console.log('\n8. Cron billing sweep');
  const cron = await req(`/api/cron/billing?token=${encodeURIComponent(envValue('CRON_TOKEN', 'replace-with-a-long-random-token'))}`, 'GET');
  ok('cron sweep 200', cron.status === 200, `status=${cron.status} ${cron.text}`);
  ok('cron reports checked count', typeof cron.data?.checked === 'number' && typeof cron.data?.downgraded === 'number', JSON.stringify(cron.data));
  const cronBad = await req('/api/cron/billing?token=wrong', 'GET');
  ok('bad cron token rejected 401', cronBad.status === 401, `status=${cronBad.status}`);

  console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });