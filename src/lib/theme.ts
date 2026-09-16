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
