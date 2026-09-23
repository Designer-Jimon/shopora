// Phase 4 HTTP E2E — dashboard shell.
// Covers: owner full nav visibility, staff permission-filtered nav, the
// incomplete-onboarding guard, and the non-business-user redirect.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const BASE = process.env.API_BASE || 'http://localhost:3200';
const OWNER_EMAIL = 'dash-owner@shopora.dev';
const STAFF_EMAIL = 'dash-staff@shopora.dev';
const INCOMPLETE_EMAIL = 'dash-incomplete@shopora.dev';

const prisma = new PrismaClient();
let failed = false;
const ok = (label, cond, extra='') => { if (cond) console.log(`  PASS  ${label}`); else { console.error(`  FAIL  ${label}  ${extra}`); failed = true; } };

async function req(path, method='GET', body, headers={}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data=null; try { data=text?JSON.parse(text):null; } catch { data=text; }
  return { status: res.status, data, location: res.headers.get('location'), setCookie: res.headers.get('set-cookie') };
}

function accessCookie(setCookie) {
  const m = (setCookie||'').match(/shopora_session=([^;]*)/);
  return m ? `shopora_session=${m[1]}` : '';
}

function hasNav(html, label) {
  return html.includes('>'+label+'<');
}

async function register(email, businessName, kind='business') {
  const r = await req('/api/auth/register', 'POST', {
    email, password:'Phase4Pass123!', firstName:'X', lastName:'Y', kind, businessName,
  });
  return { status: r.status, cookie: accessCookie(r.setCookie) };
}

async function login(email, password='Phase4Pass123!') {
  const r = await req('/api/auth/login', 'POST', { email, password });
  return { status: r.status, cookie: accessCookie(r.setCookie) };
}

// Drive onboarding through the API: step 2 → step 3 (own slug) → step 4 → complete.
async function completeOnboarding(cookie) {
  let auth = { cookie };
  let r = await req('/api/businesses/me', 'PATCH', { step: 2, name:'Phase4 Mart', category:'Groceries' }, auth);
  if (r.status !== 200) return { ok:false, stage:'step2', status:r.status, body:r };
  const me = await req('/api/businesses/me', 'GET', undefined, auth);
  r = await req('/api/businesses/me', 'PATCH', { step: 3, slug: me.data.slug }, auth);
  if (r.status !== 200) return { ok:false, stage:'step3', status:r.status, body:r };
  r = await req('/api/businesses/me', 'PATCH', { step: 4, brandColor:'#722F37' }, auth);
  if (r.status !== 200) return { ok:false, stage:'step4', status:r.status, body:r };
  r = await req('/api/businesses/complete', 'POST', undefined, auth);
  if (r.status !== 200) return { ok:false, stage:'complete', status:r.status, body:r };
  return { ok:true };
}

async function createStaffUser(businessName) {
  const biz = await prisma.business.findFirst({ where: { name: businessName } });
  const staffRole = await prisma.role.findFirst({ where: { name: 'Staff' } });
  if (!biz || !staffRole) return null;

  const hash = await argon2.hash('Phase4Pass123!');
  const existing = await prisma.user.findUnique({ where: { email: STAFF_EMAIL } });
  let user;
  if (existing) {
    user = existing;
  } else {
    user = await prisma.user.create({
      data: { email: STAFF_EMAIL, passwordHash: hash, firstName:'Sam', lastName:'Staff' },
    });
  }
  await prisma.businessStaff.upsert({
    where: { userId_businessId_roleId: { userId: user.id, businessId: biz.id, roleId: staffRole.id } },
    update: { isActive: true },
    create: { userId: user.id, businessId: biz.id, roleId: staffRole.id },
  });
  return user;
}

