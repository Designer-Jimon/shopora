'use client';

// Right-side properties panel. Canvas properties when nothing is selected;
// element properties (geometry, arrange, and type-specific controls) when a
// layer is selected.

import { NumberField, RangeField, ColorField, SelectField, Section, IconButton, FieldRow, GridField, ZoomField } from './fields';
import ImagePicker from './ImagePicker';
import { IconArrowDown, IconArrowUp, IconTrash, IconCopy } from './icons';
import {
  FONT_CHOICES,
  type DeviceId,
  type DeviceOverride,
  type StorefrontCanvas,
  type StorefrontElement,
} from '@/lib/storefront-design/types';
import { DEVICE_LABELS } from '@/lib/storefront-design/responsive';

const FONT_OPTIONS = FONT_CHOICES.map((f) => ({ value: f.family, label: f.label }));
const WEIGHT_OPTIONS = [400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: String(w) }));
const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];
const SHAPE_OPTIONS = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'rounded', label: 'Rounded rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'line', label: 'Line' },
];
const FIT_OPTIONS = [
  { value: 'cover', label: 'Fill (crop)' },
  { value: 'contain', label: 'Contain (fit)' },
];

type BgPatch = Partial<{ type: 'color' | 'image'; color: string; imageUrl: string | null; focalX: number; focalY: number; zoom: number }>;

type Props = {
  selection: StorefrontElement | null;
  canvas: StorefrontCanvas;
  onElementChange: (patch: Partial<StorefrontElement>) => void;
  onCanvasChange: (patch: Partial<StorefrontCanvas>, bgPatch?: BgPatch) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Active responsive breakpoint being authored (never 'desktop' here). */
  device: DeviceId | null;
  onOverrideChange: (device: DeviceId, patch: Partial<DeviceOverride>) => void;
  onOverrideReset: (device: DeviceId) => void;
  /** Active canvas pan target (image-internal focal drag). */
  pan?: { type: 'element'; id: string } | { type: 'background' } | null;
  onStartPanBackground?: () => void;
  onStartPanElement?: () => void;
};

function OptNumber({
  value,
  onChange,
  step = 1,
  min,
  max,
  className = 'w-24',
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      placeholder="Auto"
      className={`${className} rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-right text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none`}
      value={value ?? ''}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const t = e.target.value.trim();
        if (t === '') {
          onChange(undefined);
          return;
        }
        const v = Number(t);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]">
      {ALIGN_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2 py-1 text-[11px] font-semibold transition ${
            value === o.value ? 'bg-[var(--color-primary,#722F37)] text-white' : 'bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-tint,#F9FAFB)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PropertiesPanel(props: Props) {
  const { selection, canvas, onElementChange, onCanvasChange, onMoveUp, onMoveDown, onDuplicate, onDelete, device, onOverrideChange, onOverrideReset, pan, onStartPanBackground, onStartPanElement } = props;
  const bg = canvas.background;

  const changeBg = (patch: BgPatch) => {
    onCanvasChange({}, patch);
  };

  const isPanActive = (kind: 'background' | 'element') => (kind === 'background' ? pan?.type === 'background' : pan?.type === 'element');
  const onActivateFromPanel = (kind: 'background' | 'element') => () => {
    if (kind === 'background') onStartPanBackground?.();
    else onStartPanElement?.();
  };

  const ov = selection && device ? selection.responsive?.[device] : undefined;

  return (
    <div className="flex h-full w-72 flex-col overflow-y-auto border-l border-[var(--color-border)] bg-white">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Properties</h2>
      </div>

      {!selection ? (
        <>
          <Section title="Canvas">
            <FieldRow label="Width">
              <NumberField value={canvas.width} min={800} max={2400} step={20} onChange={(v) => onCanvasChange({ width: v })} />
            </FieldRow>
            <FieldRow label="Height">
              <NumberField value={canvas.height} min={400} max={1600} step={20} onChange={(v) => onCanvasChange({ height: v })} />
            </FieldRow>
            <FieldRow label="Fill">
              {bg.type === 'image' ? (
                <button
                  type="button"
                  onClick={() => changeBg({ type: 'color', imageUrl: null })}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)]"
                >
                  Use color
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => changeBg({ type: 'image' })}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)]"
                >
                  Use image
                </button>
              )}
            </FieldRow>
          </Section>
          {bg.type === 'color' && (
            <Section title="Background colour">
              <ColorField value={bg.color} onChange={(color) => changeBg({ color })} />
            </Section>
          )}
          {bg.type === 'image' && (
            <Section title="Background image">
              <ImagePicker
                value={bg.imageUrl}
                onChange={(imageUrl) => changeBg({ type: 'image', imageUrl })}
                onClear={() => changeBg({ type: 'image', imageUrl: null })}
              />
              {bg.imageUrl && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <GridField label="Focus X">
                    <NumberField value={bg.focalX ?? 50} min={0} max={100} step={5} className="w-full" onChange={(v) => changeBg({ focalX: v })} />
                  </GridField>
                  <GridField label="Focus Y">
                    <NumberField value={bg.focalY ?? 50} min={0} max={100} step={5} className="w-full" onChange={(v) => changeBg({ focalY: v })} />
                  </GridField>
                </div>
              )}
              {bg.imageUrl && (
                <GridField label="Zoom">
                  <ZoomField value={bg.zoom ?? 100} onChange={(v) => changeBg({ zoom: v })} />
                </GridField>
              )}
              <button
                type="button"
                onClick={onActivateFromPanel('background')}
                className={`mt-1 w-full rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  isPanActive('background')
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]'
                }`}
              >
                {isPanActive('background') ? 'Panning background — drag on canvas' : 'Pan background on canvas'}
              </button>
            </Section>
          )}
          <div className="px-4 py-3 text-[11px] text-[var(--color-text-muted)]">
            Select a layer to edit its positioning, styling and content.
          </div>
        </>
      ) : (
        <>
          <Section title={`${selection.type[0].toUpperCase()}${selection.type.slice(1)} · Position & size`}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <GridField label="X">
                <NumberField value={selection.x} step={4} className="w-full" onChange={(v) => onElementChange({ x: v })} />
              </GridField>
              <GridField label="Y">
                <NumberField value={selection.y} step={4} className="w-full" onChange={(v) => onElementChange({ y: v })} />
              </GridField>
              <GridField label="Width">
                <NumberField value={selection.width} step={4} className="w-full" onChange={(v) => onElementChange({ width: v })} />
              </GridField>
              <GridField label="Height">
                <NumberField value={selection.height} step={4} className="w-full" onChange={(v) => onElementChange({ height: v })} />
              </GridField>
            </div>
            <FieldRow label="Rotate">
              <RangeField value={selection.rotation} min={0} max={360} step={1} onChange={(v) => onElementChange({ rotation: v })} />
            </FieldRow>
            <FieldRow label="Opacity">
              <RangeField value={selection.opacity} min={0} max={100} step={5} onChange={(v) => onElementChange({ opacity: v })} />
            </FieldRow>
          </Section>

          <Section title="Arrange">
            <div className="flex items-center gap-1.5">
              <IconButton title="Bring forward" onClick={onMoveUp}>
                <IconArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton title="Send backward" onClick={onMoveDown}>
                <IconArrowDown className="h-4 w-4" />
              </IconButton>
              <IconButton title="Duplicate" onClick={onDuplicate}>
                <IconCopy className="h-4 w-4" />
              </IconButton>
              <IconButton title="Delete" onClick={onDelete}>
                <IconTrash className="h-4 w-4" />
              </IconButton>
            </div>
          </Section>

          {(selection.type === 'text' || selection.type === 'button') && (
            <Section title="Content">
              {selection.type === 'text' ? (
                <textarea
                  value={selection.text ?? ''}
                  onChange={(e) => onElementChange({ text: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              ) : (
                <input
                  type="text"
                  value={selection.text ?? ''}
                  onChange={(e) => onElementChange({ text: e.target.value })}
                  className="w-full rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              )}
              {(selection.type === 'button' || selection.type === 'text') && (
                <>
                  <FieldRow label="Font">
                    <SelectField
                      value={selection.fontFamily ?? FONT_OPTIONS[0].value}
                      onChange={(v) => onElementChange({ fontFamily: v })}
                      options={FONT_OPTIONS}
                    />
                  </FieldRow>
                  <FieldRow label="Size">
                    <NumberField value={selection.fontSize ?? 56} min={8} max={400} onChange={(v) => onElementChange({ fontSize: v })} />
                  </FieldRow>
                  <FieldRow label="Weight">
                    <SelectField
                      value={String(selection.fontWeight ?? 700)}
                      onChange={(v) => onElementChange({ fontWeight: Number(v) })}
                      options={WEIGHT_OPTIONS}
                    />
                  </FieldRow>
                  {selection.type === 'text' && (
                    <FieldRow label="Align">
                      <AlignButtons value={selection.textAlign ?? 'left'} onChange={(v) => onElementChange({ textAlign: v as 'left' | 'center' | 'right' })} />
                    </FieldRow>
                  )}
                  <FieldRow label="Colour">
                    <ColorField
                      value={selection.color ?? '#1A1A1A'}
                      onChange={(color) => onElementChange({ color })}
                      preset={selection.type === 'button' ? ['#FFFFFF', '#FFE8E6', '#FEF3C7', '#FDE68A', '#DDEEFD', '#DCFCE7'] : null}
                    />
                  </FieldRow>
                  {selection.type === 'button' && (
                    <>
                      <FieldRow label="Fill">
                        <ColorField value={selection.backgroundColor ?? '#722F37'} onChange={(color) => onElementChange({ backgroundColor: color })} />
                      </FieldRow>
                      <FieldRow label="Radius">
                        <NumberField value={selection.borderRadius ?? 10} min={0} max={200} onChange={(v) => onElementChange({ borderRadius: v })} />
                      </FieldRow>
                    </>
                  )}
                </>
              )}
            </Section>
          )}

          {(selection.type === 'image' || selection.type === 'logo') && (
            <Section title="Image">
              <ImagePicker
                value={selection.imageUrl}
                onChange={(imageUrl) => onElementChange({ imageUrl })}
                onClear={() => onElementChange({ imageUrl: undefined })}
              />
              <FieldRow label="Fit">
                <SelectField
                  value={selection.objectFit ?? 'cover'}
                  onChange={(v) => onElementChange({ objectFit: v as 'cover' | 'contain' })}
                  options={FIT_OPTIONS}
                />
              </FieldRow>
              {selection.imageUrl && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <GridField label="Focus X">
                    <NumberField value={selection.focalX ?? 50} min={0} max={100} step={5} className="w-full" onChange={(v) => onElementChange({ focalX: v })} />
                  </GridField>
                  <GridField label="Focus Y">
                    <NumberField value={selection.focalY ?? 50} min={0} max={100} step={5} className="w-full" onChange={(v) => onElementChange({ focalY: v })} />
                  </GridField>
                </div>
              )}
              {selection.imageUrl && (
                <GridField label="Zoom">
                  <ZoomField value={selection.zoom ?? 100} onChange={(v) => onElementChange({ zoom: v })} />
                </GridField>
              )}
              <button
                type="button"
                onClick={onActivateFromPanel('element')}
                className={`mt-1 w-full rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  isPanActive('element')
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]'
                }`}
              >
                {isPanActive('element') ? 'Panning image — drag on canvas' : 'Pan image on canvas'}
              </button>
            </Section>
          )}

          {selection.type === 'shape' && (
            <Section title="Shape">
              <FieldRow label="Kind">
                <SelectField
                  value={selection.shape ?? 'rectangle'}
                  onChange={(v) => onElementChange({ shape: v as 'rectangle' | 'rounded' | 'circle' | 'line', ...(v === 'rounded' ? { borderRadius: selection.borderRadius ?? 12 } : {}) })}
                  options={SHAPE_OPTIONS}
                />
              </FieldRow>
              <FieldRow label="Fill">
                <ColorField value={selection.backgroundColor ?? '#E5E7EB'} onChange={(color) => onElementChange({ backgroundColor: color })} />
              </FieldRow>
              {selection.shape === 'rounded' && (
                <FieldRow label="Radius">
                  <NumberField value={selection.borderRadius ?? 12} min={0} max={200} onChange={(v) => onElementChange({ borderRadius: v })} />
                </FieldRow>
              )}
              {selection.shape === 'line' && (
                <FieldRow label="Thickness">
                  <NumberField value={selection.lineThickness ?? 8} min={1} max={100} onChange={(v) => onElementChange({ lineThickness: v })} />
                </FieldRow>
              )}
            </Section>
          )}

          {device && (
            <Section title={`${DEVICE_LABELS[device]} overrides`}>
              <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
                Fine-tune this layer for {DEVICE_LABELS[device].toLowerCase()}. Blank fields inherit the design
                values; everything else matches the preview on the right.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <GridField label="X">
                  <OptNumber value={ov?.x} step={4} min={-1600} max={4000} className="w-full" onChange={(v) => (v === undefined ? onOverrideChange(device, { x: undefined }) : onOverrideChange(device, { x: v }))} />
                </GridField>
                <GridField label="Y">
                  <OptNumber value={ov?.y} step={4} min={-1600} max={4000} className="w-full" onChange={(v) => (v === undefined ? onOverrideChange(device, { y: undefined }) : onOverrideChange(device, { y: v }))} />
                </GridField>
                <GridField label="Width">
                  <OptNumber value={ov?.width} step={4} min={8} max={2000} className="w-full" onChange={(v) => (v === undefined ? onOverrideChange(device, { width: undefined }) : onOverrideChange(device, { width: v }))} />
                </GridField>
                <GridField label="Height">
                  <OptNumber value={ov?.height} step={4} min={8} max={2000} className="w-full" onChange={(v) => (v === undefined ? onOverrideChange(device, { height: undefined }) : onOverrideChange(device, { height: v }))} />
                </GridField>
                <GridField label="Opacity">
                  <OptNumber value={ov?.opacity} step={5} min={0} max={100} className="w-full" onChange={(v) => (v === undefined ? onOverrideChange(device, { opacity: undefined }) : onOverrideChange(device, { opacity: v }))} />
                </GridField>
                <GridField label="Rotate">
                  <OptNumber value={ov?.rotation} step={1} min={0} max={360} className="w-full" onChange={(v) => (v === undefined ? onOverrideChange(device, { rotation: undefined }) : onOverrideChange(device, { rotation: v }))} />
                </GridField>
              </div>
              {(selection.type === 'text' || selection.type === 'button') && (
                <FieldRow label="Font size">
                  <OptNumber value={ov?.fontSize} step={2} min={8} max={400} onChange={(v) => (v === undefined ? onOverrideChange(device, { fontSize: undefined }) : onOverrideChange(device, { fontSize: v }))} />
                </FieldRow>
              )}
              <button
                type="button"
                onClick={() => onOverrideReset(device)}
                disabled={!ov}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-40"
              >
                Reset {DEVICE_LABELS[device]} values
              </button>
            </Section>
          )}
        </>
      )}
    </div>
  );
}