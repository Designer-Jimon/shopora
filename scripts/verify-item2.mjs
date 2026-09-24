// Item 2 test — eager subscription provisioning.
// 1. Register a brand-new business → Subscription row must exist IMMEDIATELY
//    (before ANY dashboard/storefront visit, without touching getSubscriptionState).
// 2. Run full onboarding → row still present, correct paid-Starter trial.
// 3. Lazy fallback still works for a business created OUTSIDE registration (simulated).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3000';
const prisma = new PrismaClient();
let failed = false;
const ok = (label, cond, extra = '') => { if (cond) console.log('  PASS  ' + label); else { console.error('  FAIL  ' + label + '  ' + extra); failed = true; } };

async function req(path, method = 'GET', body, headers = {}) {
  const res = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    body: body != null ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text, location: res.headers.get('set-cookie') };
}

function accessCookie(setCookie) {
  const m = (setCookie || '').match(/shopora_session=([^;]*)/);
  return m ? 'shopora_session=' + m[1] : '';
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
  return { ok: true };
}

const STAMP = Date.now();
const EMAIL = `eager-prov-${STAMP}@shopora.dev`;
const BIZ_NAME = `Eager Prov ${STAMP}`;

(async () => {
  console.log('== Item 2: eager subscription provisioning ==\n');

  console.log('1. Register new business — subscription row must exist right away');
  const reg = await req('/api/auth/register', 'POST', {
    email: EMAIL, password: 'EagerTest123!', firstName: 'Eager', lastName: 'Prov',
    kind: 'business', businessName: BIZ_NAME,
  });
  ok('register 201', reg.status === 201, `status=${reg.status}`);
  const businessId = reg.data?.businessId;
  ok('register returned businessId', !!businessId, `data=${JSON.stringify(reg.data)}`);

  // Query the DB DIRECTLY — no dashboard/storefront/API touch happened yet
  const sub0 = businessId ? await prisma.subscription.findUnique({ where: { businessId }, include: { plan: true } }) : null;
  ok('Subscription row exists IMMEDIATELY after register (no dashboard visit)', !!sub0, 'missing');
  ok('status = trial', sub0?.status === 'trial', `status=${sub0?.status}`);
  ok('on paid Starter plan (name=business)', sub0?.plan?.name === 'business', `plan=${sub0?.plan?.name}`);
  ok('trial ~14 days out', !!sub0?.trialEndsAt && sub0.trialEndsAt.getTime() > Date.now() + 13 * 86400_000, `trialEndsAt=${sub0?.trialEndsAt}`);
  const hist0 = sub0 ? await prisma.subscriptionHistory.count({ where: { subscriptionId: sub0.id } }) : 0;
  ok('SubscriptionHistory entry present', hist0 >= 1, `count=${hist0}`);

  console.log('\n2. Complete onboarding — subscription still present');
  const done = await completeOnboarding(accessCookie(reg.location));
  ok('onboarding completed', done.ok, JSON.stringify(done));
  const sub1 = await prisma.subscription.findUnique({ where: { businessId }, include: { plan: true } });
  ok('Subscription row still present after onboarding', !!sub1, 'missing');
  ok('still trial/paid Starter', sub1?.status === 'trial' && sub1?.plan?.name === 'business', `${sub1?.status}/${sub1?.plan?.name}`);

  console.log('\n3. Lazy fallback still works for a business created OUTSIDE registration');
  // Simulate a script-created business (no eager hook) then touch via ensureSubscription path
  const ownerRole = await prisma.role.findFirst({ where: { name: 'Owner' } });
  const strayUser = await prisma.user.create({
    data: { email: `stray-${STAMP}@shopora.dev`, passwordHash: '!no-login-stray', firstName: 'Stray', lastName: 'Biz' },
  });
  const strayBiz = await prisma.business.create({ data: { name: `Stray ${STAMP}`, slug: `stray-${STAMP}` } });
  await prisma.businessStaff.create({ data: { userId: strayUser.id, businessId: strayBiz.id, roleId: ownerRole.id } });
  const strayBefore = await prisma.subscription.findUnique({ where: { businessId: strayBiz.id } });
  ok('stray (script-created) business has no subscription yet', !strayBefore, 'unexpectedly present');
  // Hit the subscription API with a session on the stray business → lazy ensureSubscription should provision
  const { SignJWT } = await import('jose');
  const { readFileSync } = await import('node:fs');
  const secret = readFileSync('.env', 'utf8').split(/\r?\n/).find(l => l.startsWith('JWT_ACCESS_SECRET=')).slice('JWT_ACCESS_SECRET='.length).replace(/^["']|["']$/g, '');
  const tok = await new SignJWT({ role: 'business_user', businessId: strayBiz.id, businessRole: 'Owner', permissions: [], typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(strayUser.id).setIssuedAt().setIssuer('shopora').setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
  const touch = await req('/api/subscription', 'GET', undefined, { cookie: 'shopora_session=' + tok });
  const strayAfter = await prisma.subscription.findUnique({ where: { businessId: strayBiz.id } });
  ok('lazy fallback provisioned stray business on first touch', !!strayAfter, `touch=${touch.status}`);

  console.log('\n4. No business left without a subscription (backfill #2 held)');
  const noSub = await prisma.business.count({ where: { subscription: { is: null } } });
  ok('zero businesses missing a Subscription', noSub === 0, `missing=${noSub}`);

  // cleanup test rows
  await prisma.subscriptionHistory.deleteMany({ where: { subscription: { businessId: { in: [businessId, strayBiz.id] } } } });
  await prisma.subscription.deleteMany({ where: { businessId: { in: [businessId, strayBiz.id] } } });
  await prisma.businessStaff.deleteMany({ where: { userId: { in: [strayUser.id] } } });
  await prisma.business.deleteMany({ where: { id: { in: [businessId, strayBiz.id] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, `stray-${STAMP}@shopora.dev`] } } });

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ITEM 2 VERIFICATION PASSED =='));
})().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });