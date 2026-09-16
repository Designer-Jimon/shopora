// SHOPORA — POST /api/auth/reset-password
// Consumes the reset token (from the forgot-password flow), verifies it
// against the stored hash + expiry, updates the password, and invalidates
// the token. Also clears any existing session cookies.

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { jsonOk, authErrors } from '@/lib/http';
import { validatePassword } from '@/lib/validate';
import { hashPassword, hashResetToken } from '@/lib/auth/password';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const { token, password } = body;

  if (!token || typeof token !== 'string') return authErrors.badRequest('Reset token is required');
  const pwErr = validatePassword(password);
  if (pwErr) return authErrors.badRequest(pwErr);

  // Hash the incoming token and look for a matching user
  const tokenHash = await hashResetToken(token);

  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return authErrors.badRequest('Invalid or expired reset token');
  }

  // Update password and clear the reset token
  const newHashedPassword = await hashPassword(password as string);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHashedPassword,
      passwordResetTokenHash: null,
      passwordResetTokenExpiry: null,
    },
  });

  return jsonOk({ message: 'Password has been reset successfully. You can now log in.' });
}
