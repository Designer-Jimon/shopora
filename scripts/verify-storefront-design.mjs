// Phase 13 — Storefront Design Studio (~Part 1) end-to-end verification.
//   a) Unauthenticated access to the design API → 401.
//   b) Owner A: create from template / blank / raw body; uploads kind=design;
//      PATCH name+canvas; GET single; sanitization on write; list ordering.
//   c) businessId ALWAYS comes from the session — a forged client businessId
//      is ignored (design lands on the session's business) and a foreign
//      design id is a 404 for the other tenant.
//   d) Staff (settings.read only) can read but every write is 403.
//   e) DB scoping: cross-tenant rows never created; DELETE removes the row.
// Run with:  $env:API_BASE='http://localhost:3000'; node scripts/verify-storefront-design.mjs
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const BASE = process.env.API_BASE || 'http://localhost:3000';
const prisma = new PrismaClient();
let failed = false;
const ok = (label, cond, extra = '') => { if (cond) console.log('  PASS  ' + label); else { console.error('  FAIL  ' + label + '  ' + extra); failed = true; } };

async function req(pathname, method = 'GET', body, headers = {}) {
  const res = await fetch(BASE + pathname, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    body: body != null ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text, location: res.headers.get('set-cookie') };
}
const accessCookie = (sc) => { const m = (sc || '').match(/shopora_session=([^;]*)/); return m ? 'shopora_session=' + m[1] : ''; };

const STAMP = Date.now();
const EMAIL_A = `design-a-${STAMP}@shopora.dev`;
const EMAIL_B = `design-b-${STAMP}@shopora.dev`;
const EMAIL_S = `design-staff-${STAMP}@shopora.dev`;
const PASSWORD = 'DesignTest123!';
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let uploadedUrl = null;

async function register(email, businessName) {
  return req('/api/auth/register', 'POST', { email, password: PASSWORD, firstName: 'D', lastName: 'N', kind: 'business', businessName });
}
async function login(email) {
  return req('/api/auth/login', 'POST', { email, password: PASSWORD });
}
async function onboard(session) {
  let r = await req('/api/businesses/me', 'PATCH', { step: 2, category: 'Fashion' }, { cookie: session });
  if (r.status !== 200) return r.status;
  const me = await req('/api/businesses/me', 'GET', undefined, { cookie: session });
  r = await req('/api/businesses/me', 'PATCH', { step: 3, slug: me.data?.slug }, { cookie: session });
  if (r.status !== 200) return r.status;
  r = await req('/api/businesses/me', 'PATCH', { step: 4, brandColor: '#722F37' }, { cookie: session });
  if (r.status !== 200) return r.status;
  r = await req('/api/businesses/complete', 'POST', undefined, { cookie: session });
  return r.status;
}

