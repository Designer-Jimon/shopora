-- SHOPORA backfill — Phase 2 auth fields + Role.name uniqueness.
-- These were declared in schema.prisma during Phase 2/3 but never captured in
-- a migration (the live DB was updated via `db push`). Foldered between the
-- Phase 3 migration and Phase 5 so a clean replay produces a fully consistent
-- schema.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;

-- Role.name is unique in the schema; lift the old non-unique index
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
DROP INDEX IF EXISTS "Role_name_idx";