'use client';

// SHOPORA Super Admin shell — client component. Renders the platform nav
// (permission-filtered server-side and passed in), the authenticated admin's
// identity, and the active page. Style mirrors the business DashboardNav.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminNavSection } from '@/lib/admin-nav';
import { LogoutButton } from './actions';

type AdminNavProps = {
  nav: AdminNavSection[];
  displayName: string;
  roleName: string;
  userInitials: string;
  children: ReactNode;
};

function isSectionActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavBody({
  nav, displayName, roleName, userInitials, onNavigate,
}: { nav: AdminNavSection[]; displayName: string; roleName: string; userInitials: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4 lg:h-16">
        <Link href="/admin" className="text-lg font-black tracking-tight text-[var(--color-primary)]">
          SHOPORA
          <span className="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Admin</span>
        </Link>
        <span className="rounded bg-[var(--color-primary-50)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
          {roleName.replace('Platform ', '')}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {nav.map((section) => {
            const active = isSectionActive(pathname, section.href);
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  onClick={onNavigate}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
                    active
                      ? 'bg-[var(--color-primary-50)] text-[var(--color-primary)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary)]'
                  }`}
                >
                  <span>{section.label}</span>
                  {section.children.length > 0 && (
                    <span className="text-xs text-[var(--color-text-muted)]">{section.children.length}</span>
                  )}
                </Link>
                {section.children.length > 0 && (
                  <ul className="mt-1 space-y-1 pl-3">
                    {section.children.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            className={`block rounded-md px-3 py-1.5 text-sm ${
                              childActive
                                ? 'bg-[var(--color-primary-50)] font-semibold text-[var(--color-primary)]'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'
                            }`}
                          >
                            <span className="inline-block w-1.5" aria-hidden>
                              {childActive ? '›' : ''}
                            </span>
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-[var(--color-border)] p-3">
        <Link
          href="/dashboard"
          className="mb-3 block rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          Return to my business dashboard
        </Link>
        <LogoutButton className="mb-3 block rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]" />
        <div className="flex items-center gap-3 px-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
            {userInitials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--color-text)]">{displayName}</p>
            <p className="truncate text-xs text-[var(--color-text-muted)]">Platform admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminNav({ nav, displayName, roleName, userInitials, children }: AdminNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-background)] lg:flex">
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-lg">
            <NavBody nav={nav} displayName={displayName} roleName={roleName} userInitials={userInitials} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <aside className="hidden w-64 shrink-0 border-r border-[var(--color-border)] bg-white lg:block">
        <div className="sticky top-0 h-screen">
          <NavBody nav={nav} displayName={displayName} roleName={roleName} userInitials={userInitials} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-white">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:h-16">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-text)] hover:bg-[var(--color-primary-50)] lg:hidden"
              aria-label="Open platform navigation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-[var(--color-text-muted)] sm:text-sm">
                <span className="font-semibold text-[var(--color-text)]">SHOPORA Super Admin</span>
              </p>
            </div>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white"
              title={displayName}
            >
              {userInitials}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}