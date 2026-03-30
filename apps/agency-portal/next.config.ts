import type { NextConfig } from "next";
import path from "path";

// Turbopack otherwise picks the repo-root lockfile (../..) and resolves CSS imports
// against the wrong package.json (e.g. KaivoCore mirror path with no node_modules).
const appDir = __dirname;

const tailwindPkg = path.join(appDir, "node_modules", "tailwindcss");
const tailwindPostcssPkg = path.join(
  appDir,
  "node_modules",
  "@tailwindcss",
  "postcss",
);

function toDevOriginHost(raw?: string): string | null {
  if (!raw) return null;
  const input = raw.trim();
  if (!input) return null;
  try {
    return new URL(input).host;
  } catch {
    // Allow direct host input like "foo.ngrok-free.app"
    return input.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
  }
}

const configuredDevOrigins = new Set<string>();
const redditRedirectHost = toDevOriginHost(process.env.NEXT_PUBLIC_REDDIT_REDIRECT_URI);
if (redditRedirectHost) configuredDevOrigins.add(redditRedirectHost);
const nextAuthHost = toDevOriginHost(process.env.NEXTAUTH_URL);
if (nextAuthHost) configuredDevOrigins.add(nextAuthHost);
const extraAllowed = (process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((s) => toDevOriginHost(s))
  .filter((s): s is string => Boolean(s));
for (const host of extraAllowed) configuredDevOrigins.add(host);

const nextConfig: NextConfig = {
  allowedDevOrigins: Array.from(configuredDevOrigins),
  turbopack: {
    root: appDir,
    resolveAlias: {
      tailwindcss: tailwindPkg,
      "@tailwindcss/postcss": tailwindPostcssPkg,
    },
  },
  // Webpack still resolves `@import "tailwindcss"` in globals.css; without this,
  // resolution walks to the wrong root (e.g. `apps/`) and fails — same fix as turbopack root above.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    const prev = config.resolve.alias;
    config.resolve.alias = {
      ...(typeof prev === "object" && prev && !Array.isArray(prev)
        ? prev
        : {}),
      tailwindcss: tailwindPkg,
      "@tailwindcss/postcss": tailwindPostcssPkg,
    };
    return config;
  },
};

export default nextConfig;
