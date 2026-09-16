// SHOPORA — POST /api/auth/forgot-password
// Generates a reset token, stores its hash on the user record, and logs the
// reset link to the server console. In development mode, the resetUrl is also
// returned in the response for easy testing.
//
// LIMITATION: No email provider is wired yet. In production this will send
// a real email; for now the link is console-logged + dev-response only.

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { jsonOk, authErrors } from '@/lib/http';
import { generateResetToken, hashResetToken } from '@/lib/auth/password';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const { email } = body;
  if (!email || typeof email !== 'string') return authErrors.badRequest('Email is required');

  const normalizedEmail = email.trim().toLowerCase();

  // Always return the same response regardless of whether user exists,
  // to prevent email enumeration.
  const SAFE_RESPONSE = jsonOk({
    message: 'If an account with that email exists, a password reset link has been sent.',
  });

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return SAFE_RESPONSE;

  // Generate token
  const resetToken = generateResetToken();
  const resetTokenHash = await hashResetToken(resetToken);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: resetTokenHash,
      passwordResetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });

  // Build reset URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

  // Log to server console (placeholder for email send)
  console.log(
    '\n[SHOPORA DEV] Password reset link (email delivery not yet wired):',
    '\n', resetUrl,
    '\n',
  );

  // In dev only, include the URL in the response for testing convenience.
  // This MUST NOT be present in production.
  if (process.env.NODE_ENV !== 'production') {
    return jsonOk({
      message: 'If an account with that email exists, a password reset link has been sent.',
      _dev_resetUrl: resetUrl,
    });
  }

  return SAFE_RESPONSE;
}
