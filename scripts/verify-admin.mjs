// Phase 10 HTTP E2E — Super Admin dashboard, audit-logged impersonation, and
// platform admins.
//
// Covers: business_user blocked from /admin + admin APIs, admin login renders
// the real platform metrics, subscriber suspend/reactivate (via the Phase 9
// Subscription row) + storefront 423, impersonation start (cookie + AuditLog),
// persistent banner + sensitive-route 403 while impersonating, admin APIs still
// reachable during impersonation, manual end (cookie cleared + audit row),
// platform.impersonate gating for scoped Platform Admins, expired token
// auto-expiry, plan create/conflict/archive, coupons, tickets, platform-admin
// grant, settings upsert/delete, audit-log viewer.
//
// Prereqs: run `npm run db:seed` and `npm run db:seed-admin` once first, then
// start the dev server with SUBSCRIPTION_STATE_TTL_MS=0 (so DB mutations are
// observed immediately). Run with `npm run test:admin`.

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { SignJWT } = await import('jose');
const { hash: argon2Hash } = await import('argon2');

const BASE = process.env.API_BASE || 'http://localhost:3200';

const EMAILS = {
  admin: 'admin.test@shopora.dev',
  admin2: 'admin2.test@shopora.dev', // Platform Admin role (scoped, NO impersonate)
  admin3: 'admin3.test@shopora.dev', // granted via the API
  owner: 'p10-owner@shopora.dev',
};
const ADMIN_PASSWORD = 'AdminTest123!';
const OWNER_PASSWORD = 'Phase10Pass123!';
const BUSINESS_NAME = 'Phase10 Store';
const UNIQUE = String(Date.now());

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
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body != null ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return {
    status: res.status, data, text,
    location: res.headers.get('location'),
    setCookie: res.headers.get('set-cookie'),
  };
}

function cookieParts(setCookie, name) {
  const m = (setCookie || '').match(new RegExp(`${name}=([^;]*)`));
  return m ? m[1] : '';
}

function sessionCookie(setCookie) {
  const v = cookieParts(setCookie, 'shopora_session');
  if (v) return `shopora_session=${v}`;
  const multi = [];
  const re = /shopora_session=[^;]*/g;
  let mm; while ((mm = re.exec(setCookie || ''))) multi.push(mm[0]);
  return multi.join('; ');
}

async function login(email, password) {
  const r = await req('/api/auth/login', 'POST', { email, password });
  return { status: r.status, cookie: sessionCookie(r.setCookie), text: r.text };
}

async function register(email, businessName) {
  const r = await req('/api/auth/register', 'POST', {
    email, password: OWNER_PASSWORD, firstName: 'P', lastName: 'Ten', kind: 'business', businessName,
  });
  return { status: r.status, cookie: sessionCookie(r.setCookie) };
}

async function completeOnboarding(cookie) {
  const auth = { cookie };
  let r = await req('/api/businesses/me', 'PATCH', { step: 2, category: 'Fashion' }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step2', status: r.status };
  const me = await req('/api/businesses/me', 'GET', undefined, auth);
  r = await req('/api/businesses/me', 'PATCH', { step: 3, slug: me.data.slug }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step3', status: r.status };
  r = await req('/api/businesses/me', 'PATCH', { step: 4, brandColor: '#123456' }, auth);
  if (r.status !== 200) return { ok: false, stage: 'step4', status: r.status };
  r = await req('/api/businesses/complete', 'POST', undefined, auth);
  if (r.status !== 200) return { ok: false, stage: 'complete', status: r.status };
  const final = await req('/api/businesses/me', 'GET', undefined, auth);
  return { ok: true, slug: final.data.slug };
}

async function ensureSuperAdminRole() {
  const role = await prisma.role.findUnique({ where: { name: 'Platform Super Admin' } });
  const platRole = await prisma.role.findUnique({ where: { name: 'Platform Admin' } });
  return { superRole: role, platformRole: platRole };
}

async function cleanup() {
  const biz = await prisma.business.findFirst({ where: { name: BUSINESS_NAME }, select: { id: true } });
  if (biz) {
    await prisma.orderItem.deleteMany({ where: { order: { businessId: biz.id } } });
    await prisma.orderStatusHistory.deleteMany({ where: { order: { businessId: biz.id } } });
    await prisma.subscriptionHistory.deleteMany({ where: { subscription: { businessId: biz.id } } });
    await prisma.subscription.deleteMany({ where: { businessId: biz.id } });
    await prisma.transaction.deleteMany({ where: { businessId: biz.id } });
    await prisma.auditLog.deleteMany({ where: { businessId: biz.id } });
    await prisma.businessStaff.deleteMany({ where: { businessId: biz.id } });
    await prisma.business.deleteMany({ where: { id: biz.id } });
  }
  await prisma.businessStaff.deleteMany({ where: { user: { email: EMAILS.owner } } });
  await prisma.user.deleteMany({ where: { email: EMAILS.owner } });

  await prisma.platformStaff.deleteMany({ where: { user: { email: { in: [EMAILS.admin2, EMAILS.admin3] } } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAILS.admin2, EMAILS.admin3] } } });

  await prisma.coupon.deleteMany({ where: { code: { startsWith: `A10-${UNIQUE}` } } });
  await prisma.platformSetting.deleteMany({ where: { key: { startsWith: 'a10-' } } });
  await prisma.supportTicket.deleteMany({ where: { subject: { contains: UNIQUE } } });
  await prisma.subscriptionPlan.deleteMany({ where: { name: { startsWith: `a10-plan-${UNIQUE}` } } });
  await prisma.auditLog.deleteMany({ where: { target: { contains: UNIQUE } } });
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: 'impersonate' }, business: { is: null } } });
}

