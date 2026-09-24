import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Accessibility (WCAG 2.1 AA target): the full recommended set, on top of Next's subset.
  // The plugin is already registered by eslint-config-next, so only the rules are added.
  { rules: jsxA11y.flatConfigs.recommended.rules },
  {
    rules: {
      // Business rules stay framework-free so they can be tested and reused anywhere.
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react-dom", "@/components/*", "@/app/*", "@/server/*"],
              message: "src/domain must not depend on the framework, UI or server layers.",
            },
          ],
        },
      ],
    },
  },
  {
    // Generated shadcn primitives are generic wrappers: callers pass htmlFor/labels.
    files: ["src/components/ui/**/*.tsx"],
    rules: { "jsx-a11y/label-has-associated-control": "off" },
  },
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
