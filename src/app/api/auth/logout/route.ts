// SHOPORA — POST /api/auth/logout
// Clears session cookies. Stateless JWT means no server-side revocation needed
// for logout; the short-lived access token expires on its own. Revocation
// of suspended users is handled by the DB checks in resolveSession().

import { jsonNoContent } from '@/lib/http';
import { clearSessionCookies } from '@/lib/auth/session';

export async function POST() {
  return clearSessionCookies(jsonNoContent());
}
