import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Turbopack infers the project root from the nearest lockfile it can find,
// walking UP the directory tree. If you have a stray package-lock.json in a
// parent folder — very common in a home directory — it picks that instead,
// then fails with "Couldn't find any `pages` or `app` directory".
//
// Pinning the root removes the guesswork.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root: projectRoot },

  // Where remote images may come from. Next refuses any other host, which
  // stops a compromised supplier record from loading images off a random
  // domain. Add a host here before using it.
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'utfs.io' },
    ],
    deviceSizes: [360, 640, 828, 1080, 1200, 1920],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },

  // Vercel fails the build on any type error. That is the correct default:
  // a red build is cheaper than a broken checkout page. (Lint config moved
  // out of next.config in Next 16 — it lives in eslint.config.mjs now.)
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
