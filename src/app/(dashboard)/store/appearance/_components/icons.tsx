// Inline SVG icon set for the Design Studio (repo convention: no icon library —
// small hand-rolled icons keep the editor dependency-free).

type IconProps = { className?: string };

export function IconText({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3 4h14a1 1 0 0 1 1 1v1h-2V6H5v6h4.5L8.7 14H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M13 9h2v7h1.5v2H13v-2h1.5V9Z" />
    </svg>
  );
}

export function IconImage({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="M4 15.5 8.5 11l3 3 2-2 3 3.5v-13h-14l1.5 1v9Z" opacity="0" />
      <path d="M3.5 17.5h13a2 2 0 0 0 2-2V5.5a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Zm.5-1.5v-2l3.5-4 3 3.5 2-2.5 3.5 4v1h-12Z" />
    </svg>
  );
}

export function IconShape({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="4" width="11" height="11" rx="1.5" />
      <circle cx="14.5" cy="14.5" r="3.7" fillOpacity="0.15" />
    </svg>
  );
}

export function IconCircle({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
    </svg>
  );
}

export function IconLine({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <rect x="3" y="8.5" width="14" height="3" rx="1.5" />
    </svg>
  );
}

export function IconButton({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="6" width="15" height="8" rx="3" />
      <rect x="10" y="8" width="6" height="4" rx="1.5" fill="#fff" fillOpacity="0.85" />
    </svg>
  );
}

export function IconLogo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 2.5 14.5 5v5c0 3-1.8 5.4-4.5 6.5C7.3 15.4 5.5 13 5.5 10V5L10 2.5Z" fillOpacity="0.15" />
      <path d="M10 3.4 8 4.7v3l1-1.6 1 1.6V3.4Z" fillOpacity="0.5" />
    </svg>
  );
}

export function IconUndo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.5 5 3.5 9l4 4" />
      <path d="M4.5 9h7a5 5 0 0 1 5 5" />
    </svg>
  );
}

export function IconRedo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12.5 5 4 4-4 4" />
      <path d="M15.5 9h-7a5 5 0 0 0-5 5" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 6h13M8 6V4.5h4V6M5 6l1 10h8l1-10" />
      <path d="M8.5 9v4.5M11.5 9v4.5" />
    </svg>
  );
}

export function IconCopy({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M4.5 13h-1a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1H12a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3 17 7l-7 4-7-4 7-4Z" />
      <path d="M5 10.5 3 11.5l7 4 7-4-2-1M5 14l-2 1 7 4 7-4-2-1" />
    </svg>
  );
}

export function IconArrowUp({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 11 4-4 4 4M10 7v8" />
    </svg>
  );
}

export function IconArrowDown({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 4 4 4-4M10 13V5" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function IconUpload({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" />
      <path d="M3 13v3h14v-3" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export function IconGrid({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M3 3h6v6H3V3Zm0 8h6v6H3v-6Zm8-8h6v6h-6V3Zm0 8h6v6h-6v-6Z" />
    </svg>
  );
}

export function IconTrashXs({ className }: IconProps) {
  return <IconTrash className={className} />;
}