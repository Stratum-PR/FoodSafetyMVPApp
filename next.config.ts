import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Language comes from the user's choice (cookie) or the browser, never from the URL.
// See src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Self-contained server output for the Docker image on Azure Container Apps.
  output: "standalone",
  poweredByHeader: false,
  // Dev only: extra hostnames allowed to load the dev server (e.g. a Tailscale address to test on
  // a phone). Set DEV_ALLOWED_ORIGINS in .env.local (comma-separated, hostnames only). Never commit it.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export default withNextIntl(nextConfig);
