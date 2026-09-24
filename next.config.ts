import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Language comes from the user's choice (cookie) or the browser, never from the URL.
// See src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Self-contained server output for the Docker image on Azure Container Apps.
  output: "standalone",
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
