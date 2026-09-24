import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests for rules and components. Browser flows live in e2e/ (Playwright).
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    restoreMocks: true,
  },
});
