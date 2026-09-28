'use client';

// Storefront Design Studio editor — the single-page composition surface:
//   • canvas (add/select/drag layers, zoom, background)
//   • layers panel (stack reorder / duplicate / delete)
//   • properties panel (position, size, rotation, opacity + per-type styling)
//   • undo/redo (full-document snapshot stack, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
//   • save via POST (new) / PATCH (existing) — server authoritative.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DesignCanvas, { type PanTarget } from './DesignCanvas';
import LayersPanel from './LayersPanel';
import PropertiesPanel from './PropertiesPanel';
import DevicePreview from './DevicePreview';
import { IconText, IconImage, IconShape, IconCircle, IconLine, IconButton, IconLogo, IconUndo, IconRedo, IconCheck } from './icons';
import { createDesign, updateDesign } from './design-api';
import { applyTemplate } from '@/lib/storefront-design/templates';
import {
  uid,
  reindexZ,
  blankDoc,
  ELEMENT_LIMITS,
  clampFocal,
  clampZoom,
  type DeviceId,
  type DeviceOverride,
  type StorefrontCanvas,
  type StorefrontDesignDoc,
  type StorefrontElement,
  type ElementType,
} from '@/lib/storefront-design/types';
import type { DesignDto } from '@/lib/storefront-design/serialize';

type Props = {
  design: DesignDto | null;
  templateId: string | null;
  /** Target for the "Preview" link: the storefront with draft-preview enabled. */
  previewUrl?: string;
};

const HISTORY_CAP = 50;

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
type ViewMode = 'edit' | 'desktop' | 'tablet' | 'mobile';

function elementDefaults(type: ElementType, canvas: StorefrontCanvas): StorefrontElement {
  const cx = () => Math.round(canvas.width / 2);
  const cy = () => Math.round(canvas.height / 2);
  switch (type) {
    case 'text':
      return {
        id: uid(), type, x: Math.round(canvas.width * 0.1), y: cy() - 80,
        width: Math.round(canvas.width * 0.8), height: 160, rotation: 0, opacity: 100, zIndex: 0,
        text: 'Your headline', fontSize: 64, fontWeight: 800,
        fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", textAlign: 'center', color: '#1A1A1A',
      };
    case 'image':
      return { id: uid(), type, x: cx() - 150, y: cy() - 110, width: 300, height: 220, rotation: 0, opacity: 100, zIndex: 0, imageUrl: undefined, objectFit: 'cover' };
    case 'logo':
      return { id: uid(), type, x: cx() - 60, y: cy() - 60, width: 120, height: 120, rotation: 0, opacity: 100, zIndex: 0, imageUrl: undefined, objectFit: 'contain' };
    case 'button':
      return {
        id: uid(), type, x: cx() - 100, y: canvas.height - 130, width: 200, height: 58, rotation: 0, opacity: 100, zIndex: 0,
        text: 'Shop now', fontSize: 20, fontWeight: 700,
        fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", textAlign: 'center', color: '#FFFFFF',
        backgroundColor: '#722F37', borderRadius: 10, shape: 'rounded',
      };
    case 'shape':
      return { id: uid(), type, x: cx() - 100, y: cy() - 60, width: 200, height: 120, rotation: 0, opacity: 100, zIndex: 0, shape: 'rectangle', backgroundColor: '#E5E7EB' };
    default:
      return { id: uid(), type, x: 100, y: 100, width: 100, height: 50, rotation: 0, opacity: 100, zIndex: 0 };
  }
}

