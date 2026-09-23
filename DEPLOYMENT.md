# SHOPORA — Production Deployment

Target: a **single Node.js instance** (Render blueprints, Docker on any VPS, Railway/Fly). The app is
deliberately not scaled horizontal: the auth rate limiter (`src/lib/rate-limit.ts`) and the Paystack
ledger are in-process, so **keep it to one instance**.

## Quick reference

| Item | Value |
|---|---|
| Runtime | Node 22 (Dockerfile is multi-stage, `node:22-slim`) |
| Database | PostgreSQL (external) — migrations via `npx prisma migrate deploy` |
| Seed (plans, super admin) | `npx tsx prisma/seed-plans.ts`, `npx tsx prisma/seed-admin.ts` |
| Storage | local disk (dev) or Cloudflare R2 (prod) — `STORAGE_DRIVER` |
| Webhook endpoint (Paystack) | `/api/webhooks/paystack` |
| Billing cron | `GET /api/cron/billing?token=<CRON_TOKEN>` |
| Pull-based cron | also `npm run billing:daily` |

## 1. Render (blueprint)

`render.yaml` is in the repo root. Render GUI:
1. **New → Blueprint** and select the repo. It reads `render.yaml`.
2. Create a **Render Postgres**, copy its internal URL into the service's `DATABASE_URL`.
3. Fill every `sync: false` secret: `NEXT_PUBLIC_APP_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
   `KEY_ENCRYPTION_SECRET`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`,
   `CRON_TOKEN`, and the `R2_*` group (or leave `STORAGE_DRIVER=local`).
4. `preDeployCommand: npx prisma migrate deploy` runs DB migrations on each deploy.
5. Set the **health check path** to `/api/health` (already in the blueprint).
6. Paystack dashboard: webhook URL →
   `https://<your-app>.onrender.com/api/webhooks/paystack`.
   Cron: schedule a job that hits
   `https://<your-app>.onrender.com/api/cron/billing?token=<CRON_TOKEN>` once a day.

> ⚠️ With `STORAGE_DRIVER=local`, uploaded files live on the service's **ephemeral disk** and vanish on
> redeploy. For production uploads use R2 (below).

## 2. Docker (anywhere else)

```bash
docker build -t shopora .
docker run -p 3000:3000 --env-file .env.production shopora
```

The container's `CMD` runs `prisma migrate deploy` then `next start`. `.env.production` must contain
`DATABASE_URL`, `JWT_*`, `KEY_ENCRYPTION_SECRET`, `PAYSTACK_*`, `CRON_TOKEN`, `NEXT_PUBLIC_APP_URL`.

## 3. Environment variables

| Variable | Prod-required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Prisma/Postgres DSN |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | yes | session JWT signing (base64url, ≥32 bytes) |
| `KEY_ENCRYPTION_SECRET` | **yes** | AES-256 master key. **App throws at startup without it in production.** |
| `NEXT_PUBLIC_APP_URL` | yes | absolute app URL (reset links, redirects) |
| `PAYSTACK_PUBLIC_KEY` / `PAYSTACK_SECRET_KEY` | yes | platform's Paystack subscription keys |
| `PAYSTACK_WEBHOOK_SECRET` | no | signed webhook verification (falls back to `PAYSTACK_SECRET_KEY`) |
| `CRON_TOKEN` | yes | protects `/api/cron/billing` |
| `LOW_STOCK_THRESHOLD` | no | low-stock badge threshold (default 5) |
| `STORAGE_DRIVER` | yes | `local` or `r2` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | when r2 | bucket + credentials |
| `R2_PUBLIC_BASE_URL` | when r2 | public CDN/custom-domain root, e.g. `https://images.yourdomain.com` |
| `R2_ENDPOINT` | no | override SDK endpoint (other S3-compatible providers) |

## 4. Cloudflare R2 setup

1. Create an **R2 bucket** (`shopora-images`).
2. Create an R2 API token scoped to that bucket (Object Read & Write).
3. Set `STORAGE_DRIVER=r2` + the `R2_*` vars above.
4. Point `R2_PUBLIC_BASE_URL` at a public custom domain (recommended; also enables CDN caching).
   To render these images with Next `<Image>`, the host is **auto-added** to `images.remotePatterns`
   when `R2_PUBLIC_BASE_URL` is present at build time.
5. Uploaded URLs look like `https://R2_PUBLIC_BASE_URL/uploads/<kind>/<yyyy-mm-dd>/<uuid>.<ext>`.
   Callers treat the URL as opaque (see `src/lib/storage.ts`).

## 5. Accepted limitations and phased decisions

- **Webhook/prepayment race (accepted).** `/api/webhooks/paystack` `charge.success` acks 200 and the
  transaction is ledgered via `(event, eventId)` dedupe. A charge that lands *before* the redirect URL
  is returned can invoice early — the ledger + subscription-cashback sweep make this convergent, not
  harmful. Not a go/no-go blocker this phase; revisting at Phase 12 with reconciliation.
- **In-memory rate limiter.** Single-instance scope by design. If you ever scale horizontally, swap
  `src/lib/rate-limit.ts` for a Redis-backed limiter (same call signature).
- **Email delivery not wired.** Forget/reset links are console-logged; `_dev_resetUrl` is dev-only.
  Before external launch, plug an email provider into `/api/auth/forgot-password`.
- **`/uploads` is sandboxed.** `Content-Security-Policy: sandbox` + `default-src 'none'` neutralizes
  stored-XSS via uploaded SVG.

## 6. First-launch checklist

- [ ] `prisma migrate deploy` ran (preDeploy or docker CMD).
- [ ] `npm run db:seed-plans` (subscription plans) and `npm run db:seed-admin` (super admin) executed once.
- [ ] `/api/health` returns `{"service":"shopora-api", ...}` from the deployed origin.
- [ ] Paystack webhook URL + signing secret configured; test subscription via dashboard.
- [ ] `KEY_ENCRYPTION_SECRET` set — app will refuse to start otherwise.
- [ ] Upload a logo + product image; confirm files persist if using R2.