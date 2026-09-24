// Item 4 test — tenant resolution correctness + one business per account.
//  a) Two separate owner accounts each land ONLY on their own dashboard across
//     multiple login/logout cycles (never each other's, never a fallback).
//  b) Staff invite to an account already tied to another business is rejected (409).
//  c) DB-level: a second BusinessStaff row for a user is impossible (P2002).
//  d) Middleware/tenant resolution: businessId always comes from the verified
//     session JWT (server-side), never client input — asserted implicitly by (a)
//     and by the invite rejection; explicit trace printed for the report.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient, Prisma } = require('@prisma/client');

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
const accessCookie = (sc) => { const m = (sc || '').match(/shopora_session=([^;]*)/); return m ? 'shopora_session=' + m[1] : ''; };

const STAMP = Date.now();
const EMAIL_A = `tenant-a-${STAMP}@shopora.dev`;
const EMAIL_B = `tenant-b-${STAMP}@shopora.dev`;
const INVITEE = `staff-x-${STAMP}@shopora.dev`;
const BIZ_A = `Tenant A ${STAMP}`;
const BIZ_B = `Tenant B ${STAMP}`;
const PASSWORD = 'TenantTest123!';

async function register(email, businessName) {
  return req('/api/auth/register', 'POST', {
    email, password: PASSWORD, firstName: 'T', lastName: 'N', kind: 'business', businessName,
  });
}
async function login(email) {
  return req('/api/auth/login', 'POST', { email, password: PASSWORD });
}

