-- SHOPORA — Phase 12 invariant: ONE BUSINESS PER ACCOUNT.
--
-- BusinessStaff.userId becomes UNIQUE, making a user's single business
-- membership unambiguous at the database level. A user can never hold a second
-- BusinessStaff row (Owner or Staff, same or different business) through any
-- path — registration, staff invites, seeds, or direct writes. This is what
-- makes tenant resolution deterministic: the dashboard/token businessId has
-- exactly one membership to resolve, so there is no first-match/fallback
-- ambiguity to guard against.
--
-- Safety: verified before shipping that no User currently holds more than one
-- BusinessStaff row (group-by scan = zero), so this index builds cleanly.

-- Drop the legacy (userId, businessId, roleId) composite uniqueness…
DROP INDEX "BusinessStaff_userId_businessId_roleId_key";

-- …and replace it with a hard unique constraint on userId alone.
CREATE UNIQUE INDEX "BusinessStaff_userId_key" ON "BusinessStaff"("userId");