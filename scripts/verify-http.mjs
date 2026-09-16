// HTTP-level test of the auth routes against a running Next production server.

const BASE = process.env.API_BASE || 'http://localhost:3200';
const email = 'http-owner-test@shopora.dev';

let failed = false;
function ok(label, cond, extra='') {
  if (cond) console.log(`  PASS  ${label}`);
  else { console.error(`  FAIL  ${label} ${extra}`); failed = true; }
}

async function req(path, method='GET', body, headers={}, redirect='manual') {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data, setCookie };
}

async function main() {
  console.log('== HTTP auth route test ==\n');

  // 1. Unauthenticated health
  console.log('1. Unauthenticated /api/health');
  let r = await req('/api/health'); // no cookies
  ok('returns 200', r.status === 200, `status=${r.status}`);
  ok('businessId is null (no session)', r.data?.businessId === null, JSON.stringify(r.data));
  ok('authenticated=false', r.data?.authenticated === false);

  // 2. Register business owner
  console.log('\n2. Register business owner');
  r = await req('/api/auth/register', 'POST', {
    email, password: 'StrongPass123!', firstName: 'Ade', lastName: 'Bello',
    kind: 'business', businessName: 'HTTP Test Biz', businessSlug: 'http-test-biz',
  });
  const cookies = r.setCookie || '';
  ok('returns 201', r.status === 201, `status=${r.status} body=${JSON.stringify(r.data)}`);
  ok('response has user', !!r.data?.user?.id);
  ok('response has businessId', !!r.data?.businessId);
  ok('sets session cookie', cookies.includes('shopora_session='));
  ok('sets refresh cookie', cookies.includes('shopora_refresh='));

  // 3. Health WITH session cookie
  console.log('\n3. /api/health with session');
  // Extract cookies from set-cookie
  let cookieHeader = (r.setCookie || '').replace(/;[\s\S]*$/g, '');
  r = await req('/api/health', 'GET', undefined, { cookie: cookieHeader });
  ok('businessId now resolved (not null)', !!r.data?.businessId, JSON.stringify(r.data));
  ok('authenticated=true', r.data?.authenticated === true);
  ok('role=business_user', r.data?.role === 'business_user');
  ok('businessRole=Owner', r.data?.businessRole === 'Owner');
  ok('permissions includes products.write', Array.isArray(r.data?.permissions) && r.data.permissions.includes('products.write'));

  // 4. /api/auth/me with session
  console.log('\n4. /api/auth/me with session');
  r = await req('/api/auth/me', 'GET', undefined, { cookie: cookieHeader });
  ok('returns 200', r.status === 200, `status=${r.status}`);
  ok('returns user email', r.data?.user?.email === email);
  ok('returns business name', r.data?.business?.name === 'HTTP Test Biz');
  ok('returns businessRole Owner', r.data?.businessRole === 'Owner');

  // 5. /api/auth/me WITHOUT session → 401
  console.log('\n5. /api/auth/me without session → 401');
  r = await req('/api/auth/me');
  ok('returns 401', r.status === 401, `status=${r.status}`);

  // 6. Login flow
  console.log('\n6. Login');
  r = await req('/api/auth/login', 'POST', { email, password: 'StrongPass123!' });
  ok('login returns 200', r.status === 200, `status=${r.status}`);
  ok('login sets session cookie', (r.setCookie||'').includes('shopora_session='));
  cookieHeader = (r.setCookie || '').replace(/;[\s\S]*$/g, '');
  r = await req('/api/health', 'GET', undefined, { cookie: cookieHeader });
  ok('health after login resolves businessId', !!r.data?.businessId);

  // 7. Wrong password → rejected
  console.log('\n7. Login wrong password');
  r = await req('/api/auth/login', 'POST', { email, password: 'WrongPass123!' });
  ok('wrong password rejected (400)', r.status === 400, `status=${r.status}`);

  // 8. forgoo-password (dev) → returns reset link
  console.log('\n8. Forgot password');
  r = await req('/api/auth/forgot-password', 'POST', { email });
  ok('forgot-password returns 200', r.status === 200, `status=${r.status}`);
  ok('returns safe message', !!r.data?.message, JSON.stringify(r.data));
  let token;
  const resetUrl = r.data?._dev_resetUrl;
  if (typeof resetUrl === 'string' && resetUrl.includes('token=')) {
    token = resetUrl.split('token=')[1]?.split('&')[0];
    ok('dev reset link returned (NODE_ENV!=production)', !!token);
  } else {
    console.log('  SKIP  dev link (production server suppresses it) — reset token must come from console/DB');
  }

  // 9. Reset password with token
  console.log('\n9. Reset password');
  if (token) {
    r = await req('/api/auth/reset-password', 'POST', { token, password: 'NewStrongPass456!' });
    ok('reset-password returns 200', r.status === 200, `status=${r.status} body=${JSON.stringify(r.data)}`);

    // 10. Login with NEW password
    console.log('\n10. Login with new password');
    r = await req('/api/auth/login', 'POST', { email, password: 'NewStrongPass456!' });
    ok('login with new password succeeds', r.status === 200, `status=${r.status}`);
    cookieHeader = (r.setCookie || '').replace(/;[\s\S]*$/g, '');
    r = await req('/api/auth/me', 'GET', undefined, { cookie: cookieHeader });
    ok('me after reset works', r.status === 200 && r.data?.user?.email === email);
  } else {
    console.log('  SKIP  reset-password + new-password login (no dev reset token available in production mode)');
  }

  // 11. Logout
  console.log('\n11. Logout');
  r = await req('/api/auth/logout', 'POST', undefined, { cookie: cookieHeader });
  ok('logout returns 204', r.status === 204, `status=${r.status}`);

  // 12. Register duplicate email → 409
  console.log('\n12. Duplicate email');
  r = await req('/api/auth/register', 'POST', {
    email, password: 'AnotherPass123!', firstName: 'X', lastName: 'Y', kind: 'customer',
  });
  ok('duplicate email rejected (409)', r.status === 409, `status=${r.status}`);

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ALL HTTP CHECKS PASSED =='));
  if (failed) process.exit(1);
}

main().catch(e => { console.error('HTTP test crashed:', e); process.exit(1); });
