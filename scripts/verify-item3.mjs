// Item 3 test — one email = one account, permanently.
//  a) API-level: duplicate + case-variant registrations are rejected (409).
//  b) DB-level: even a raw insert of the same (or case-variant) email fails
//     with P2002 on the unique index — the API check can't be bypassed.
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
  return { status: res.status, data };
}

const STAMP = Date.now();
const EMAIL = `email-uniq-${STAMP}@shopora.dev`;

async function register(email, password = 'EmailTest123!') {
  return req('/api/auth/register', 'POST', {
    email, password, firstName: 'Em', lastName: 'Uniq', kind: 'business', businessName: `Email Uniq ${STAMP}`,
  });
}

(async () => {
  console.log('== Item 3: one email = one account ==\n');

  console.log('1. API-level rejection');
  const first = await register(EMAIL);
  ok('first registration 201', first.status === 201, `status=${first.status} ${JSON.stringify(first.data)}`);
  const dup = await register(EMAIL);
  ok('duplicate email rejected (409) by API', dup.status === 409, `status=${dup.status} ${JSON.stringify(dup.data)}`);
  const caseVariant = await register('Email-Uniq-' + STAMP + '@Shopora.Dev');
  ok('case-variant email rejected (409) — API lowercases', caseVariant.status === 409, `status=${caseVariant.status} ${JSON.stringify(caseVariant.data)}`);

  console.log('\n2. DB-level rejection (bypassing the API entirely)');
  let dbDupCode = null;
  try {
    await prisma.user.create({ data: { email: EMAIL, passwordHash: 'x', firstName: 'D', lastName: 'B' } });
  } catch (e) {
    dbDupCode = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : e?.code;
  }
  ok('raw DB duplicate insert blocked (P2002 on User_email_key)', dbDupCode === 'P2002', `got=${dbDupCode}`);

  let dbCiCode = null;
  try {
    await prisma.user.create({ data: { email: 'Email-Uniq-' + STAMP + '@Shopora.Dev', passwordHash: 'x', firstName: 'D', lastName: 'B' } });
  } catch (e) {
    dbCiCode = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : e?.code;
  }
  ok('raw DB case-variant insert blocked (P2002 on User_email_ci_key)', dbCiCode === 'P2002', `got=${dbCiCode}`);

  console.log('\n3. Constraints exist at the database');
  const emailIdx = await prisma.$queryRawUnsafe(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='User' AND indexdef ILIKE '%email%' ORDER BY indexname`
  );
  const names = emailIdx.map((i) => i.indexname).join(', ');
  ok('User_email_key (case-sensitive) present', names.includes('User_email_key'), names);
  ok('User_email_ci_key (case-insensitive) present', names.includes('User_email_ci_key'), names);

  // cleanup
  await prisma.businessStaff.deleteMany({ where: { user: { email: EMAIL } } });
  await prisma.business.deleteMany({ where: { name: `Email Uniq ${STAMP}` } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  console.log('\n' + (failed ? '== SOME CHECKS FAILED ==' : '== ITEM 3 VERIFICATION PASSED =='));
})().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect(); });