export default function DesignEditor({ design, templateId, previewUrl }: Props) {
  const router = useRouter();

  const [name, setName] = useState(design?.name ?? 'Untitled design');
  const [doc, setDoc] = useState<StorefrontDesignDoc>(
    design?.canvas && design?.elements
      ? { canvas: design.canvas, elements: design.elements }
      : templateId
        ? applyTemplate(templateId) ?? blankDoc()
        : blankDoc(),
  );
  const [status, setStatus] = useState(design?.status ?? 'draft');
  const [view, setView] = useState<ViewMode>('edit');
  const [showGuides, setShowGuides] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pan, setPan] = useState<PanTarget>(null);
  const [past, setPast] = useState<StorefrontDesignDoc[]>([]);
  const [future, setFuture] = useState<StorefrontDesignDoc[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);

  const docRef = useRef(doc);
  docRef.current = doc;
  const designIdRef = useRef<string | null>(design?.id ?? null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const dragBaseRef = useRef<StorefrontDesignDoc | null>(null);

  useEffect(() => {
    if (design?.name) setName(design.name);
    if (design?.status) setStatus(design.status);
    if (design?.id) designIdRef.current = design.id;
  }, [design?.id, design?.name, design?.status]);

  // ------------------------------------------------------------------
  // History primitives
  // ------------------------------------------------------------------
  const apply = (mutator: (d: StorefrontDesignDoc) => StorefrontDesignDoc, opts: { history?: boolean } = {}) => {
    const history = opts.history ?? true;
    setDoc((prev) => {
      const mutated = mutator(prev);
      const next = { ...mutated, elements: reindexZ(mutated.elements) };
      if (history) {
        setPast((p) => [...p.slice(-(HISTORY_CAP - 1)), prev]);
        setFuture([]);
      }
      return next;
    });
    setSaveState('dirty');
  };

  const undo = () => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [docRef.current, ...f].slice(0, HISTORY_CAP));
      setDoc(prev);
      return p.slice(0, -1);
    });
    setSaveState('dirty');
  };

  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, docRef.current].slice(-HISTORY_CAP));
      setDoc(next);
      return f.slice(1);
    });
    setSaveState('dirty');
  };

  // ------------------------------------------------------------------
  // Element operations
  // ------------------------------------------------------------------
  const patchSelected = (patch: Partial<StorefrontElement>) => {
    const id = selectedIdRef.current;
    if (!id) return;
    apply((d) => ({
      ...d,
      elements: d.elements.map((el) => {
        if (el.id !== id) return el;
        const fx = patch.focalX !== undefined ? clampFocal(patch.focalX, 50) : el.focalX;
        const fy = patch.focalY !== undefined ? clampFocal(patch.focalY, 50) : el.focalY;
        return {
          ...el,
          ...patch,
          x: patch.x ?? el.x,
          y: patch.y ?? el.y,
          rotation: patch.rotation ?? el.rotation,
          opacity: patch.opacity ?? el.opacity,
          width: patch.width !== undefined ? Math.max(ELEMENT_LIMITS.minSize, patch.width) : el.width,
          height: patch.height !== undefined ? Math.max(ELEMENT_LIMITS.minSize, patch.height) : el.height,
          zoom: patch.zoom !== undefined ? clampZoom(patch.zoom, 100) : el.zoom,
          ...(fx !== undefined ? { focalX: fx } : {}),
          ...(fy !== undefined ? { focalY: fy } : {}),
        };
      }),
    }));
  };

  /** Select an element (clearing any focal-pan target that points elsewhere). */
  const selectElement = (id: string | null) => {
    setSelectedId(id);
    setPan((p) => (p && p.type === 'element' && p.id === id ? p : null));
  };

  const onPanElement = (id: string, focalX: number, focalY: number) => {
    if (!dragBaseRef.current) dragBaseRef.current = docRef.current;
    setDoc((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, focalX: clampFocal(focalX, 50), focalY: clampFocal(focalY, 50) } : el)),
    }));
    setSaveState('dirty');
  };

  const onPanBackground = (focalX: number, focalY: number) => {
    if (!dragBaseRef.current) dragBaseRef.current = docRef.current;
    setDoc((prev) => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        background: { ...prev.canvas.background, focalX: clampFocal(focalX, 50), focalY: clampFocal(focalY, 50) },
      },
    }));
    setSaveState('dirty');
  };

  const onZoomElement = (id: string, zoom: number) => {
    apply((d) => ({
      ...d,
      elements: d.elements.map((el) => (el.id === id ? { ...el, zoom: clampZoom(zoom, 100) } : el)),
    }));
  };

  const onZoomBackground = (zoom: number) => {
    apply((d) => ({
      ...d,
      canvas: {
        ...d.canvas,
        background: { ...d.canvas.background, zoom: clampZoom(zoom, 100) },
      },
    }));
  };

  const enterPan = (target: { type: 'element'; id: string } | { type: 'background' }) => {
    if (target.type === 'element') setSelectedId(target.id);
    setPan(target);
  };

  const addElement = (type: ElementType) => {
    const offset = (docRef.current.elements.length % 8) * 14;
    const el = elementDefaults(type, docRef.current.canvas);
    el.x += offset;
    el.y += offset;
    apply((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  };

  const deleteSelected = () => {
    const id = selectedIdRef.current;
    if (!id) return;
    apply((d) => ({ ...d, elements: d.elements.filter((el) => el.id !== id) }));
    setSelectedId(null);
    setPan((p) => (p && p.type === 'element' && p.id === id ? null : p));
  };

  const duplicateSelected = () => {
    const id = selectedIdRef.current;
    if (!id) return;
    const src = docRef.current.elements.find((el) => el.id === id);
    if (!src) return;
    const copy = { ...JSON.parse(JSON.stringify(src)), id: uid(), x: src.x + 16, y: src.y + 16 };
    apply((d) => {
      const i = d.elements.findIndex((el) => el.id === id);
      if (i < 0) return d;
      const next = [...d.elements];
      next.splice(i + 1, 0, copy);
      return { ...d, elements: next };
    });
    setSelectedId(copy.id);
  };

  const moveLayer = (id: string, dir: 1 | -1) => {
    apply((d) => {
      const i = d.elements.findIndex((el) => el.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.elements.length) return d;
      const next = [...d.elements];
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return { ...d, elements: next };
    });
  };

  const onMove = (id: string, x: number, y: number) => {
    if (!dragBaseRef.current) dragBaseRef.current = docRef.current;
    setDoc((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, x, y } : el)),
    }));
    setSaveState('dirty');
  };

  const onResize = (id: string, g: { x: number; y: number; width: number; height: number }) => {
    if (!dragBaseRef.current) dragBaseRef.current = docRef.current;
    setDoc((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.id === id
          ? {
              ...el,
              x: g.x,
              y: g.y,
              width: Math.max(ELEMENT_LIMITS.minSize, g.width),
              height: Math.max(ELEMENT_LIMITS.minSize, g.height),
            }
          : el,
      ),
    }));
    setSaveState('dirty');
  };

  const onMoveEnd = () => {
    if (dragBaseRef.current) {
      setPast((p) => [...p.slice(-(HISTORY_CAP - 1)), dragBaseRef.current as StorefrontDesignDoc]);
      setFuture([]);
      dragBaseRef.current = null;
    }
  };

  const patchCanvas = (patch: Partial<StorefrontCanvas>, bgPatch?: Partial<{ type: 'color' | 'image'; color: string; imageUrl: string | null; focalX: number; focalY: number; zoom: number }>) => {
    apply((d) => {
      const mergedBg = bgPatch
        ? {
            ...d.canvas.background,
            ...bgPatch,
            focalX: bgPatch.focalX !== undefined ? clampFocal(bgPatch.focalX, 50) : d.canvas.background.focalX,
            focalY: bgPatch.focalY !== undefined ? clampFocal(bgPatch.focalY, 50) : d.canvas.background.focalY,
            zoom: bgPatch.zoom !== undefined ? clampZoom(bgPatch.zoom, 100) : d.canvas.background.zoom,
            imageUrl: bgPatch.imageUrl === null ? undefined : bgPatch.imageUrl ?? d.canvas.background.imageUrl,
          }
        : d.canvas.background;
      return { ...d, canvas: { ...d.canvas, ...patch, background: mergedBg } };
    });
  };

  // ------------------------------------------------------------------
  // Keyboard shortcuts
  // ------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Escape') {
        setPan(null);
        return;
      }
      const id = selectedIdRef.current;
      if (!id) return;
      const step = e.shiftKey ? 10 : 1;
      const el = docRef.current.elements.find((x) => x.id === id);
      if (!el) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onMove(id, el.x - step, el.y); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onMove(id, el.x + step, el.y); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onMove(id, el.x, el.y - step); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); onMove(id, el.x, el.y + step); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        apply((d) => ({ ...d, elements: d.elements.filter((x) => x.id !== id) }));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Responsive overrides (Part 2)
  // ------------------------------------------------------------------

  // A pan target that no longer exists (layer deleted, undo of a delete) must
  // not leave the canvas zoom HUD pointing at nothing.
  useEffect(() => {
    setPan((p) => {
      if (!p || p.type !== 'element') return p;
      return docRef.current.elements.some((el) => el.id === p.id) ? p : null;
    });
  }, [doc.elements]);

  const patchOverride = (device: DeviceId, patch: Partial<DeviceOverride>) => {
    const id = selectedIdRef.current;
    if (!id) return;
    apply((d) => ({
      ...d,
      elements: d.elements.map((el) =>
        el.id === id
          ? { ...el, responsive: { ...el.responsive, [device]: { ...el.responsive?.[device], ...patch } } }
          : el,
      ),
    }));
  };

  const resetOverride = (device: DeviceId) => {
    const id = selectedIdRef.current;
    if (!id) return;
    apply((d) => ({
      ...d,
      elements: d.elements.map((el) => {
        if (el.id !== id || !el.responsive) return el;
        const next = { ...el.responsive };
        delete next[device];
        return { ...el, responsive: Object.keys(next).length > 0 ? next : undefined };
      }),
    }));
  };

  // ------------------------------------------------------------------
  // Save / publish flow
  // ------------------------------------------------------------------
  /**
   * Commit the document (and optionally flip status) to the server. For a new
   * design this creates it first (getting its id) then PATCHes the status.
   */
  const commit = async (opts: { status?: 'draft' | 'published' }) => {
    setSaveState('saving');
    setSaveError(null);
    try {
      const docToSave = { canvas: docRef.current.canvas, elements: reindexZ(docRef.current.elements) };
      if (designIdRef.current) {
        const updated = await updateDesign(designIdRef.current, { name, doc: docToSave, ...(opts.status ? { status: opts.status } : {}) });
        designIdRef.current = updated.id;
        setStatus(updated.status);
      } else if (opts.status) {
        const created = await createDesign({ name, doc: docToSave });
        designIdRef.current = created.id;
        window.history.replaceState(null, '', `/store/appearance/design?id=${created.id}`);
        const updated = await updateDesign(created.id, { status: opts.status });
        setStatus(updated.status);
        setDoc({ canvas: updated.canvas, elements: updated.elements });
      } else {
        const created = await createDesign({ name, doc: docToSave });
        designIdRef.current = created.id;
        window.history.replaceState(null, '', `/store/appearance/design?id=${created.id}`);
        setStatus(created.status);
      }
      setSaveState('saved');
      router.refresh();
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Could not save the design');
    }
  };

  const save = () => commit({});

  const publish = () => {
    if (!window.confirm(`Publish "${name || 'Untitled design'}" to your live storefront?`)) return;
    commit({ status: 'published' });
  };

  const unpublish = () => {
    if (!window.confirm('Take this design offline? Your storefront will fall back to its default hero.')) return;
    commit({ status: 'draft' });
  };

  const selectedEl = selectedId ? doc.elements.find((el) => el.id === selectedId) ?? null : null;
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const ADD_ITEMS: { label: string; type: ElementType | 'shape:rounded' | 'shape:circle' | 'shape:line'; icon: ReactNode }[] = [
    { label: 'Text', type: 'text', icon: <IconText className="h-4 w-4" /> },
    { label: 'Image', type: 'image', icon: <IconImage className="h-4 w-4" /> },
    { label: 'Logo', type: 'logo', icon: <IconLogo className="h-4 w-4" /> },
    { label: 'Button', type: 'button', icon: <IconButton className="h-4 w-4" /> },
    { label: 'Rectangle', type: 'shape', icon: <IconShape className="h-4 w-4" /> },
    { label: 'Rounded', type: 'shape:rounded', icon: <IconShape className="h-4 w-4" /> },
    { label: 'Circle', type: 'shape:circle', icon: <IconCircle className="h-4 w-4" /> },
    { label: 'Line', type: 'shape:line', icon: <IconLine className="h-4 w-4" /> },
  ];

  const addFromMenu = (t: (typeof ADD_ITEMS)[number]['type']) => {
    if (t === 'shape:rounded' || t === 'shape:circle' || t === 'shape:line') {
      const shape: StorefrontElement['shape'] = t === 'shape:rounded' ? 'rounded' : t === 'shape:circle' ? 'circle' : 'line';
      apply((d) => {
        const base: StorefrontElement = elementDefaults('shape', d.canvas);
        const offset = (d.elements.length % 8) * 14;
        base.x += offset;
        base.y += offset;
        const el: StorefrontElement = {
          ...base,
          shape,
          ...(shape === 'rounded' ? { borderRadius: 16 } : shape === 'line' ? { width: 260, height: 16, backgroundColor: '#1A1A1A' } : {}),
        };
        setTimeout(() => setSelectedId(el.id), 0);
        return { ...d, elements: [...d.elements, el] };
      });
      return;
    }
    addElement(t as ElementType);
  };

  const VIEW_TABS: { id: ViewMode; label: string }[] = [
    { id: 'edit', label: 'Edit' },
    { id: 'desktop', label: 'Desktop' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'mobile', label: 'Mobile' },
  ];
  const activeDevice: DeviceId | null = view === 'tablet' || view === 'mobile' ? view : null;

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <Link
          href="/store/appearance"
          className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-tint,#F9FAFB)] hover:text-[var(--color-text)]"
        >
          ← Designs
        </Link>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-44 rounded-md border border-transparent px-2 py-1 text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
          aria-label="Design name"
        />
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            status === 'published'
              ? 'bg-green-100 text-green-700'
              : 'bg-[var(--color-tint,#F0F0F2)] text-[var(--color-text-muted)]'
          }`}
          data-sf-status={status}
        >
          {status === 'published' ? 'Published' : 'Draft'}
        </span>

        <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-text)] hover:border-[var(--color-primary)]"
          >
            + Add layer
          </button>
          {addOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-[var(--color-border)] bg-white p-1 shadow-lg">
              {ADD_ITEMS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    addFromMenu(item.type);
                    setAddOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-tint,#F9FAFB)]"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="rounded-md border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
          >
            <IconUndo className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="rounded-md border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
          >
            <IconRedo className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />

        <select
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-semibold text-[var(--color-text)]"
          aria-label="Zoom"
        >
          <option value={0}>Fit</option>
          <option value={100}>100%</option>
          <option value={75}>75%</option>
          <option value={50}>50%</option>
        </select>

        <div className="flex items-center overflow-hidden rounded-md border border-[var(--color-border)]">
          {VIEW_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              title={t.id === 'edit' ? 'Interactive canvas (desktop/master values)' : `Preview at ${t.label} width`}
              className={`px-2.5 py-1.5 text-xs font-bold transition ${
                view === t.id
                  ? 'bg-[var(--color-primary,#722F37)] text-white'
                  : 'bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-tint,#F9FAFB)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view === 'edit' && (
          <button
            type="button"
            onClick={() => setShowGuides((v) => !v)}
            title="Toggle the safe-zone guide band"
            className={`rounded-md border px-2.5 py-1.5 text-xs font-bold transition ${
              showGuides
                ? 'border-[var(--color-primary)] bg-[var(--color-tint,#F9FAFB)] text-[var(--color-primary)]'
                : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-tint,#F9FAFB)]'
            }`}
          >
            Safe zone
          </button>
        )}

        <div className="flex-1" />

        {saveState === 'error' && saveError && (
          <span className="max-w-56 truncate rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700" title={saveError}>
            {saveError}
          </span>
        )}
        {previewUrl && (
          <Link
            href={previewUrl}
            target="_blank"
            title="Open on the live storefront (draft preview visible to you only)"
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
          >
            Preview
          </Link>
        )}
        {status === 'published' ? (
          <button
            type="button"
            onClick={unpublish}
            disabled={saveState === 'saving'}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold text-[var(--color-text)] transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            onClick={publish}
            disabled={saveState === 'saving'}
            className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Publish
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saveState === 'saving'}
          className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: 'var(--color-primary)' }}
        >
          {saveState === 'saving' ? (
            'Saving…'
          ) : saveState === 'saved' ? (
            <>
              <IconCheck className="h-3.5 w-3.5" /> Saved
            </>
          ) : (
            'Save draft'
          )}
        </button>
      </div>

      {/* Work area */}
      <div className="flex min-h-0 flex-1">
        <LayersPanel
          elements={doc.elements}
          selectedId={selectedId}
          onSelect={selectElement}
          onMoveUp={(id) => moveLayer(id, 1)}
          onMoveDown={(id) => moveLayer(id, -1)}
          onDuplicate={duplicateSelected}
          onDelete={(id) => {
            if (selectedId === id) setSelectedId(null);
            setPan((p) => (p && p.type === 'element' && p.id === id ? null : p));
            apply((d) => ({ ...d, elements: d.elements.filter((el) => el.id !== id) }));
          }}
          onFocusImage={(id) => enterPan({ type: 'element', id })}
          focusedImageId={pan?.type === 'element' ? pan.id : null}
        />
        {view === 'edit' ? (
          <DesignCanvas
            canvas={doc.canvas}
            elements={doc.elements}
            selectedId={selectedId}
            onSelect={selectElement}
            onMove={onMove}
            onResize={onResize}
            onMoveEnd={onMoveEnd}
            zoom={zoom}
            showGuides={showGuides}
            pan={pan}
            onPanElement={onPanElement}
            onPanBackground={onPanBackground}
            onEnterPan={enterPan}
            onZoomElement={onZoomElement}
            onZoomBackground={onZoomBackground}
          />
        ) : (
          <DevicePreview doc={doc} device={view} />
        )}
        <PropertiesPanel
          selection={selectedEl}
          canvas={doc.canvas}
          onElementChange={patchSelected}
          onCanvasChange={patchCanvas}
          onMoveUp={() => selectedId && moveLayer(selectedId, 1)}
          onMoveDown={() => selectedId && moveLayer(selectedId, -1)}
          onDuplicate={duplicateSelected}
          onDelete={deleteSelected}
          device={activeDevice}
          onOverrideChange={patchOverride}
          onOverrideReset={resetOverride}
          pan={pan}
          onStartPanBackground={() => enterPan({ type: 'background' })}
          onStartPanElement={() => selectedId && enterPan({ type: 'element', id: selectedId })}
        />
      </div>
    </div>
  );
}