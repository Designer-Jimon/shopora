// SHOPORA validation helpers — small, zero-dependency validation for API inputs.
// Kept intentionally lean (no zod) to avoid adding another dep for simple checks.

export type ValidationError = {
  field: string;
  message: string;
};

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string') return 'Email is required';
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return 'Email is required';
  if (!EMAIL_RE.test(trimmed)) return 'Invalid email address';
  return null; // valid
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export function validateRequired(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return `${field} is required`;
  if (typeof value === 'string' && !value.trim()) return `${field} is required`;
  return null;
}

export function validateSlug(slug: unknown): string | null {
  if (typeof slug !== 'string') return 'Slug is required';
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) return 'Slug is required';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(trimmed)) {
    return 'Slug must be lowercase alphanumeric with hyphens, starting and ending with a letter or number';
  }
  if (trimmed.length < 2 || trimmed.length > 63) return 'Slug must be between 2 and 63 characters';
  return null;
}

/** Simple slug generator from a name string. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildValidationResult(errors: ValidationError[]): ValidationResult {
  if (errors.length === 0) return { ok: true };
  return { ok: false, errors };
}
