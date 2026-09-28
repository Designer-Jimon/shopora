// SHOPORA — shared (de)serializer for StorefrontDesign rows.
//
// Converts a Prisma row into a stable API shape. Secrets/not-needed columns are
// omitted (metadata is reserved for Part 2 — currently discarded client-side).
// canvas/elements are stored as JSONB and returned as structured objects.

import type { StorefrontDesign } from '@prisma/client';
import type { StorefrontCanvas, StorefrontElement } from './types';

export type DesignDto = {
  id: string;
  businessId: string;
  name: string;
  status: string;
  canvas: StorefrontCanvas;
  elements: StorefrontElement[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeDesign(row: StorefrontDesign): DesignDto {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    status: row.status,
    canvas: row.canvas as unknown as StorefrontCanvas,
    elements: row.elements as unknown as StorefrontElement[],
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}