// Phase 6 auth-pages E2E — real /login + /register pages, and the
// landing → register → onboarding-wizard flow.
// Exercises:
//   1. Landing page renders Get Started (→ /register) and Log in (→ /login)
//   2. /login and /register are REAL pages (no longer the [slug] preview shell)
//   3. Business registration auto-logs-in and lands in the Phase 3 wizard
//   4. Login with existing creds also lands in the wizard

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3200';
const EMAIL = `p6-auth-${Date.now()}@shopora.dev`;

const prisma = new PrismaClient();
let failed = false;
const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${label}`);
  else { console.error(`  FAIL  ${label}  ${extra}`); failed = true; }
};

async function req(path, method = 'GET', body, cookies = '') {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* html or empty */ }
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.length ? setCookies[0].split(';')[0] : null;
  return { status: res.status, location: res.headers.get('location'), text, data, cookie };
}

async function main() {
  console.log('== Auth pages E2E ==');

  console.log('\n1. Landing page CTAs');
  const landing = await req('/', 'GET');
  ok('landing loads 200', landing.status === 200, `status=${landing.status}`);
  ok('Get Started → /register', landing.text.includes('href="/register"'), 'missing /register link');
  ok('Log in → /login', landing.text.includes('href="/login"'), 'missing /login link');
  ok('Open your dashboard → /dashboard', landing.text.includes('href="/dashboard"'), 'missing /dashboard link');

  console.log('\n2. Real auth pages (no [slug] preview)');
  const login = await req('/login', 'GET');
  ok('/login renders auth page (200)', login.status === 200, `status=${login.status}`);
  ok('/login is NOT the storefront preview', !login.text.includes('Storefront preview'), 'fell through to [slug]');
  ok('/login shows the login form', login.text.includes('Welcome back'), 'missing form heading');

  const register = await req('/register', 'GET');
  ok('/register renders auth page (200)', register.status === 200, `status=${register.status}`);
  ok('/register is NOT the storefront preview', !register.text.includes('Storefront preview'), 'fell through to [slug]');
  ok('/register shows the signup form', register.text.includes('Create your account'), 'missing form heading');

  console.log('\n3. Register business → wizard');
  const reg = await req('/api/auth/register', 'POST', {
    firstName: 'Phase6', lastName: 'Owner', email: EMAIL, password: 'AuthPages123!',
    kind: 'business', businessName: `Auth E2E ${Date.now()}`,
  });
  ok('register returns 201', reg.status === 201, `status=${reg.status} ${reg.text}`);
  ok('register sets a session cookie', !!reg.cookie, 'no Set-Cookie');

  const setup = await req('/setup', 'GET', undefined, reg.cookie);
  ok('/setup redirects into wizard', setup.status === 307, `status=${setup.status} loc=${setup.location}`);
  ok('/setup → /setup/business (step 2)', (setup.location || '').endsWith('/setup/business'), `loc=${setup.location}`);

  const stepBusiness = await req('/setup/business', 'GET', undefined, reg.cookie);
  ok('wizard step loads (200)', stepBusiness.status === 200, `status=${stepBusiness.status}`);
  ok('wizard shows "Tell us about your business"', stepBusiness.text.includes('Tell us about your business'), 'wrong page');

  console.log('\n4. Login with existing business creds → dashboard guard');
  const loginPost = await req('/api/auth/login', 'POST', { email: EMAIL, password: 'AuthPages123!' });
  ok('login returns 200', loginPost.status === 200, `status=${loginPost.status} ${loginPost.text}`);
  ok('login sets a session cookie', !!loginPost.cookie, 'no Set-Cookie');

  const setupAfterLogin = await req('/setup', 'GET', undefined, loginPost.cookie);
  ok('authed /setup → wizard', setupAfterLogin.status === 307 && (setupAfterLogin.location || '').endsWith('/setup/business'),
    `status=${setupAfterLogin.status} loc=${setupAfterLogin.location}`);

  console.log('\n5. Validation + registered-email guard');
  const dup = await req('/api/auth/register', 'POST', {
    firstName: 'X', lastName: 'Y', email: EMAIL, password: 'AuthPages123!', kind: 'customer',
  });
  ok('duplicate email → 409', dup.status === 409, `status=${dup.status} ${dup.text}`);

  const badPw = await req('/api/auth/login', 'POST', { email: EMAIL, password: 'WrongPass123!' });
  ok('wrong password → 400', badPw.status === 400, `status=${badPw.status}`);

  // Cleanup
  await prisma.businessStaff.deleteMany({ where: { user: { email: EMAIL } } });
  await prisma.business.deleteMany({ where: { staff: { some: { user: { email: EMAIL } } } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ALL AUTH-PAGE CHECKS PASSED =='));
  await prisma.$disconnect();
  if (failed) process.exit(1);
}

main().catch((e) => { console.error('crash', e); process.exit(1); });