/** @type {import('next').NextConfig} */

// Image storage moved to R2 (STORAGE_DRIVER=r2) in Phase 11. When
// R2_PUBLIC_BASE_URL is set, add its host to the image allow-list so
// <Image> can render uploaded files from the object store.
const r2Base = process.env.R2_PUBLIC_BASE_URL;
let r2RemotePattern = [];
if (r2Base) {
  try {
    const u = new URL(r2Base);
    if (u.hostname) r2RemotePattern.push({ protocol: u.protocol.replace(':', ''), hostname: u.hostname });
  } catch {
    // invalid value — fall through to defaults
  }
}

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.cloudflare.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      ...r2RemotePattern,
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
      {
        // Neutralize uploaded SVG/HTML stored-XSS: run /uploads in an opaque
        // origin (sandbox) with nothing allowed to load/execute.
        source: '/uploads/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self'",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
