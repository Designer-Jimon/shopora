'use client';

// Client-side helpers for the /api/storefront-designs surface + design image
// uploads. The server is the source of truth (tenant scope, permissions,
// sanitization) — the editor just round-trips structured JSON.

import type { DesignDto } from '@/lib/storefront-design/serialize';
import type { StorefrontDesignDoc } from '@/lib/storefront-design/types';

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && typeof (data as Record<string, unknown>).error === 'string'
        ? (data as { error: string }).error
        : null) ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function createDesign(payload: { name?: string; templateId?: string; doc?: StorefrontDesignDoc }) {
  const body: Record<string, unknown> = { name: payload.name };
  if (payload.templateId) body.templateId = payload.templateId;
  if (payload.doc) {
    body.canvas = payload.doc.canvas;
    body.elements = payload.doc.elements;
  }
  const res = await fetch('/api/storefront-designs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse<DesignDto>(res);
}

export async function updateDesign(
  id: string,
  patch: { name?: string; doc?: StorefrontDesignDoc; status?: 'draft' | 'published' },
) {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.doc) {
    body.canvas = patch.doc.canvas;
    body.elements = patch.doc.elements;
  }
  if (patch.status) body.status = patch.status;
  const res = await fetch(`/api/storefront-designs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse<DesignDto>(res);
}

export async function deleteDesign(id: string) {
  const res = await fetch(`/api/storefront-designs/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      (data && typeof data === 'object' && 'error' in data && typeof (data as Record<string, unknown>).error === 'string'
        ? (data as { error: string }).error
        : null) ?? `Delete failed (${res.status})`;
    throw new Error(msg);
  }
}

export async function uploadDesignImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', 'design');
  const res = await fetch('/api/businesses/upload', { method: 'POST', body: form });
  const data = await parse<{ url: string }>(res);
  return data.url;
}