import type { ReactNode } from 'react';

/**
 * Storefront route-group shell.
 *
 * Every customer-facing store renders inside this layout. Per-business theme
 * overrides (Business.themeConfig) will apply a data-theme scope here in a
 * later phase — the shell only assumes the default white/wine-red tokens.
 */
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return <div data-theme="storefront">{children}</div>;
}