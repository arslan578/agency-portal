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

const nextConfig: NextConfig = {
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
