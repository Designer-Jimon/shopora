// Phase 8 HTTP E2E — payment providers, webhook, manual confirm.
//
// Covers: connect/update/disconnect provider, secret encrypted at rest,
// payment-method gate on checkout page, checkout fallback when init fails,
// PATCH /api/orders/:id/status manual transition, idempotent paid handling,
// webhook HMAC signature check, webhook success → order paid + txn + history,
// webhook replay idempotency, bad-signature → 403, unknown ref → 200.

import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3200';
const EMAILS = { ownerA: 'p8-owner-a@shopora.dev' };
const BUSINESS_NAME = 'Phase8 Store';

const prisma = new PrismaClient();
let failed = false;
const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${label}`);
  else { console.error(`  FAIL  ${label}  ${extra}`); failed = true; }
};

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

async function register(email, businessName) {
  const r = await req('/api/auth/register', 'POST', {
    email, password: 'Phase8Pass123!', firstName: 'P', lastName: 'Eight', kind: 'business', businessName,
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

async function main() {
  console.log('== Phase 8 payments E2E ==\n');

  // ---------------------------------------------------------------
  // Cleanup prior run
  // ---------------------------------------------------------------
  console.log('1. Prepare test data');
  const staleBiz = await prisma.business.findMany({ where: { name: BUSINESS_NAME }, select: { id: true } });
  const staleIds = staleBiz.map((b) => b.id);
  if (staleIds.length > 0) {
    await prisma.orderItem.deleteMany({ where: { order: { businessId: { in: staleIds } } } });
    await prisma.orderStatusHistory.deleteMany({ where: { order: { businessId: { in: staleIds } } } });
    await prisma.order.deleteMany({ where: { businessId: { in: staleIds } } });
  }
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: Object.values(EMAILS) } } } });
  await prisma.business.deleteMany({ where: { name: BUSINESS_NAME } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });

  // ---------------------------------------------------------------
  // Register + onboard
  // ---------------------------------------------------------------
  const a = await register(EMAILS.ownerA, BUSINESS_NAME);
  ok('store registered', a.status === 201, `status=${a.status}`);
  const doneA = await completeOnboarding(a.cookie);
  ok('onboarding complete', doneA.ok, JSON.stringify(doneA));
  const slugA = doneA.slug;
  const authA = { cookie: a.cookie };

  // Resolve business id for direct DB checks.
  const business = await prisma.business.findUnique({ where: { slug: slugA }, select: { id: true, slug: true } });
  ok('business exists', !!business, 'missing');

  // ---------------------------------------------------------------
  // 2. Connect provider (fake key) — no secret in response
  // ---------------------------------------------------------------
  console.log('\n2. Connect Paystack provider');
  const connectRes = await req('/api/payments/providers', 'PUT', {
    provider: 'paystack',
    publicKey: 'pk_test_FAKE_PUBLIC_KEY',
    secretKey: 'sk_test_FAKE_SECRET_KEY_123456789',
  }, authA);
  ok('connect 200', connectRes.status === 200, `status=${connectRes.status} ${connectRes.text}`);
  ok('response contains provider + status', connectRes.data?.provider === 'paystack' && connectRes.data?.status === 'connected', JSON.stringify(connectRes.data));
  ok('response does NOT contain secret', connectRes.text.indexOf('sk_test_FAKE_SECRET_KEY') === -1, connectRes.text);
  ok('response contains publicKey', connectRes.data?.publicKey === 'pk_test_FAKE_PUBLIC_KEY', JSON.stringify(connectRes.data?.publicKey));

  // 3. Secret stored encrypted at rest
  console.log('\n3. Secret encrypted at rest');
  const secretRow = await prisma.paymentProviderSecret.findFirst({
    where: { provider: { businessId: business.id, provider: 'paystack' } },
    select: { encrypted: true, keyVersion: true },
  });
  ok('secret row exists', !!secretRow, 'missing');
  ok('encrypted does NOT contain plaintext', secretRow && secretRow.encrypted.indexOf('sk_test_FAKE_SECRET_KEY') === -1, 'plaintext leaked');
  ok('encrypted starts with version prefix', secretRow && secretRow.encrypted.startsWith('v1:'), secretRow?.encrypted?.slice(0, 20));
  ok('keyVersion = v1', secretRow?.keyVersion === 'v1', secretRow?.keyVersion);

  // 4. GET providers — no secret leaked
  console.log('\n4. GET providers safe shape');
  const listRes = await req('/api/payments/providers', 'GET', undefined, authA);
  ok('list 200', listRes.status === 200, `status=${listRes.status}`);
  ok('lists paystack connected', listRes.data?.length === 1 && listRes.data[0]?.status === 'connected', JSON.stringify(listRes.data));
  ok('list response no secret', listRes.text.indexOf('sk_test_FAKE_SECRET_KEY') === -1, 'secret in list response');

  // ---------------------------------------------------------------
  // 5. Checkout page shows Paystack option when connected
  // ---------------------------------------------------------------
  console.log('\n5. Checkout page shows Pay online when connected');
  const product = await prisma.product.create({
    data: { businessId: business.id, name: 'Phase8 Tee', price: 5000, status: 'active', stockQuantity: 10, slug: `phase8-tee-${Date.now()}` },
  });
  const addCart = await req(`/api/store/${slugA}/cart`, 'POST', { productId: product.id, quantity: 1 });
  ok('cart add 201', addCart.status === 201, `status=${addCart.status}`);
  const guestCookie = `shopora_cart_session=${(addCart.setCookie || '').match(/shopora_cart_session=([^;]*)/)?.[1] ?? ''}`;
  const checkoutPageConn = await req(`/${slugA}/checkout`, 'GET', undefined, { cookie: guestCookie });
  ok('checkout page 200', checkoutPageConn.status === 200, `status=${checkoutPageConn.status}`);
  // The payment picker only appears on the client-rendered Review step, so we
  // assert on the SSR summary note that mirrors the default payment method
  // (paystack when the gateway is connected).
  ok('checkout page assumes online payment when connected', checkoutPageConn.text.includes('secure checkout page'), 'missing paystack default note');

  // ---------------------------------------------------------------
  // 6. Checkout with paystack — init fails gracefully (no real key)
  // ---------------------------------------------------------------
  console.log('\n6. Checkout fallback when Paystack init fails');
  const checkoutPaystack = await req(`/api/store/${slugA}/checkout`, 'POST', {
    name: 'Ada Test', email: 'ada@test.com', phone: '+2348000000000',
    deliveryMethod: 'pickup', paymentMethod: 'paystack',
  }, { cookie: guestCookie });
  ok('checkout 201 (order placed even on init failure)', checkoutPaystack.status === 201, `status=${checkoutPaystack.status} ${checkoutPaystack.text}`);
  ok('paymentMethod = paystack', checkoutPaystack.data?.paymentMethod === 'paystack', JSON.stringify(checkoutPaystack.data?.paymentMethod));
  ok('NO authorizationUrl returned (init failed)', checkoutPaystack.data?.authorizationUrl === undefined || checkoutPaystack.data?.authorizationUrl === null, JSON.stringify(checkoutPaystack.data?.authorizationUrl));
  ok('paymentError returned (init failed)', typeof checkoutPaystack.data?.paymentError === 'string' && checkoutPaystack.data?.paymentError.length > 0, JSON.stringify(checkoutPaystack.data?.paymentError));
  const orderCheckoutId = checkoutPaystack.data?.orderId;
  const orderCheckout = await prisma.order.findUnique({ where: { id: orderCheckoutId } });
  ok('order payment_pending', orderCheckout?.status === 'payment_pending', orderCheckout?.status);
  ok('order paymentMethod paystack', orderCheckout?.paymentMethod === 'paystack', orderCheckout?.paymentMethod);

  // ---------------------------------------------------------------
  // 7. Checkout with bank_transfer (default fallback)
  // ---------------------------------------------------------------
  console.log('\n7. Checkout bank transfer fallback');
  const product2 = await prisma.product.create({
    data: { businessId: business.id, name: 'Phase8 Cap', price: 3000, status: 'active', stockQuantity: 10, slug: `phase8-cap-${Date.now()}` },
  });
  const addCart2 = await req(`/api/store/${slugA}/cart`, 'POST', { productId: product2.id, quantity: 1 });
  const guestCookie2 = `shopora_cart_session=${(addCart2.setCookie || '').match(/shopora_cart_session=([^;]*)/)?.[1] ?? ''}`;
  const checkoutBt = await req(`/api/store/${slugA}/checkout`, 'POST', {
    name: 'Bob Test', email: 'bob@test.com',
    deliveryMethod: 'pickup', paymentMethod: 'bank_transfer',
  }, { cookie: guestCookie2 });
  ok('checkout bank transfer 201', checkoutBt.status === 201, `status=${checkoutBt.status} ${checkoutBt.text}`);
  ok('paymentMethod bank_transfer', checkoutBt.data?.paymentMethod === 'bank_transfer', JSON.stringify(checkoutBt.data?.paymentMethod));
  const orderIdBt = checkoutBt.data?.orderId;
  ok('no authorizationUrl for bank_transfer', !checkoutBt.data?.authorizationUrl, JSON.stringify(checkoutBt.data?.authorizationUrl));
  ok('no paymentError for bank_transfer', checkoutBt.data?.paymentError === undefined, JSON.stringify(checkoutBt.data?.paymentError));

  // ---------------------------------------------------------------
  // 8. Manual status transitions + payment confirmation
  // ---------------------------------------------------------------
  console.log('\n8. Manual payment status transitions');

  // 8a. Bank transfer order → PATCH paid (manual confirm).
  const patchPaid = await req(`/api/orders/${orderIdBt}/status`, 'PATCH', { status: 'paid', note: 'Transfer received' }, authA);
  ok('PATCH paid 200', patchPaid.status === 200, `status=${patchPaid.status} ${patchPaid.text}`);
  const orderAfterPaid = await prisma.order.findUnique({ where: { id: orderIdBt } });
  ok('order now paid', orderAfterPaid?.status === 'paid', orderAfterPaid?.status);
  ok('paidAt stamped', !!orderAfterPaid?.paidAt, 'paidAt is null');
  ok('paid status history written', await prisma.orderStatusHistory.count({ where: { orderId: orderIdBt, status: 'paid' } }) === 1, 'missing');
  ok('manual Transaction row created', await prisma.transaction.count({ where: { businessId: business.id, orderId: orderIdBt, provider: 'manual', status: 'success' } }) === 1, 'missing');
  const manualTx = await prisma.transaction.findFirst({ where: { businessId: business.id, orderId: orderIdBt, provider: 'manual' } });
  ok('manual txn amount = order total', manualTx && Number(manualTx.amount) === Number(orderAfterPaid.total), `txn amount=${manualTx?.amount} total=${orderAfterPaid?.total}`);

  // 8b. Same-status PATCH → no side effects (returns ok).
  const patchPaidAgain = await req(`/api/orders/${orderIdBt}/status`, 'PATCH', { status: 'paid' }, authA);
  ok('repeated PATCH paid is idempotent 200', patchPaidAgain.status === 200, `status=${patchPaidAgain.status}`);
  ok('no extra manual txn rows', await prisma.transaction.count({ where: { businessId: business.id, orderId: orderIdBt, provider: 'manual', status: 'success' } }) === 1, 'extra manual txn');

  // 8c. Move to confirmed (already paid).
  const patchConfirmed = await req(`/api/orders/${orderIdBt}/status`, 'PATCH', { status: 'confirmed' }, authA);
  ok('PATCH confirmed 200', patchConfirmed.status === 200, `status=${patchConfirmed.status}`);
  const orderConfirmed = await prisma.order.findUnique({ where: { id: orderIdBt } });
  ok('order confirmed', orderConfirmed?.status === 'confirmed', orderConfirmed?.status);

  // 8d. Invalid status → 422.
  const patchInvalid = await req(`/api/orders/${orderIdBt}/status`, 'PATCH', { status: 'bogus' }, authA);
  ok('invalid status rejected', patchInvalid.status === 422, `status=${patchInvalid.status}`);

  // 8e. Unknown order → 404/422.
  const patchUnknown = await req('/api/orders/fake-0000000/status', 'PATCH', { status: 'paid' }, authA);
  ok('unknown order patch fails', patchUnknown.status === 404 || patchUnknown.status === 422, `status=${patchUnknown.status}`);

  // ---------------------------------------------------------------
  // 9. Webhook — setup + success + idempotency + bad sig + unknown ref
  // ---------------------------------------------------------------
  console.log('\n9. Paystack webhook tests');
  // We can't call the real Paystack API, so create a valid-looking
  // Transaction in the DB the way the checkout route would have done.
  const webhookOrder = await prisma.order.findUnique({ where: { id: orderCheckoutId } });
  ok('paystack order still payment_pending', webhookOrder?.status === 'payment_pending', webhookOrder?.status);
  const ref = `webhook-test-${Date.now()}`;
  await prisma.transaction.create({
    data: {
      businessId: business.id,
      orderId: orderCheckoutId,
      provider: 'paystack',
      providerRef: ref,
      amount: webhookOrder.total,
      status: 'initiated',
      type: 'payment',
    },
  });

  const secret = 'sk_test_FAKE_SECRET_KEY_123456789';
  const bodyPayload = JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: Number(webhookOrder.total) * 100 } });
  const goodSig = createHmac('sha512', secret).update(bodyPayload).digest('hex');

  const hookSuccess = await req('/api/webhooks/paystack', 'POST', bodyPayload, { 'x-paystack-signature': goodSig, 'Content-Type': 'text/plain' });
  ok('webhook success 200', hookSuccess.status === 200, `status=${hookSuccess.status} ${hookSuccess.text}`);
  const orderPaidHook = await prisma.order.findUnique({ where: { id: orderCheckoutId } });
  ok('order paid after charge.success', orderPaidHook?.status === 'paid', orderPaidHook?.status);
  ok('paidAt stamped', !!orderPaidHook?.paidAt, 'missing');
  ok('transaction flipped to success', await prisma.transaction.count({ where: { businessId: business.id, providerRef: ref, status: 'success' } }) === 1, 'missing');

  // Idempotency: replay same webhook → no extra rows / flips.
  const hookReplay = await req('/api/webhooks/paystack', 'POST', bodyPayload, { 'x-paystack-signature': goodSig, 'Content-Type': 'text/plain' });
  ok('replay webhook 200 (idempotent)', hookReplay.status === 200, `status=${hookReplay.status}`);
  ok('no duplicate orderStatusHistory rows for paid', await prisma.orderStatusHistory.count({ where: { orderId: orderCheckoutId, status: 'paid' } }) === 1, 'duplicate history');

  // Bad signature → 403.
  const badSig = createHmac('sha512', 'wrong_secret').update(bodyPayload).digest('hex');
  const hookBadSig = await req('/api/webhooks/paystack', 'POST', bodyPayload, { 'x-paystack-signature': badSig, 'Content-Type': 'text/plain' });
  ok('bad signature rejected 403', hookBadSig.status === 403, `status=${hookBadSig.status}`);

  // Unknown reference → 200 (paystack retries if 4xx).
  const unknownRef = `nonexistent-${Date.now()}`;
  const unknownBody = JSON.stringify({ event: 'charge.success', data: { reference: unknownRef, amount: 100000 } });
  const unknownSig = createHmac('sha512', secret).update(unknownBody).digest('hex');
  const hookUnknown = await req('/api/webhooks/paystack', 'POST', unknownBody, { 'x-paystack-signature': unknownSig, 'Content-Type': 'text/plain' });
  ok('unknown ref 200 (idempotent/soft-fail)', hookUnknown.status === 200, `status=${hookUnknown.status}`);
  ok('unknown ref handled safely', hookUnknown.data?.received === true, JSON.stringify(hookUnknown.data));

  // Malformed JSON → 400.
  const hookMalformed = await req('/api/webhooks/paystack', 'POST', 'not-json-at-all', { 'x-paystack-signature': 'x', 'Content-Type': 'text/plain' });
  ok('malformed webhook 400', hookMalformed.status === 400, `status=${hookMalformed.status}`);

  // Missing signature header → 403.
  const hookNoSig = await req('/api/webhooks/paystack', 'POST', bodyPayload, { 'Content-Type': 'text/plain' });
  ok('missing signature 403', hookNoSig.status === 403, `status=${hookNoSig.status}`);

  // ---------------------------------------------------------------
  // 10. Unauthorized access to provider API
  // ---------------------------------------------------------------
  console.log('\n10. Provider API auth gates');
  const noAuth = await req('/api/payments/providers', 'GET');
  ok('GET providers without auth 401', noAuth.status === 401, `status=${noAuth.status}`);

  // ---------------------------------------------------------------
  // 11. Checkout page hides Paystack after disconnect
  // ---------------------------------------------------------------
  console.log('\n11. Checkout page after disconnect');
  const disconnectRes = await req('/api/payments/providers', 'DELETE', { provider: 'paystack' }, authA);
  ok('disconnect 204', disconnectRes.status === 204, `status=${disconnectRes.status}`);
  // Re-fill the cart so the checkout page renders (empty cart → redirect to /cart).
  await req(`/api/store/${slugA}/cart`, 'POST', { productId: product.id, quantity: 1 }, { cookie: guestCookie });
  const checkoutPageNoPay = await req(`/${slugA}/checkout`, 'GET', undefined, { cookie: guestCookie });
  ok('checkout page falls back to transfer note when disconnected', checkoutPageNoPay.text.includes('Transfer details will be shown'), 'missing transfer default note');

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); })
  .finally(async () => {
    const staleBiz = await prisma.business.findMany({ where: { name: BUSINESS_NAME }, select: { id: true } });
    const staleIds = staleBiz.map((b) => b.id);
    if (staleIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { order: { businessId: { in: staleIds } } } });
      await prisma.orderStatusHistory.deleteMany({ where: { order: { businessId: { in: staleIds } } } });
      await prisma.order.deleteMany({ where: { businessId: { in: staleIds } } });
    }
    await prisma.businessStaff.deleteMany({ where: { user: { email: { in: Object.values(EMAILS) } } } });
    await prisma.business.deleteMany({ where: { name: BUSINESS_NAME } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
    await prisma.$disconnect();
  });