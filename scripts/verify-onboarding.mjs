// Phase 3 HTTP E2E — onboarding wizard.
// Covers: register → business info (step2) → slug check/save (step3, incl.
// collision) → branding (step4, incl. upload) → complete → guard redirects.

const BASE = process.env.API_BASE || 'http://localhost:3200';
const email = 'onboard-test@shopora.dev';
const OTHER = 'onboard-other@shopora.dev';

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

// Extract access cookie name=value pair from a Set-Cookie header.
function accessCookie(setCookie) {
  const m = (setCookie||'').match(/shopora_session=([^;]*)/);
  return m ? `shopora_session=${m[1]}` : '';
}

// Register and return the access cookie (with retries for transient DB flakiness).
async function registerAndGetCookie(kind, email, businessName) {
  for (let i = 0; i < 4; i++) {
    const r = await req('/api/auth/register', 'POST', {
      email, password:'OnboardPass123!', firstName:'X', lastName:'Y', kind, businessName,
    });
    if (r.status === 201) return accessCookie(r.setCookie);
    if (r.status === 409) return 'CONFLICT';
    await new Promise(res => setTimeout(res, 1500));
  }
  throw new Error('register failed after retries');
}

async function main() {
  console.log('== Phase 3 onboarding wizard ==\n');

  // ── Register (business) → starts at onboardingStep 2
  console.log('1. Register business owner');
  const cookieA = await registerAndGetCookie('business', email, 'Onboard Mart');
  if (cookieA === 'CONFLICT') { console.log('  SKIP  (test user already exists)'); return; }
  ok('register returned a session', cookieA.startsWith('shopora_session='), `cookie=${cookieA}`);
  let auth = { cookie: cookieA };

  // ── Step 2: business info
  console.log('\n2. Business info (step 2)');
  let r = await req('/api/businesses/me', 'GET', undefined, auth);
  ok('GET me returns onboardingStep=2', r.data?.onboardingStep===2, JSON.stringify(r.data));
  r = await req('/api/businesses/me', 'PATCH', { step: 2, name:'Onboard Mart', category:'Groceries', description:'Fresh goods', phone:'+23410', whatsappNumber:'+23411', address:'1 Market Rd', state:'Lagos', country:'Nigeria' }, auth);
  ok('step 2 saved 200', r.status===200, `status=${r.status}`);
  ok('onboardingStep advanced to 3', r.data?.onboardingStep===3, `step=${r.data?.onboardingStep}`);
  ok('category persisted', r.data?.category==='Groceries', JSON.stringify(r.data?.category));
  ok('state persisted', r.data?.state==='Lagos', JSON.stringify(r.data?.state));

  // ── Step 3: slug — availability + collision
  console.log('\n3. Store URL / slug (step 3)');
  r = await req('/api/businesses/check-slug?slug=onboard-mart', 'GET', undefined, auth);
  ok('check-slug available (for own business)', r.data?.available===true, JSON.stringify(r.data));
  r = await req('/api/businesses/suggest-slug', 'POST', { name:'Onboard Mart' });
  ok('suggest-slug returns a candidate', typeof r.data?.slug==='string', JSON.stringify(r.data));

  // Register a SECOND business with the SAME name to force a slug collision.
  // It auto-uniquifies its slug (e.g. onboard-mart-2) and CLAIMS it.
  console.log('\n4. Slug collision');
  const cookieB = await registerAndGetCookie('business', OTHER, 'Onboard Mart');
  ok('second business registered', cookieB.startsWith('shopora_session='));

  // Second business's own /me gives its (uniquified) slug.
  const meB = await req('/api/businesses/me', 'GET', undefined, { cookie: cookieB });
  const secondSlug = meB.data?.slug;
  ok('second business has distinct auto-slug', !!secondSlug && secondSlug !== 'onboard-mart', JSON.stringify(secondSlug));

  // Now try to make business A take a slug already owned by B.
  // B owns secondSlug. A currently has slug 'onboard-mart' (from register).
  // To test collision, set A's slug to B's secondSlug → should 409.
  r = await req('/api/businesses/me', 'PATCH', { step:3, slug: secondSlug }, auth);
  ok('collision rejected 409', r.status===409, `status=${r.status} body=${JSON.stringify(r.data)}`);
  ok('collision error message clear', /already taken/i.test(r.data?.error||''), JSON.stringify(r.data));

  // Now set A to a valid, available slug (onboard-mart is A's own current slug).
  r = await req('/api/businesses/me', 'PATCH', { step:3, slug:'onboard-mart' }, auth);
  ok('valid slug saved 200', r.status===200, `status=${r.status} body=${JSON.stringify(r.data)}`);
  ok('onboardingStep advanced to 4', r.data?.onboardingStep===4, `step=${r.data?.onboardingStep}`);
  ok('slug persisted', r.data?.slug==='onboard-mart', JSON.stringify(r.data?.slug));

  // ── Step 4: branding + upload
  console.log('\n5. Branding (step 4) + upload');
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,156,99,252,15,4,0,9,251,3,253,197,0,200,0,0,0,0,73,69,78,68,174,66,96,130]);
  const fd = new FormData();
  fd.append('file', new Blob([png], { type:'image/png' }), 'logo.png');
  fd.append('kind', 'logo');
  const up = await fetch(BASE+'/api/businesses/upload', { method:'POST', body: fd, headers: auth });
  const upData = await up.json().catch(()=>null);
  ok('logo upload 200', up.status===200, `status=${up.status} body=${JSON.stringify(upData)}`);
  ok('upload returns a /uploads URL', /^\/uploads\//.test(upData?.url||''), JSON.stringify(upData));

  const asset = await fetch(BASE+upData?.url).catch(()=>null);
  ok('uploaded asset is served', asset?.status===200, `status=${asset?.status}`);

  r = await req('/api/businesses/me', 'PATCH', { step:4, logoUrl: upData.url, brandColor:'#123456', phone:'+23410', whatsappNumber:'+23411', description:'Fresh goods' }, auth);
  ok('step 4 saved 200', r.status===200, `status=${r.status} body=${JSON.stringify(r.data)}`);
  ok('brand colour persisted via theme', r.data?.theme?.primaryColor==='#123456', JSON.stringify(r.data?.theme));
  ok('logoUrl persisted', r.data?.logoUrl===upData.url, JSON.stringify(r.data?.logoUrl));
  ok('step advanced to 5', r.data?.onboardingStep===5, `step=${r.data?.onboardingStep}`);

  // ── Complete
  console.log('\n6. Complete onboarding');
  r = await req('/api/businesses/complete', 'POST', undefined, auth);
  ok('complete 200', r.status===200, `status=${r.status}`);
  ok('complete flags onboardingComplete', r.data?.onboardingComplete===true, JSON.stringify(r.data));

  // ── Guards
  console.log('\n7. Guards');
  r = await req('/api/businesses/me', 'GET', undefined, auth);
  ok('completed business onboardingStep=99', r.data?.onboardingStep===99, `step=${r.data?.onboardingStep}`);
  r = await req('/setup', 'GET', undefined, auth);
  ok('completed business /setup redirects to /dashboard', r.status===307 && /\/dashboard$/.test(r.location||''), `status=${r.status} loc=${r.location}`);
  r = await req('/dashboard', 'GET', undefined, auth);
  ok('completed business /dashboard loads (200)', r.status===200, `status=${r.status}`);

  // Incomplete business: register another, /dashboard should redirect to /setup
  const cookieC = await registerAndGetCookie('business', 'incomplete@shopora.dev', 'Incomplete Co');
  r = await req('/dashboard', 'GET', undefined, { cookie: cookieC });
  ok('incomplete business /dashboard redirects to /setup', r.status===307 && r.location?.startsWith('/setup'), `status=${r.status} loc=${r.location}`);
  r = await req('/setup', 'GET', undefined, { cookie: cookieC });
  ok('incomplete business /setup redirects to /setup/business', r.status===307 && /\/setup\/business$/.test(r.location||''), `status=${r.status} loc=${r.location}`);

  console.log('\n'+ (failed?'== SOME CHECKS FAILED ==':'== ALL PHASE 3 CHECKS PASSED =='));
  if (failed) process.exit(1);
}

main().catch(e=>{ console.error('crash',e); process.exit(1); });