async function main() {
  console.log('== Phase 4 dashboard shell ==\n');

  console.log('1. Prepare data (clean + seed owner)');
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: [OWNER_EMAIL, STAFF_EMAIL, INCOMPLETE_EMAIL] } } } });
  await prisma.business.deleteMany({ where: { name: 'Phase4 Mart' } });
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, STAFF_EMAIL, INCOMPLETE_EMAIL] } } });

  const owner = await register(OWNER_EMAIL, 'Phase4 Mart');
  ok('owner registered', owner.status===201, `status=${owner.status}`);
  const ownerDone = await completeOnboarding(owner.cookie);
  ok('owner onboarding completed', ownerDone.ok, JSON.stringify(ownerDone));

  const ownerLogin = await login(OWNER_EMAIL);
  const ownerAuth = { cookie: ownerLogin.cookie };

  console.log('\n2. Owner nav — all sections visible');
  const dashOwner = await req('/dashboard', 'GET', undefined, ownerAuth);
  ok('/dashboard loads 200 for completed owner', dashOwner.status===200, `status=${dashOwner.status} loc=${dashOwner.location}`);
  const htmlO = typeof dashOwner.data === 'string' ? dashOwner.data : JSON.stringify(dashOwner.data);
  for (const label of ['Dashboard','Products','Sales','Marketing','Store','Payments','Billing','Settings']) {
    ok(`owner sees "${label}"`, hasNav(htmlO, label), `missing ${label}`);
  }

  console.log('\n2b. Stubs + mobile trigger');
  // Phase 5 replaced the /products stub with a redirect to the real /products/all
  const prodOwner = await req('/products', 'GET', undefined, ownerAuth);
  ok('owner /products redirects to /products/all', prodOwner.status===307, `status=${prodOwner.status}`);
  const prodAll = await req('/products/all', 'GET', undefined, ownerAuth);
  ok('owner /products/all landing 200', prodAll.status===200, `status=${prodAll.status}`);
  const invOwner = await req('/products/inventory', 'GET', undefined, ownerAuth);
  ok('owner /products/inventory page 200', invOwner.status===200, `status=${invOwner.status}`);
  ok('mobile hamburger trigger rendered', htmlO.includes('aria-label="Open navigation"'), 'missing drawer trigger');

  console.log('\n3. Staff nav — permission-filtered');
  const staff = await createStaffUser('Phase4 Mart');
  ok('staff user created in business', !!staff);
  const staffLogin = await login(STAFF_EMAIL);
  ok('staff login works', staffLogin.status===200, `status=${staffLogin.status}`);
  const staffAuth = { cookie: staffLogin.cookie };

  const dashStaff = await req('/dashboard', 'GET', undefined, staffAuth);
  ok('/dashboard loads 200 for staff', dashStaff.status===200, `status=${dashStaff.status}`);
  const htmlS = typeof dashStaff.data === 'string' ? dashStaff.data : JSON.stringify(dashStaff.data);
  for (const label of ['Products','Sales','Store','Settings']) {
    ok(`staff sees "${label}"`, hasNav(htmlS, label), `missing ${label}`);
  }
  for (const label of ['Marketing','Payments','Billing']) {
    ok(`staff hidden from "${label}"`, !hasNav(htmlS, label), `should not see ${label}`);
  }
  // Store children are gated by settings.write — Domain hidden for staff.
  ok('staff sees "Store Settings"', hasNav(htmlS, 'Store Settings'), 'missing Store Settings');
  ok('staff hidden from "Domain"', !hasNav(htmlS, '>Domain<'), 'should not see Domain');

  console.log('\n4. Incomplete-onboarding guard');
  const incomplete = await register(INCOMPLETE_EMAIL, 'Phase4 Incomplete');
  ok('incomplete business registered', incomplete.status===201, `status=${incomplete.status}`);
  const incAuth = { cookie: incomplete.cookie };
  const inc = await req('/dashboard', 'GET', undefined, incAuth);
  ok('incomplete /dashboard redirects to /setup', inc.status===307 && inc.location && inc.location.startsWith('/setup'), `status=${inc.status} loc=${inc.location}`);

  console.log('\n5. Non-business-user redirect');
  const customer = await register('dash-customer@shopora.dev', null, 'customer');
  ok('customer registered', customer.status===201, `status=${customer.status}`);
  const cust = await req('/dashboard', 'GET', undefined, { cookie: customer.cookie });
  ok('customer /dashboard redirected away', cust.status===307 && cust.location, `status=${cust.status} loc=${cust.location}`);

  // Cleanup
  await prisma.businessStaff.deleteMany({ where: { user: { email: { in: [OWNER_EMAIL, STAFF_EMAIL, INCOMPLETE_EMAIL, 'dash-customer@shopora.dev'] } } } });
  await prisma.business.deleteMany({ where: { name: { in: ['Phase4 Mart','Phase4 Incomplete'] } } });
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, STAFF_EMAIL, INCOMPLETE_EMAIL, 'dash-customer@shopora.dev'] } } });

  console.log('\n'+ (failed?'== SOME CHECKS FAILED ==':'== ALL PHASE 4 CHECKS PASSED =='));
  await prisma.$disconnect();
  if (failed) process.exit(1);
}

main().catch(async (e)=>{ console.error('crash', e); await prisma.$disconnect(); process.exit(1); });