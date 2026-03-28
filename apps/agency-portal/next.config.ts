import type { NextConfig } from "next";
import path from "path";

// Turbopack otherwise picks the repo-root lockfile (../..) and resolves CSS imports
// against the wrong package.json (e.g. KaivoCore mirror path with no node_modules).
const appDir = __dirname;

const nextConfig: NextConfig = {
  turbopack: {
    root: appDir,
    resolveAlias: {
      tailwindcss: path.join(appDir, "node_modules", "tailwindcss"),
      "@tailwindcss/postcss": path.join(appDir, "node_modules", "@tailwindcss", "postcss"),
    },
  },
};

export default nextConfig;
