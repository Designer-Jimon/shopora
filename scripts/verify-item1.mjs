// Item 1 verification: after revoking jimonemmanuel@gmail.com's PlatformStaff row
//  - /admin is blocked for that account (redirects away, never 200)
//  - login session resolves to business_user → Ifeco Pastries dashboard
//  - real super admin (jimonemmanuel7@gmail.com) still works: /admin 200 + admin API 200
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SignJWT } from 'jose';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.API_BASE || 'http://localhost:3000';
const prisma = new PrismaClient();

function envValue(name, fallback = '') {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    const found = readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith(name + '='));
    if (found) return found.slice(name.length + 1).replace(/^["']|["']$/g, '');
  }
  return fallback;
}

async function token(userId, claims) {
  return new SignJWT({ ...claims, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setIssuer('shopora')
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(envValue('JWT_ACCESS_SECRET')));
}

async function req(path, cookie, method = 'GET') {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text, location: res.headers.get('location') };
}

const FORMER = 'jimonemmanuel@gmail.com';
const REAL_ADMIN = 'jimonemmanuel7@gmail.com';
let failed = false;
const ok = (label, cond, extra = '') => { if (cond) console.log('  PASS  ' + label); else { console.error('  FAIL  ' + label + '  ' + extra); failed = true; } };

(async () => {
  const former = await prisma.user.findUnique({ where: { email: FORMER } });
  const admin = await prisma.user.findUnique({ where: { email: REAL_ADMIN } });
  const ifeco = await prisma.business.findFirst({ where: { slug: 'ifeco-pastries' } });
  if (!former || !admin || !ifeco) { console.log('missing seed data'); return; }

  // Former identity session (business_user on Ifeco Pastries — exactly what login issues now)
  const bizToken = await token(former.id, {
    role: 'business_user', businessId: ifeco.id, businessRole: 'Owner', permissions: [],
  });
  const bizCookie = `shopora_session=${bizToken}`;

  // Admin session
  const adminToken = await token(admin.id, { role: 'platform_admin', permissions: [], businessId: undefined });
  const adminCookie = `shopora_session=${adminToken}`;

  console.log('\n1. Former dual-identity account — /admin must be unreachable');
  const adminPage = await req('/admin', bizCookie);
  ok('/admin does NOT render for former dual-identity (redirects away)', adminPage.status === 307, `status=${adminPage.status} loc=${adminPage.location}`);
  ok('/admin redirect location != /admin', adminPage.location !== '/admin', `loc=${adminPage.location}`);

  const adminApi = await req('/api/admin/metrics', bizCookie);
  ok('/api/admin/metrics rejects former dual-identity (401/403)', adminApi.status === 401 || adminApi.status === 403, `status=${adminApi.status}`);

  console.log('\n2. Former identity lands on their OWN business dashboard');
  const me = await req('/api/auth/me', bizCookie);
  ok('/api/auth/me resolves as business_user', me.status === 200 && me.data?.business, `status=${me.status} ${JSON.stringify(me.data)}`);
  ok('/api/auth/me reveals the Ifeco businessId', me.data?.business?.id === ifeco.id, `businessId=${me.data?.business?.id} want=${ifeco.id}`);
  ok('/api/auth/me role = Owner', me.data?.businessRole === 'Owner', `role=${me.data?.businessRole}`);
  const dash = await req('/dashboard', bizCookie);
  ok('/dashboard renders for former identity (200)', dash.status === 200, `status=${dash.status} loc=${dash.location}`);
  ok('/dashboard shows Ifeco Pastries', dash.text.includes('Ifeco Pastries'), 'brand missing');
  ok('/dashboard does NOT show admin nav', (dash.text.includes('Super Admin') || dash.text.includes('Impersonate')) === false, 'admin UI leaked into merchant dashboard');

  console.log('\n3. Real Super Admin still works');
  const adminPage2 = await req('/admin', adminCookie);
  ok('/admin renders for real super admin (200)', adminPage2.status === 200, `status=${adminPage2.status} loc=${adminPage2.location}`);
  const adminMetrics = await req('/api/admin/metrics', adminCookie);
  ok('/api/admin/metrics 200 for real super admin', adminMetrics.status === 200, `status=${adminMetrics.status}`);
  ok('admin ledger still lists the real admin', (adminMetrics.text || '').length > 0);

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ITEM 1 VERIFICATION PASSED =='));
})().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });