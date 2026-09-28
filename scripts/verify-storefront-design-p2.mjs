// Phase 13 — Storefront Design Studio (Part 2) end-to-end verification:
//   responsive preview + safe zone + draft/preview/publish state machine +
//   live storefront integration + performance separation.
//
// Run with:  $env:API_BASE='http://localhost:3000'; node scripts/verify-storefront-design-p2.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

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
const EMAIL_A = `p2-a-${STAMP}@shopora.dev`;
const EMAIL_B = `p2-b-${STAMP}@shopora.dev`;
const PASSWORD = 'DesignTest123!';

const docWith = (markText, withButton = false) => ({
  canvas: { width: 1200, height: 600, background: { type: 'color', color: '#FDF2E9' } },
  elements: [
    { id: 'el', type: 'text', x: 120, y: 200, width: 960, height: 120, rotation: 0, opacity: 100, zIndex: 0, text: markText, fontSize: 56, fontWeight: 800, fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", textAlign: 'center', color: '#1A1A1A' },
    ...(withButton ? [{ id: 'btn', type: 'button', x: 490, y: 400, width: 220, height: 64, rotation: 0, opacity: 100, zIndex: 1, text: 'Shop now', fontSize: 20, fontWeight: 700, fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", textAlign: 'center', color: '#FFFFFF', backgroundColor: '#722F37', borderRadius: 10, shape: 'rounded' }] : []),
  ],
});

const D1_MARK = 'P2A-MARK-1';
const D2_MARK = 'P2A-MARK-2';
const DRAFT_MARK = 'P2A-DRAFTMARK';
const B_MARK = 'P2B-BRAND';

async function register(email, businessName) {
  return req('/api/auth/register', 'POST', { email, password: PASSWORD, firstName: 'P', lastName: '2', kind: 'business', businessName });
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
  console.log('== Phase 13: Storefront Design Studio (Part 2) ==\n');

  // ---------------- 0. setup ----------------
  console.log('0. Setup (two onboarded businesses)');
  const ra = await register(EMAIL_A, `P2 Store A ${STAMP}`);
  const rb = await register(EMAIL_B, `P2 Store B ${STAMP}`);
  ok('owner A registered', ra.status === 201, `status=${ra.status}`);
  ok('owner B registered', rb.status === 201, `status=${rb.status}`);
  const cookieA = accessCookie(ra.location);
  const cookieB = accessCookie(rb.location);
  ok('A onboarded', (await onboard(cookieA)) === 200);
  ok('B onboarded', (await onboard(cookieB)) === 200);
  const bizA = await prisma.business.findFirst({ where: { name: `P2 Store A ${STAMP}` } });
  const slugA = bizA.slug;
  const bizB = await prisma.business.findFirst({ where: { name: `P2 Store B ${STAMP}` } });
  const slugB = bizB.slug;
  const authA = { cookie: cookieA };
  const authB = { cookie: cookieB };

  // ---------------- 1. create + publish D1 ----------------
  console.log('\n1. Publish flow (single live design per business)');
  const d1 = await req('/api/storefront-designs', 'POST', { name: 'D1' }, authA);
  const d2 = await req('/api/storefront-designs', 'POST', { name: 'D2' }, authA);
  ok('created D1 + D2 (both draft)', d1.status === 201 && d2.status === 201 && d1.data.status === 'draft' && d2.data.status === 'draft', `s1=${d1.status} s2=${d2.status}`);
  const p1 = await req(`/api/storefront-designs/${d1.data.id}`, 'PATCH', { name: 'D1', ...docWith(D1_MARK, true), status: 'published' }, authA);
  ok('publish D1 with doc+status in one PATCH', p1.status === 200 && p1.data.status === 'published' && !!p1.data.publishedAt, `status=${p1.status}`);
  ok('first publish sets publishedAt', typeof p1.data.publishedAt === 'string');
  const a1 = await prisma.storefrontDesign.count({ where: { businessId: bizA.id, status: 'published' } });
  ok('exactly one published after D1', a1 === 1, `count=${a1}`);

  console.log('\n2. Storefront renders the published design (performance separation)');
  const home1 = await req(`/${slugA}`);
  ok('storefront 200 with design', home1.status === 200, `status=${home1.status}`);
  ok('hero uses the shared cover renderer', home1.text.includes('data-sf-cover='), 'no data-sf-cover');
  ok('published design content shown', home1.text.includes(D1_MARK));
  ok('design button links to products', home1.text.includes(`href="/${slugA}/products"`), 'button href');
  ok('latest draft marker ABSENT', !home1.text.includes(D2_MARK));
  ok('legacy gradient hero NOT rendered', !home1.text.includes('linear-gradient(135deg, var(--sf-tint-strong)'), 'gradient leak');
  ok('legacy default CTA NOT rendered', !home1.text.includes('>Shop products<'), 'default CTA leak');
  ok('editor chunks absent from storefront HTML', !home1.text.includes('Add layer') && !home1.text.includes('Save draft') && !home1.text.includes('Start a new design'), 'editor marker found');

  // ---------------- 3. publishing D2 demotes D1 ----------------
  console.log('\n3. Second publish demotes the first (single live design)');
  const p2 = await req(`/api/storefront-designs/${d2.data.id}`, 'PATCH', { ...docWith(D2_MARK, true), status: 'published' }, authA);
  ok('publish D2 → published', p2.status === 200 && p2.data.status === 'published', `status=${p2.status}`);
  const d1after = await req(`/api/storefront-designs/${d1.data.id}`, 'GET', undefined, authA);
  ok('D1 demoted to draft on publish of D2', d1after.data.status === 'draft', `status=${d1after.data.status}`);
  ok('D1 publishedAt cleared', d1after.data.publishedAt === null, `publishedAt=${d1after.data.publishedAt}`);
  const a2 = await prisma.storefrontDesign.count({ where: { businessId: bizA.id, status: 'published' } });
  ok('still exactly one published', a2 === 1, `count=${a2}`);
  const home2 = await req(`/${slugA}`);
  ok('storefront now shows D2 content', home2.text.includes(D2_MARK));
  ok('storefront no longer shows D1 content', !home2.text.includes(D1_MARK));

  // ---------------- 4. unpublish falls back to default hero ----------------
  console.log('\n4. Unpublish → storefront falls back to default hero');
  const up = await req(`/api/storefront-designs/${d2.data.id}`, 'PATCH', { status: 'draft' }, authA);
  ok('unpublish D2 → draft + publishedAt cleared', up.status === 200 && up.data.status === 'draft' && up.data.publishedAt === null, `status=${up.status} pa=${up.data.publishedAt}`);
  const home0 = await req(`/${slugA}`);
  ok('default hero restored (no cover)', !home0.text.includes('data-sf-cover='), 'cover still present');
  ok('default hero gradient shown', home0.text.includes('linear-gradient(135deg, var(--sf-tint-strong)'), 'gradient missing');
  ok('default hero CTA shown', home0.text.includes('>Shop products<'), 'default CTA missing');
  ok('draft content NOT public', !home0.text.includes(D2_MARK));

  console.log('\n5. Draft preview (author-only)');
  const up2 = await req(`/api/storefront-designs/${d2.data.id}`, 'PATCH', { ...docWith(DRAFT_MARK), status: 'draft' }, authA);
  ok('D2 now a draft with draft marker', up2.status === 200 && up2.data.status === 'draft', `status=${up2.status}`);
  const anonPreview = await req(`/${slugA}?preview=1`);
  ok('anonymous ?preview=1 shows DEFAULT hero (no leak)', !anonPreview.text.includes(DRAFT_MARK) && !anonPreview.text.includes('data-sf-cover=') && !anonPreview.text.includes('Previewing the latest saved draft'), 'preview leaked');
  const ownerPreview = await req(`/${slugA}?preview=1`, 'GET', undefined, { cookie: cookieA });
  ok('owner ?preview=1 shows the draft cover', ownerPreview.text.includes(DRAFT_MARK) && ownerPreview.text.includes('data-sf-cover='), 'draft not shown to owner');
  ok('owner sees the preview banner', ownerPreview.text.includes('Previewing the latest saved draft'), 'banner missing');
  const ownerPlain = await req(`/${slugA}`, 'GET', undefined, { cookie: cookieA });
  ok('owner WITHOUT preview hits the default hero (draft not public)', !ownerPlain.text.includes(DRAFT_MARK), 'draft leaked without preview param');
  const otherTenant = await req(`/${slugA}?preview=1`, 'GET', undefined, { cookie: cookieB });
  ok('other tenant preview ignored on A', !otherTenant.text.includes(DRAFT_MARK) && !otherTenant.text.includes('Previewing the latest saved draft'), 'cross-tenant preview leaked');

  // ---------------- 6. cross-tenant published bleed ----------------
  console.log('\n6. Cross-tenant isolation of published designs');
  const bd = await req('/api/storefront-designs', 'POST', { name: 'B design', ...docWith(B_MARK, true) }, authB);
  ok('B creates its own design (draft)', bd.status === 201 && bd.data.status === 'draft', `status=${bd.status}`);
  const bpub = await req(`/api/storefront-designs/${bd.data.id}`, 'PATCH', { status: 'published' }, authB);
  ok('B publishes its own design', bpub.status === 200 && bpub.data.status === 'published', `status=${bpub.status}`);
  const homeB = await req(`/${slugB}`);
  ok('B storefront shows B design', homeB.text.includes(B_MARK));
  const homeANow = await req(`/${slugA}`);
  ok('A storefront does NOT show B design', !homeANow.text.includes(B_MARK), 'B content leaked to A');
  const bcount = await prisma.storefrontDesign.count({ where: { businessId: bizB.id, status: 'published' } });
  ok('B has exactly one published', bcount === 1, `count=${bcount}`);

  // ---------------- 7. responsive overrides surface ----------------
  console.log('\n7. Responsive overrides (sanitised server-side) + cover variants');
  const roDoc = {
    canvas: { width: 1200, height: 600, background: { type: 'color', color: '#FFFFFF' } },
    elements: [{
      id: 'rov', type: 'text', x: 100, y: 100, width: 600, height: 120, rotation: 0, opacity: 100, zIndex: 0,
      text: 'OVERRIDE-ME', fontSize: 56, fontWeight: 800, fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", textAlign: 'center', color: '#1A1A1A',
      responsive: {
        tablet: { x: 50, y: 40, width: 500, evil: 'nope' },
        mobile: { fontSize: 34, opacity: 120, rotation: 999 },
        desktop: { x: 1 }, // not a real key → dropped
      },
    }],
  };
  const ro = await req(`/api/storefront-designs/${d2.data.id}`, 'PATCH', { ...roDoc, status: 'draft' }, authA);
  ok('override PATCH accepted', ro.status === 200, `status=${ro.status}`);
  const savedEl = ro.data.elements[0];
  ok('tablet override kept + evil key dropped', savedEl.responsive?.tablet?.x === 50 && savedEl.responsive?.tablet?.width === 500 && !('evil' in (savedEl.responsive?.tablet ?? {})), JSON.stringify(savedEl.responsive));
  ok('mobile override clamped (opacity ≤100, rotation ≤360)', savedEl.responsive?.mobile?.opacity === 100 && savedEl.responsive?.mobile?.rotation === 360 && savedEl.responsive?.mobile?.fontSize === 34, JSON.stringify(savedEl.responsive));
  ok('desktop / unknown devices dropped', !('desktop' in (savedEl.responsive ?? {})), JSON.stringify(savedEl.responsive));
  const roHome = await req(`/${slugA}?preview=1`, 'GET', undefined, { cookie: cookieA });
  ok('cover emits responsive variants', roHome.text.includes('data-sf-variant="mobile"') && roHome.text.includes('data-sf-variant="tablet"') && roHome.text.includes('data-sf-variant="base"'), 'variants missing');
  ok('cover ships container-query rules', roHome.text.includes('@container'), 'no @container rules');
  ok('typography floor present in rendered CSS', roHome.text.includes('max(') && roHome.text.includes('cqw'), 'floor/cqw missing');

  // ---------------- 8. dashboard editor UI ----------------
  console.log('\n8. Editor + studio home (skin)');
  const edit = await req(`/store/appearance/design?id=${d2.data.id}`, 'GET', undefined, { cookie: cookieA });
  ok('editor page renders', edit.status === 200, `status=${edit.status}`);
  ok('editor has device tabs', edit.text.includes('>Desktop<') && edit.text.includes('>Tablet<') && edit.text.includes('>Mobile<'), 'device tabs missing');
  ok('editor has publish + safe zone controls', edit.text.includes('Publish') && edit.text.includes('Safe zone'), 'publish/guide missing');
  const homeB_studio = await req('/store/appearance', 'GET', undefined, { cookie: cookieB });
  ok('studio home renders', homeB_studio.status === 200, `status=${homeB_studio.status}`);
  ok('studio home shows Live-on-storefront link for the published design', homeB_studio.text.includes('Live on storefront'), 'live link missing');

  // ---------------- 9. state-machine DB invariants ----------------
  console.log('\n9. State-machine invariants in the DB');
  const rowsA = await prisma.storefrontDesign.findMany({ where: { businessId: bizA.id }, select: { status: true, publishedAt: true }, orderBy: { updatedAt: 'asc' } });
  ok('A has exactly 2 rows', rowsA.length === 2, `n=${rowsA.length}`);
  ok('A has no published rows right now', rowsA.filter((r) => r.status === 'published').length === 0, JSON.stringify(rowsA));
  ok('neither A row carries a stale publishedAt', rowsA.every((r) => r.publishedAt === null), JSON.stringify(rowsA));

  // ---------------- 10. repo hygiene ----------------
  console.log('\n10. Regression: Part 1 behaviours still green');
  const noSess = await req('/api/storefront-designs', 'GET');
  ok('design API still 401 without session', noSess.status === 401, `status=${noSess.status}`);
  const bad = await req(`/api/storefront-designs/${d2.data.id}`, 'PATCH', { status: 'archived' }, authA);
  ok('invalid status still rejected', bad.status === 400, `status=${bad.status}`);

  // ---------------- cleanup ----------------
  console.log('\nCleanup');
  await req(`/api/storefront-designs/${d1.data.id}`, 'DELETE', undefined, authA);
  await req(`/api/storefront-designs/${d2.data.id}`, 'DELETE', undefined, authA);
  await req(`/api/storefront-designs/${bd.data.id}`, 'DELETE', undefined, authB);
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
  const leftovers = await prisma.storefrontDesign.count({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  ok('all design rows cleaned up', leftovers === 0, `left=${leftovers}`);

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ALL PHASE 13 (PART 2) CHECKS PASSED =='));
  await prisma.$disconnect();
  if (failed) process.exit(1);
})().catch(async (e) => { console.error('crash', e); await prisma.$disconnect(); process.exit(1); });