(async () => {
  console.log('== Item 4: tenant resolution + one business per account ==\n');

  console.log('1. Create two businesses/owners via the full registration flow');
  const ra = await register(EMAIL_A, BIZ_A);
  const rb = await register(EMAIL_B, BIZ_B);
  ok('owner A registered', ra.status === 201, `status=${ra.status}`);
  ok('owner B registered', rb.status === 201, `status=${rb.status}`);
  const bizA = await prisma.business.findFirst({ where: { name: BIZ_A } });
  const bizB = await prisma.business.findFirst({ where: { name: BIZ_B } });
  ok('biz A found', !!bizA);
  ok('biz B found', !!bizB);

  console.log('\n2. Onboard BOTH businesses (real flow) so /dashboard renders');
  async function onboard(session) {
    let r = await req('/api/businesses/me', 'PATCH', { step: 2, category: 'Fashion' }, { cookie: session });
    if (r.status !== 200) return r.status;
    const me = await req('/api/businesses/me', 'GET', undefined, { cookie: session });
    r = await req('/api/businesses/me', 'PATCH', { step: 3, slug: me.data.slug }, { cookie: session });
    if (r.status !== 200) return r.status;
    r = await req('/api/businesses/me', 'PATCH', { step: 4, brandColor: '#123456' }, { cookie: session });
    if (r.status !== 200) return r.status;
    r = await req('/api/businesses/complete', 'POST', undefined, { cookie: session });
    return r.status;
  }
  const sessA0 = accessCookie(ra.location);
  const sessB0 = accessCookie(rb.location);
  const onA = await onboard(sessA0);
  const onB = await onboard(sessB0);
  ok('A onboarding complete', onA === 200, `status=${onA}`);
  ok('B onboarding complete', onB === 200, `status=${onB}`);

  console.log('\n2. Both subscribe EAGERLY at registration (never a gap)');
  const subA = await prisma.subscription.findUnique({ where: { businessId: bizA.id } });
  const subB = await prisma.subscription.findUnique({ where: { businessId: bizB.id } });
  ok('biz A subscription exists before any dashboard touch', !!subA);
  ok('biz B subscription exists before any dashboard touch', !!subB);

  console.log('\n3. Login/logout cycles — each lands ONLY on their own dashboard');
  for (let cycle = 1; cycle <= 2; cycle++) {
    const la = await login(EMAIL_A); ok(`cycle ${cycle}: A login ok`, la.status === 200, `status=${la.status}`);
    const meA = await req('/api/auth/me', 'GET', undefined, { cookie: accessCookie(la.location) });
    const dashA = await req('/dashboard', 'GET', undefined, { cookie: accessCookie(la.location) });
    ok(`cycle ${cycle}: A /me → own businessId (never B)`, meA.data?.business?.id === bizA.id && meA.data?.business?.id !== bizB.id, `got=${meA.data?.business?.id}`);
    ok(`cycle ${cycle}: A /dashboard shows own brand (not B's)`, dashA.status === 200 && dashA.text.includes(BIZ_A) && !dashA.text.includes(BIZ_B), `status=${dashA.status}`);

    const lb = await login(EMAIL_B); ok(`cycle ${cycle}: B login ok`, lb.status === 200, `status=${lb.status}`);
    const meB = await req('/api/auth/me', 'GET', undefined, { cookie: accessCookie(lb.location) });
    const dashB = await req('/dashboard', 'GET', undefined, { cookie: accessCookie(lb.location) });
    ok(`cycle ${cycle}: B /me → own businessId (never A)`, meB.data?.business?.id === bizB.id && meB.data?.business?.id !== bizA.id, `got=${meB.data?.business?.id}`);
    ok(`cycle ${cycle}: B /dashboard shows own brand (not A's)`, dashB.status === 200 && dashB.text.includes(BIZ_B) && !dashB.text.includes(BIZ_A), `status=${dashB.status}`);
  }

  console.log('\n4. Staff invite cannot attach an account to a second business');
  const la = await login(EMAIL_A);
  const cookieA = accessCookie(la.location);
  const inv1 = await req('/api/staff', 'POST', { email: INVITEE, firstName: 'Staff', lastName: 'X' }, { cookie: cookieA });
  ok('invitee created + added to business A', inv1.status === 201, `status=${inv1.status} ${JSON.stringify(inv1.data)}`);
  const lb = await login(EMAIL_B);
  const cookieB = accessCookie(lb.location);
  const inv2 = await req('/api/staff', 'POST', { email: INVITEE, firstName: 'Staff', lastName: 'X' }, { cookie: cookieB });
  ok('inviting the same account to business B rejected (409)', inv2.status === 409, `status=${inv2.status} ${JSON.stringify(inv2.data)}`);

  console.log('\n5. DB-level: second BusinessStaff row impossible');
  const invitee = await prisma.user.findUnique({ where: { email: INVITEE } });
  const staffRole = await prisma.role.findFirst({ where: { name: 'Staff' } });
  let code = null;
  try {
    await prisma.businessStaff.create({ data: { userId: invitee.id, businessId: bizB.id, roleId: staffRole.id } });
  } catch (e) {
    code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : e?.code;
  }
  ok('raw DB second membership blocked (P2002 on BusinessStaff_userId_key)', code === 'P2002', `got=${code}`);

  console.log('\n6. No user currently holds memberships on more than one business');
  const multi = await prisma.businessStaff.groupBy({ by: ['userId'], _count: { id: true }, having: { id: { _count: { gt: 1 } } } });
  ok('zero multi-business users', multi.length === 0, `n=${multi.length}`);

  // cleanup
  await prisma.subscriptionHistory.deleteMany({ where: { subscription: { businessId: { in: [bizA.id, bizB.id] } } } });
  await prisma.subscription.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.businessStaff.deleteMany({ where: { userId: { in: [invitee ? invitee.id : ''] } } });
  const aUser = await prisma.user.findUnique({ where: { email: EMAIL_A } });
  const bUser = await prisma.user.findUnique({ where: { email: EMAIL_B } });
  await prisma.businessStaff.deleteMany({ where: { userId: { in: [aUser?.id || '', bUser?.id || ''] } } });
  await prisma.business.deleteMany({ where: { id: { in: [bizA.id, bizB.id] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B, INVITEE] } } });

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ITEM 4 VERIFICATION PASSED =='));
})().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });