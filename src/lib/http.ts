// SHOPORA HTTP helpers — small JSON response builders for API routes.

import { NextResponse } from 'next/server';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export function jsonResponse<T>(data: T, status: number): NextResponse {
  return NextResponse.json(data, { status, headers: JSON_HEADERS });
}

export function jsonOk<T>(data: T): NextResponse {
  return jsonResponse(data, 200);
}

export function jsonCreated<T>(data: T): NextResponse {
  return jsonResponse(data, 201);
}

export function jsonNoContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function jsonError(message: string, status: number): NextResponse {
  return jsonResponse({ error: message }, status);
}

export function jsonValidationErrors(
  errors: { field: string; message: string }[],
): NextResponse {
  return jsonResponse({ error: 'Validation failed', errors }, 422);
}

/** JSON error responses for common auth failures. */
export const authErrors = {
  unauthorized:  () => jsonError('Authentication required', 401),
  forbidden:     () => jsonError('Forbidden', 403),
  badRequest:    (msg = 'Bad request') => jsonError(msg, 400),
  conflict:      (msg = 'Already exists') => jsonError(msg, 409),
  notFound:      (msg = 'Not found') => jsonError(msg, 404),
  tooMany:       () => jsonError('Too many requests, try again later', 429),
  serverError:   (msg = 'Internal server error') => jsonError(msg, 500),
} as const;