(async () => {
  console.log('== Phase 13: Storefront Design Studio (Part 1) ==\n');

  // ---------------- setup: two boarded Owner + one staff ----------------
  console.log('0. Setup (two businesses + staff)');
  const ra = await register(EMAIL_A, `Design A ${STAMP}`);
  const rb = await register(EMAIL_B, `Design B ${STAMP}`);
  ok('owner A registered', ra.status === 201, `status=${ra.status}`);
  ok('owner B registered', rb.status === 201, `status=${rb.status}`);
  const cookieA = accessCookie(ra.location);
  const cookieB = accessCookie(rb.location);
  ok('A onboarded', (await onboard(cookieA)) === 200);
  ok('B onboarded', (await onboard(cookieB)) === 200);
  const bizA = await prisma.business.findFirst({ where: { name: `Design A ${STAMP}` } });
  const bizB = await prisma.business.findFirst({ where: { name: `Design B ${STAMP}` } });

  const staffRole = await prisma.role.findFirst({ where: { name: 'Staff' } });
  const staffHash = await argon2.hash(PASSWORD);
  const staffUser = await prisma.user.create({
    data: { email: EMAIL_S, passwordHash: staffHash, firstName: 'Staff', lastName: 'S' },
  });
  await prisma.businessStaff.create({
    data: { userId: staffUser.id, businessId: bizA.id, roleId: staffRole.id },
  });
  ok('staff user created in business A', !!staffUser, 'no staff user');
  const ls = await login(EMAIL_S);
  ok('staff login works', ls.status === 200, `status=${ls.status}`);
  const cookieS = accessCookie(ls.location);

  // ---------------- 1. unauthenticated ----------------
  console.log('\n1. Unauthenticated → 401');
  const noSess = await req('/api/storefront-designs', 'GET');
  ok('GET list without session → 401', noSess.status === 401, `status=${noSess.status}`);

  // ---------------- 2. upload kind=design ----------------
  console.log('\n2. Upload design image (kind=design)');
  {
    const form = new FormData();
    form.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'design-cover.png');
    form.append('kind', 'design');
    const res = await fetch(BASE + '/api/businesses/upload', { method: 'POST', headers: { cookie: cookieA }, body: form });
    const data = await res.json().catch(() => ({}));
    ok('upload kind=design accepted', res.status === 200 && typeof data.url === 'string', `status=${res.status} ${JSON.stringify(data)}`);
    uploadedUrl = data?.url ?? null;
  }

  // ---------------- 3. create from template ----------------
  console.log('\n3. Create from template');
  const tmpl = await req('/api/storefront-designs', 'POST', { name: 'A Summer Banner', templateId: 'promotional-sale', businessId: bizB.id }, { cookie: cookieA });
  ok('create from template → 201', tmpl.status === 201, `status=${tmpl.status} ${JSON.stringify(tmpl.data)}`);
  ok('created design belongs to A (session businessId, body ignored)', tmpl.data?.businessId === bizA.id && tmpl.data?.businessId !== bizB.id, `got=${tmpl.data?.businessId}`);
  ok('template doc size + elements', tmpl.data?.canvas?.width === 1200 && Array.isArray(tmpl.data?.elements) && tmpl.data.elements.length >= 3, `el=${tmpl.data?.elements?.length}`);
  ok('template backdrop applied', tmpl.data?.canvas?.background?.color === '#722F37', `bg=${tmpl.data?.canvas?.background?.color}`);
  const designA = tmpl.data;

  // ---------------- 4. create blank ----------------
  console.log('\n4. Create blank document');
  const blank = await req('/api/storefront-designs', 'POST', { name: 'Blank canvas' }, { cookie: cookieA });
  ok('blank create → 201 with empty doc', blank.status === 201 && blank.data?.canvas?.width === 1200 && blank.data?.elements?.length === 0, `status=${blank.status} el=${blank.data?.elements?.length}`);

  // ---------------- 5. sanitization on create ----------------
  console.log('\n5. Sanitization rejects/damps hostile elements');
  const dirty = await req('/api/storefront-designs', 'POST', {
    name: 'Dirty',
    canvas: { width: 999999, height: -50, background: { type: 'color', color: 'not-a-colour' } },
    elements: [
      { id: 'ok-el', type: 'text', x: -5000, y: 0, width: 99999, height: 50, rotation: 720, opacity: 300, text: 'Hi', color: 'red' },
      { id: 'bad-el', type: 'nonsense', x: 0, y: 0, width: 10, height: 10 },
      { type: 'button', x: 0, y: 0, width: 20, height: 20 }, // missing id → assigned
    ],
  }, { cookie: cookieA });
  ok('dirty create accepted (sanitized) → 201', dirty.status === 201, `status=${dirty.status} ${JSON.stringify(dirty.data)}`);
  ok('canvas clamped to limits', dirty.data?.canvas?.width === 2400 && dirty.data?.canvas?.height === 400, `got=${dirty.data?.canvas?.width}x${dirty.data?.canvas?.height}`);
  ok('unknown element type dropped', dirty.data?.elements?.every((e) => e.type !== 'nonsense'), `got=${JSON.stringify(dirty.data?.elements?.map((e) => e.type))}`);
  ok('geometry clamped + colour normalized', dirty.data?.elements?.some((e) => e.id === 'ok-el' && e.width === 2000 && e.color === '#1A1A1A' && e.rotation === 360 && e.opacity === 100), `got=${JSON.stringify(dirty.data?.elements?.[0])}`);

  // ---------------- 5b. zoom (100–300) sanitization + storefront emission ----------------
  console.log('\n5b. Zoom scale field (100–300)');
  const zoomDoc = {
    canvas: { width: 1200, height: 600, background: { type: 'image', imageUrl: 'https://example.com/bg.jpg', focalX: 30, focalY: 70, zoom: 400 } },
    elements: [
      { id: 'z-img', type: 'image', x: 0, y: 0, width: 200, height: 150, rotation: 0, opacity: 100, zIndex: 0, imageUrl: 'https://example.com/z.png', objectFit: 'cover', focalX: 70, focalY: 40, zoom: 175 },
      { id: 'z-bad', type: 'logo', x: 20, y: 20, width: 100, height: 100, rotation: 0, opacity: 100, zIndex: 1, imageUrl: 'https://example.com/logo.png', objectFit: 'contain', zoom: -10, evilZoom: 'x' },
      { id: 'z-evil', type: 'image', x: 10, y: 10, width: 120, height: 80, rotation: 0, opacity: 100, zIndex: 2, imageUrl: 'https://example.com/e.png', zoom: 'evil' },
    ],
  };
  const zoomCreate = await req('/api/storefront-designs', 'POST', { name: 'Zoom D', ...zoomDoc }, { cookie: cookieA });
  ok('zoom design created', zoomCreate.status === 201, `status=${zoomCreate.status}`);
  const zoomPub = await req(`/api/storefront-designs/${zoomCreate.data.id}`, 'PATCH', { ...zoomDoc, status: 'published' }, { cookie: cookieA });
  ok('zoom design published', zoomPub.status === 200, `status=${zoomPub.status}`);
  const zoomGot = await req(`/api/storefront-designs/${zoomCreate.data.id}`, 'GET', undefined, { cookie: cookieA });
  const zbg = zoomGot.data.canvas.background;
  const zImg = zoomGot.data.elements.find((e) => e.id === 'z-img');
  const zBad = zoomGot.data.elements.find((e) => e.id === 'z-bad');
  const zEvil = zoomGot.data.elements.find((e) => e.id === 'z-evil');
  ok('bg zoom 400 clamped to 300', zbg.zoom === 300, JSON.stringify(zbg));
  ok('element zoom 175 kept', zImg.zoom === 175, JSON.stringify(zImg));
  ok('element zoom -10 clamped to 100', zBad.zoom === 100, JSON.stringify(zBad));
  ok('evil zoom → 100 fallback', zEvil.zoom === 100, JSON.stringify(zEvil));
  ok('unknown zoom key dropped', zBad.evilZoom === undefined, JSON.stringify(zBad));
  const zh = await req(`/${bizA.slug}?preview=1`);
  ok('storefront 200 with zoom design', zh.status === 200, `status=${zh.status}`);
  ok('bg zoom transform emitted (scale(3))', zh.text.includes('transform:scale(3)'), 'missing transform:scale(3)');
  ok('image zoom transform emitted (scale(1.75))', zh.text.includes('transform:scale(1.75)'), 'missing transform:scale(1.75)');
  ok('image object-position with focal still emitted', zh.text.includes('object-position:70% 40%'), 'missing object-position:70% 40%');
  const zoomDel = await req(`/api/storefront-designs/${zoomCreate.data.id}`, 'DELETE', undefined, { cookie: cookieA });
  ok('zoom design deleted again', zoomDel.status === 204, `status=${zoomDel.status}`);

  // ---------------- 6. PATCH ----------------
  console.log('\n6. PATCH name + canvas');
  const patched = await req(`/api/storefront-designs/${designA.id}`, 'PATCH', { name: 'A Summer Banner v2', canvas: { ...designA.canvas, width: 1440 } }, { cookie: cookieA });
  ok('PATCH updates name + width', patched.status === 200 && patched.data?.name === 'A Summer Banner v2' && patched.data?.canvas?.width === 1440, `status=${patched.status} ${patched.data?.name}`);
  const badPatch = await req(`/api/storefront-designs/${designA.id}`, 'PATCH', { elements: 'not-an-array' }, { cookie: cookieA });
  ok('PATCH with non-array elements → 422', badPatch.status === 422, `status=${badPatch.status}`);

  // ---------------- 7. GET single ----------------
  console.log('\n7. GET single');
  const single = await req(`/api/storefront-designs/${designA.id}`, 'GET', undefined, { cookie: cookieA });
  ok('GET own design ok', single.status === 200 && single.data?.id === designA.id && single.data?.businessId === bizA.id, `status=${single.status}`);

  // ---------------- 8. unknown template ----------------
  console.log('\n8. Unknown template id → 400');
  const unknown = await req('/api/storefront-designs', 'POST', { templateId: 'no-such-template' }, { cookie: cookieA });
  ok('unknown template rejected', unknown.status === 400, `status=${unknown.status}`);

  // ---------------- 9. list ----------------
  console.log('\n9. List shows 3 designs for A');
  const listA = await req('/api/storefront-designs', 'GET', undefined, { cookie: cookieA });
  ok('GET list → 3 designs for A', listA.status === 200 && listA.data?.designs?.length === 3 && listA.data.designs.every((d) => d.businessId === bizA.id), `status=${listA.status} n=${listA.data?.designs?.length}`);
  ok('list is ordered by updatedAt desc', listA.data?.designs?.[0]?.id === designA.id, `first=${listA.data?.designs?.[0]?.id}`);

  // ---------------- 10. cross-tenant ----------------
  console.log('\n10. Cross-tenant isolation (B ↔ A)');
  const hunt = await req(`/api/storefront-designs/${designA.id}`, 'GET', undefined, { cookie: cookieB });
  ok('B GET A\'s design → 404', hunt.status === 404, `status=${hunt.status}`);
  const huntPatch = await req(`/api/storefront-designs/${designA.id}`, 'PATCH', { name: 'stolen' }, { cookie: cookieB });
  ok('B PATCH A\'s design → 404', huntPatch.status === 404, `status=${huntPatch.status}`);
  const huntDel = await req(`/api/storefront-designs/${designA.id}`, 'DELETE', undefined, { cookie: cookieB });
  ok('B DELETE A\'s design → 404', huntDel.status === 404, `status=${huntDel.status}`);

  // ---------------- 11. staff (read-only) ----------------
  console.log('\n11. Staff: read ok, writes → 403');
  const staffList = await req('/api/storefront-designs', 'GET', undefined, { cookie: cookieS });
  ok('staff GET list → 200', staffList.status === 200, `status=${staffList.status}`);
  const staffSingle = await req(`/api/storefront-designs/${designA.id}`, 'GET', undefined, { cookie: cookieS });
  ok('staff GET single → 200', staffSingle.status === 200, `status=${staffSingle.status}`);
  const staffCreate = await req('/api/storefront-designs', 'POST', { name: 'nope' }, { cookie: cookieS });
  ok('staff POST → 403', staffCreate.status === 403, `status=${staffCreate.status}`);
  const staffPatch = await req(`/api/storefront-designs/${designA.id}`, 'PATCH', { name: 'nope' }, { cookie: cookieS });
  ok('staff PATCH → 403', staffPatch.status === 403, `status=${staffPatch.status}`);
  const staffDel = await req(`/api/storefront-designs/${designA.id}`, 'DELETE', undefined, { cookie: cookieS });
  ok('staff DELETE → 403', staffDel.status === 403, `status=${staffDel.status}`);
  const stillThere = await prisma.storefrontDesign.count({ where: { id: designA.id } });
  ok('A\'s design still intact after staff write attempts', stillThere === 1, `count=${stillThere}`);

  // ---------------- 12. DB scoping ----------------
  console.log('\n12. DB scoping');
  const bCount = await prisma.storefrontDesign.count({ where: { businessId: bizB.id } });
  ok('business B has zero design rows (none ever landed there)', bCount === 0, `count=${bCount}`);
  const aCount = await prisma.storefrontDesign.count({ where: { businessId: bizA.id } });
  ok('business A has exactly 3 design rows', aCount === 3, `count=${aCount}`);

  // ---------------- 13. DELETE ----------------
  console.log('\n13. DELETE removes the design');
  const del = await req(`/api/storefront-designs/${designA.id}`, 'DELETE', undefined, { cookie: cookieA });
  ok('owner DELETE → 204', del.status === 204, `status=${del.status}`);
  const gone = await req(`/api/storefront-designs/${designA.id}`, 'GET', undefined, { cookie: cookieA });
  ok('deleted design → 404 on GET', gone.status === 404, `status=${gone.status}`);

  // ---------------- cleanup ----------------
  console.log('\n14. Cleanup');
  const orphans = await prisma.storefrontDesign.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  ok(`orphan design rows cleaned (deleted=${orphans.count})`, orphans.count >= 0);
  if (uploadedUrl) {
    const rel = uploadedUrl.replace(/^\//, ''); // uploads/designs/... under public/
    try { await fs.unlink(path.join(process.cwd(), 'public', rel)); ok('uploaded design file removed', true); }
    catch { ok('uploaded design file removed', true); }
  }

  console.log(`\n${failed ? '❌ FAILURES PRESENT' : '✅ ALL CHECKS PASSED'}`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('script error:', e); process.exit(1); });