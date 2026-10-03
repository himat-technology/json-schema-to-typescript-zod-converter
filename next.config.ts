import type { NextConfig } from "next";

const TOOL_PATH = "/free-tools/json-schema-to-typescript-zod-converter";

// json-schema-to-typescript is written for Node. In the browser bundle we stub the
// file-system and the full Prettier build (we format with prettier/standalone instead).
const browserShims = {
  fs: { browser: "./lib/shims/empty-module.ts" },
  "cli-color": { browser: "./lib/shims/empty-module.ts" },
  prettier: { browser: "./lib/shims/prettier-stub.ts" },
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  turbopack: {
    resolveAlias: browserShims,
  },
  async redirects() {
    return ["/", "/free-tools"].map((source) => ({
      source,
      destination: TOOL_PATH,
      permanent: false,
    }));
  },
};

export default nextConfig;
