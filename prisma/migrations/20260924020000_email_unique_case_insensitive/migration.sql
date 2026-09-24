-- SHOPORA — Phase 12 hardening: email addresses are unique case-insensitively.
--
-- The existing "User_email_key" unique index is case-SENSITIVE (PostgreSQL
-- btree default). The application already lowercases on every write path
-- (register, staff invite, admin grant, seed-admin), but "one email = one
-- account, regardless of which path creates the user" is only airtight at the
-- database if a raw/scripted INSERT of a case-variant (e.g. 'A@b.com' beside
-- 'a@b.com') is also rejected. This functional unique index closes that gap.
--
-- Safety: a scan before shipping confirmed ZERO case-variant duplicate emails
-- exist, so the index builds cleanly on any existing environment. It is purely
-- additive — Prisma's schema keeps the case-sensitive @unique too.

CREATE UNIQUE INDEX "User_email_ci_key" ON "User" (lower("email"));