function impersonationCookie(token) {
  return `shopora_impersonation=${token}`;
}

async function main() {
  console.log('== Phase 10 Super Admin E2E ==\n');
  await cleanup();
  const { superRole, platformRole } = await ensureSuperAdminRole();
  ok('platform roles exist', !!superRole && !!platformRole, JSON.stringify({ superRole, platformRole }));

  const adminUser = await prisma.user.findUnique({ where: { email: EMAILS.admin } });
  ok('super admin seeded (run db:seed-admin)', !!adminUser, 'missing admin.test@shopora.dev');
  if (!adminUser) { console.log('  — abort: seed the admin first'); process.exit(failed ? 1 : 0); }
  const adminStaff = await prisma.platformStaff.findFirst({
    where: { userId: adminUser.id, isActive: true },
    include: { role: true },
  });
  ok('super admin has active PlatformStaff membership', !!adminStaff, JSON.stringify(adminStaff));
  ok('super admin role is Super Admin', adminStaff?.role?.name === 'Platform Super Admin', JSON.stringify(adminStaff?.role?.name));
  const adminUserId = adminUser.id;

  // Scoped platform admin (Platform Admin role — no impersonate, no coupons)
  const admin2User = await prisma.user.upsert({
    where: { email: EMAILS.admin2 },
    update: { isActive: true, passwordHash: await argon2Hash('Admin2Pass123!') },
    create: { email: EMAILS.admin2, firstName: 'Admin', lastName: 'Two', passwordHash: await argon2Hash('Admin2Pass123!') },
  });
  await prisma.platformStaff.upsert({
    where: { userId_roleId: { userId: admin2User.id, roleId: platformRole.id } },
    update: { isActive: true },
    create: { userId: admin2User.id, roleId: platformRole.id, isActive: true },
  });
  ok('admin2 seeded with Platform Admin role', await prisma.platformStaff.count({
    where: { role: { name: 'Platform Admin' }, isActive: true },
  }) >= 1, 'missing');

  // 1. Business user cannot reach /admin
  console.log('\n1. business_user is locked out of /admin');
  const owner = await register(EMAILS.owner, BUSINESS_NAME);
  ok('owner registered', owner.status === 201, `status=${owner.status}`);
  const onboard = await completeOnboarding(owner.cookie);
  ok('owner onboarding complete', onboard.ok, JSON.stringify(onboard));
  const ownerAuth = { cookie: owner.cookie };
  const business = await prisma.business.findUnique({ where: { slug: onboard.slug }, select: { id: true, slug: true, name: true } });
  ok('business found', !!business, 'missing');
  const bizId = business.id;

  const adminPageAsOwner = await req('/admin', 'GET', undefined, ownerAuth);
  ok('GET /admin redirects owner away', [301, 302, 307, 308].includes(adminPageAsOwner.status), `status=${adminPageAsOwner.status} loc=${adminPageAsOwner.location}`);
  const metricsAsOwner = await req('/api/admin/metrics', 'GET', undefined, ownerAuth);
  ok('GET /api/admin/metrics 403 for owner', metricsAsOwner.status === 403, `status=${metricsAsOwner.status}`);
  const metricsNoAuth = await req('/api/admin/metrics', 'GET');
  ok('GET /api/admin/metrics 401 anonymous', metricsNoAuth.status === 401, `status=${metricsNoAuth.status}`);
  const impAsOwner = await req('/api/admin/impersonate', 'POST', { businessId: bizId }, ownerAuth);
  ok('POST /api/admin/impersonate 403 for owner', impAsOwner.status === 403, `status=${impAsOwner.status}`);

  // 2. Real platform metrics for the super admin
  console.log('\n2. Super admin sees real platform metrics');
  const adminLogin = await login(EMAILS.admin, ADMIN_PASSWORD);
  ok('super admin login works', adminLogin.status === 200, `status=${adminLogin.status} ${adminLogin.text}`);
  const adminAuth = { cookie: adminLogin.cookie };
  const adminPage = await req('/admin', 'GET', undefined, adminAuth);
  ok('GET /admin 200 for admin', adminPage.status === 200, `status=${adminPage.status}`);
  ok('/admin shows Super Admin chrome', adminPage.text.includes('Super Admin'), 'no chrome text');
  const metrics = await req('/api/admin/metrics', 'GET', undefined, adminAuth);
  ok('metrics 200', metrics.status === 200, `status=${metrics.status} ${metrics.text}`);
  ok('metrics real totals.businesses >= 1', (metrics.data?.totals?.businesses ?? 0) >= 1, JSON.stringify(metrics.data?.totals));
  ok('metrics subscriptionStatus object', !!metrics.data?.subscriptionStatus, JSON.stringify(metrics.data?.subscriptionStatus));
  const subsList = await req('/api/admin/subscribers', 'GET', undefined, adminAuth);
  ok('subscribers list 200', subsList.status === 200, `status=${subsList.status}`);
  ok('subscribers contains ours', (subsList.data?.businesses ?? []).some((b) => b.id === bizId), JSON.stringify(subsList.data?.businesses?.map((b) => b.id)));
  const subDetail = await req(`/api/admin/subscribers/${bizId}`, 'GET', undefined, adminAuth);
  ok('subscriber detail 200', subDetail.status === 200, `status=${subDetail.status}`);
  ok('detail has subscription', !!subDetail.data?.subscription, JSON.stringify(subDetail.data?.subscription));
  const subsAll = await req('/api/admin/subscriptions', 'GET', undefined, adminAuth);
  ok('subscriptions list 200', subsAll.status === 200, `status=${subsAll.status}`);
  const plansList = await req('/api/admin/subscriptions/plans', 'GET', undefined, adminAuth);
  ok('plans list 200 + catalog', plansList.status === 200 && (plansList.data?.plans ?? []).length >= 3, `status=${plansList.status} n=${plansList.data?.plans?.length}`);

  // 3. Suspend/reactivate through the Phase 9 Subscription row
  console.log('\n3. Suspend → storefront paused → reactivate');
  await req('/api/subscription', 'GET', undefined, ownerAuth); // provision trial row
  const sup = await prisma.subscription.findUnique({ where: { businessId: bizId } });
  ok('trial row provisioned', !!sup && sup.status === 'trial', JSON.stringify(sup?.status));

  // give the owner a product so checkout can be attempted
  const product = await prisma.product.create({
    data: {
      businessId: bizId,
      name: 'P10 Tee',
      price: 5000,
      slug: `p10-tee-${UNIQUE}`,
      status: 'active',
      stockQuantity: 10,
    },
  });
  const productId = product.id;

  const susp = await req(`/api/admin/subscribers/${bizId}/suspend`, 'POST', {}, adminAuth);
  ok('suspend 200', susp.status === 200, `status=${susp.status} ${susp.text}`);
  const subAfterSusp = await prisma.subscription.findUnique({ where: { businessId: bizId } });
  ok('subscription.status = suspended (same row as Phase 9)', subAfterSusp?.status === 'suspended', subAfterSusp?.status);
  ok('audit business.suspend written', await prisma.auditLog.count({ where: { businessId: bizId, action: 'business.suspend' } }) >= 1, 'missing');

  const cart = await req(`/api/store/${business.slug}/cart`, 'POST', { productId, quantity: 1 });
  const guestCookie = cartCookie(cart.setCookie);
  const co1 = await req(`/api/store/${business.slug}/checkout`, 'POST', {
    name: 'Ada P10', email: 'ada-p10@test.com', deliveryMethod: 'pickup', paymentMethod: 'bank_transfer',
  }, { cookie: guestCookie });
  ok('checkout blocked 423 while suspended', co1.status === 423, `status=${co1.status} ${co1.text}`);

  const react = await req(`/api/admin/subscribers/${bizId}/reactivate`, 'POST', {}, adminAuth);
  ok('reactivate 200', react.status === 200, `status=${react.status} ${react.text}`);
  const subAfterReact = await prisma.subscription.findUnique({ where: { businessId: bizId } });
  ok('subscription.active again', subAfterReact?.status === 'active', subAfterReact?.status);
  ok('audit business.reactivate written', await prisma.auditLog.count({ where: { businessId: bizId, action: 'business.reactivate' } }) >= 1, 'missing');

  // 4. Impersonation
  console.log('\n4. Impersonation (audited)');
  const start = await req('/api/admin/impersonate', 'POST', { businessId: bizId }, adminAuth);
  ok('impersonate start 200', start.status === 200, `status=${start.status} ${start.text}`);
  ok('impersonate sets shopora_impersonation cookie', cookieParts(start.setCookie, 'shopora_impersonation') !== '', `setCookie=${start.setCookie}`);
  const impToken = cookieParts(start.setCookie, 'shopora_impersonation');
  const startAudit = await prisma.auditLog.findFirst({ where: { actorUserId: adminUserId, businessId: bizId, action: 'impersonate.start' } });
  ok('AuditLog impersonate.start row', !!startAudit, 'missing endpoint audit row');
  const adminPlusImp = { cookie: `${adminAuth.cookie}; shopora_impersonation=${impToken}` };

  const dashImp = await req('/dashboard', 'GET', undefined, adminPlusImp);
  ok('GET /dashboard 200 while impersonating', dashImp.status === 200, `status=${dashImp.status} loc=${dashImp.location}`);
  ok('impersonation banner rendered', dashImp.text.includes('impersonating'), 'banner text missing');
  ok('dashboard shows the target business as owner chrome', dashImp.text.includes(business.name), 'business name missing from chrome');

  const mePatch = await req('/api/businesses/me', 'PATCH', { brandColor: '#000000' }, adminPlusImp);
  ok('sensitive businesses/me PATCH → 403 while impersonating', mePatch.status === 403 && mePatch.text.includes('Not available in an impersonated platform session'), `status=${mePatch.status} ${mePatch.text}`);
  const provPut = await req('/api/payments/providers', 'PUT', { provider: 'paystack', publicKey: 'pk_test_x', secretKey: 'sk_test_x' }, adminPlusImp);
  ok('sensitive payments/providers PUT → 403 while impersonating', provPut.status === 403, `status=${provPut.status}`);
  const meGet = await req('/api/businesses/me', 'GET', undefined, adminPlusImp);
  ok('read-only businesses/me allowed while impersonating', meGet.status === 200 && meGet.data?.slug === business.slug, `status=${meGet.status} ${meGet.text}`);

  const metricsWhileImp = await req('/api/admin/metrics', 'GET', undefined, adminPlusImp);
  ok('admin API metrics still 200 while impersonating', metricsWhileImp.status === 200, `status=${metricsWhileImp.status}`);

  const badBodyImp = await req('/api/admin/impersonate', 'POST', { businessId: 'does-not-exist' }, adminAuth);
  ok('impersonate unknown business 404', badBodyImp.status === 404, `status=${badBodyImp.status}`);

  // 5. End impersonation
  console.log('\n5. End impersonation');
  const endRes = await req('/api/admin/impersonate/end', 'POST', {}, adminPlusImp);
  ok('end 200', endRes.status === 200, `status=${endRes.status} ${endRes.text}`);
  ok('end clears cookie (max-age=0)', /shopora_impersonation=;.*max-age=0/i.test(endRes.setCookie || ''), `setCookie=${endRes.setCookie}`);
  const endAudit = await prisma.auditLog.findFirst({ where: { actorUserId: adminUserId, businessId: bizId, action: 'impersonate.end' } });
  ok('AuditLog impersonate.end row', !!endAudit, 'missing audit row');
  const dashBack = await req('/dashboard', 'GET', undefined, adminAuth);
  ok('dashboard after end redirects admin away (no business membership)', [301, 302, 307, 308].includes(dashBack.status), `status=${dashBack.status} loc=${dashBack.location}`);

  // 6. Auto-expiry
  console.log('\n6. Auto-expiry of the impersonation cookie');
  const secret = new TextEncoder().encode(envValue('JWT_ACCESS_SECRET', ''));
  const expired = await new SignJWT({ businessId: bizId, typ: 'impersonation' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminUserId)
    .setIssuer('shopora')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(secret);
  const dashExpired = await req('/dashboard', 'GET', undefined, { cookie: `${adminAuth.cookie}; ${impersonationCookie(expired)}` });
  ok('expired impersonation token → admin treated as normal (redirect away)', [301, 302, 307, 308].includes(dashExpired.status), `status=${dashExpired.status} loc=${dashExpired.location}`);

  // 7. plan manage (create / conflict / archive)
  console.log('\n7. Plan management');
  const planName = `a10-plan-${UNIQUE}`;
  const planCreate = await req('/api/admin/subscriptions/plans', 'POST', {
    name: planName, displayName: 'A10 Test', description: 'phase10', monthlyPriceNaira: 250, annualPriceNaira: 2500,
    productLimit: 5, staffLimit: 3, customDomain: false, analyticsTier: 'basic', sortOrder: 40,
  }, adminAuth);
  ok('plan create 201', planCreate.status === 201, `status=${planCreate.status} ${planCreate.text}`);
  const planDup = await req('/api/admin/subscriptions/plans', 'POST', {
    name: planName, displayName: 'Dup', monthlyPriceNaira: 1, annualPriceNaira: 1, productLimit: 1, staffLimit: 1,
  }, adminAuth);
  ok('duplicate plan 409', planDup.status === 409, `status=${planDup.status}`);
  const planId = planCreate.data?.id;
  const planDel = await req(`/api/admin/subscriptions/plans/${planId}`, 'DELETE', {}, adminAuth);
  ok('plan archive 200', planDel.status === 200, `status=${planDel.status} ${planDel.text}`);
  const archived = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  ok('plan actually archived (isActive=false)', archived && archived.isActive === false, JSON.stringify(archived?.isActive));
  ok('audit plan.archive written', await prisma.auditLog.count({ where: { action: 'plan.archive', target: planName } }) >= 1, 'missing');

  // 8. coupons
  console.log('\n8. Coupons');
  const couponCode = `A10-${UNIQUE}`;
  const couponCreate = await req('/api/admin/coupons', 'POST', { code: couponCode, kind: 'percentage', value: 10, maxUses: 5 }, adminAuth);
  ok('coupon create 201', couponCreate.status === 201, `status=${couponCreate.status} ${couponCreate.text}`);
  const couponsList = await req('/api/admin/coupons', 'GET', undefined, adminAuth);
  ok('coupon list has it', (couponsList.data?.coupons ?? []).some((c) => c.code === couponCode), JSON.stringify(couponsList.data?.coupons?.map((c) => c.code)));
  // scoped admin (no coupons/impersonate perms) blocked
  const admin2Login = await login(EMAILS.admin2, 'Admin2Pass123!');
  ok('admin2 login with password works', admin2Login.status === 200, `status=${admin2Login.status} ${admin2Login.text}`);
  const couponsAsAdmin2 = await req('/api/admin/coupons', 'GET', undefined, { cookie: admin2Login.cookie });
  ok('scoped admin2 blocked from coupons API 403', couponsAsAdmin2.status === 403, `status=${couponsAsAdmin2.status}`);
  const impAsAdmin2 = await req('/api/admin/impersonate', 'POST', { businessId: bizId }, { cookie: admin2Login.cookie });
  ok('scoped admin2 blocked from impersonate 403', impAsAdmin2.status === 403, `status=${impAsAdmin2.status}`);
  const admin2Page = await req('/admin', 'GET', undefined, { cookie: admin2Login.cookie });
  ok('scoped admin2 CAN reach /admin (platform.access)', admin2Page.status === 200, `status=${admin2Page.status}`);

  // 9. tickets
  console.log('\n9. Tickets');
  const ticketSubject = `A10 ticket ${UNIQUE}`;
  const tick = await req('/api/admin/tickets', 'POST', { subject: ticketSubject, body: 'Phase 10 ticket body', priority: 'high', businessId: bizId }, adminAuth);
  ok('ticket create 201', tick.status === 201, `status=${tick.status} ${tick.text}`);
  const ticketId = tick.data?.id;
  const tickUpdate = await req(`/api/admin/tickets/${ticketId}`, 'PATCH', { status: 'in_progress', priority: 'urgent' }, adminAuth);
  ok('ticket PATCH 200', tickUpdate.status === 200, `status=${tickUpdate.status} ${tickUpdate.text}`);
  const ticketsList = await req('/api/admin/tickets?status=in_progress', 'GET', undefined, adminAuth);
  ok('ticket list filter works', (ticketsList.data?.tickets ?? []).some((t) => t.id === ticketId && t.priority === 'urgent'), JSON.stringify(ticketsList.data?.tickets?.map((t) => t.id)));

  // 10. platform admins (grant via API)
  console.log('\n10. Platform admin management');
  const grant = await req('/api/admin/platform/admins', 'POST', {
    email: EMAILS.admin3, roleId: platformRole.id, firstName: 'Admin', lastName: 'Three',
  }, adminAuth);
  ok('grant admin3 201', grant.status === 201, `status=${grant.status} ${grant.text}`);
  const adminsList = await req('/api/admin/platform/admins', 'GET', undefined, adminAuth);
  ok('admins list has admin3', (adminsList.data?.admins ?? []).some((a) => a.email === EMAILS.admin3), JSON.stringify(adminsList.data?.admins?.map((a) => a.email)));
  const admin3Staff = await prisma.platformStaff.findFirst({ where: { user: { email: EMAILS.admin3 } }, select: { id: true, role: { select: { name: true } } } });
  ok('admin3 role = Platform Admin', admin3Staff?.role?.name === 'Platform Admin', JSON.stringify(admin3Staff));
  const deact = await req(`/api/admin/platform/admins/${admin3Staff.id}`, 'PATCH', { isActive: false }, adminAuth);
  ok('deactivate admin3 200', deact.status === 200, `status=${deact.status} ${deact.text}`);
  const deactDB = await prisma.platformStaff.findUnique({ where: { id: admin3Staff.id }, select: { isActive: true } });
  ok('admin3 actually inactive', deactDB?.isActive === false, JSON.stringify(deactDB));
  ok('audit platform_admin.update written', await prisma.auditLog.count({ where: { target: EMAILS.admin3, action: 'platform_admin.update' } }) >= 1, 'missing');
  const revoke = await req(`/api/admin/platform/admins/${admin3Staff.id}`, 'DELETE', {}, adminAuth);
  ok('revoke admin3 200', revoke.status === 200, `status=${revoke.status} ${revoke.text}`);
  ok('audit platform_admin.revoke written', await prisma.auditLog.count({ where: { target: EMAILS.admin3, action: 'platform_admin.revoke' } }) >= 1, 'missing');

  // 11. settings
  console.log('\n11. Platform settings');
  const setKey = `a10-test-${UNIQUE}`;
  const setUpsert = await req('/api/admin/settings', 'PUT', { key: setKey, value: true, description: 'phase10' }, adminAuth);
  ok('settings upsert 200', setUpsert.status === 200, `status=${setUpsert.status} ${setUpsert.text}`);
  const setList = await req('/api/admin/settings', 'GET', undefined, adminAuth);
  ok('settings list has it', (setList.data?.settings ?? []).some((s) => s.key === setKey && s.value === true), JSON.stringify(setList.data?.settings?.map((s) => s.key)));
  const setDel = await req(`/api/admin/settings/${setKey}`, 'DELETE', {}, adminAuth);
  ok('settings delete 200', setDel.status === 200, `status=${setDel.status} ${setDel.text}`);

  console.log('\nResult: ' + (failed ? 'FAILED' : 'ALL PASSED'));
  process.exit(failed ? 1 : 0);
}

function cartCookie(setCookie) {
  const m = (setCookie || '').match(/shopora_cart_session=([^;]*)/);
  return `shopora_cart_session=${m ? m[1] : ''}`;
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });