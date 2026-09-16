// SHOPORA theme helpers — per-business theme resolution.
// Default theme (white + wine red) lives here. A Business.themeConfig JSON may
// override any key; on the storefront (later phase) these render as CSS custom
// properties scoped per business.

export type BusinessTheme = {
  primaryColor: string;   // brand/primary accent
  secondaryColor: string; // support accent
  backgroundColor: string;
  textColor: string;
};

export const DEFAULT_THEME: BusinessTheme = {
  primaryColor: '#722F37',   // wine red (Phase 1 default)
  secondaryColor: '#ffffff', // white
  backgroundColor: '#ffffff',
  textColor: '#1a1a1a',
};

/**
 * Resolve a business theme by merging its themeConfig JSON over the defaults.
 * themeConfig uses camelCase keys matching BusinessTheme.
 */
export function resolveTheme(themeConfig: unknown): BusinessTheme {
  const cfg = (themeConfig && typeof themeConfig === 'object'
    ? themeConfig
    : {}) as Record<string, unknown>;

  return {
    primaryColor: asString(cfg.primaryColor) ?? DEFAULT_THEME.primaryColor,
    secondaryColor: asString(cfg.secondaryColor) ?? DEFAULT_THEME.secondaryColor,
    backgroundColor: asString(cfg.backgroundColor) ?? DEFAULT_THEME.backgroundColor,
    textColor: asString(cfg.textColor) ?? DEFAULT_THEME.textColor,
  };
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// ------------------------------------------------------------------
// Storefront CSS-var helpers
// ------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Rough luminance check — picks readable foreground (text) for buttons. */
export function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 160;
}

/**
 * Build the `--sf-*` CSS custom-property declarations for a storefront scope.
 * These are scoped to the storefront wrapper only — the global :root tokens
 * (dashboard/landing) are never modified, so per-business branding never leaks
 * into admin surfaces.
 */
export function themeCssVars(theme: BusinessTheme): string {
  const onPrimary = isLightColor(theme.primaryColor) ? '#1a1a1a' : '#ffffff';
  return [
    `--sf-primary:${theme.primaryColor}`,
    `--sf-secondary:${theme.secondaryColor}`,
    `--sf-bg:${theme.backgroundColor}`,
    `--sf-text:${theme.textColor}`,
    `--sf-on-primary:${onPrimary}`,
    `--sf-tint:${rgbaFromHex(theme.primaryColor, 0.08)}`,
    `--sf-tint-strong:${rgbaFromHex(theme.primaryColor, 0.16)}`,
    '--sf-muted:#6b7280',
    '--sf-border:#e5e7eb',
  ].join(';');
}
