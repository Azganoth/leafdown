import { defineConfig } from "oxlint";

const leafFeatures = ["diagnostics", "document", "editor", "folder-context", "preferences"];
const restrictedImportRoots = [
  "@/features/session",
  "@/commands",
  "@/components/layout",
  "@/components/screens",
  "@/components/dialogs",
];

const restrictedImportPatterns = restrictedImportRoots.flatMap((root) => [root, `${root}/**`]);

export default defineConfig({
  plugins: ["eslint", "typescript", "unicorn", "oxc", "react"],
  env: {
    builtin: true,
    browser: true,
    node: true,
    serviceworker: true,
  },
  rules: {
    "react/rules-of-hooks": "error",
    "no-var": "error",
    "prefer-const": "error",
    "react/react-compiler": "error",
  },
  overrides: [
    {
      // Assertions reference methods unbound by design (`expect(mock.method)`), so the
      // rule reports the test rather than a scoping mistake.
      files: ["src/**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
      rules: {
        "typescript/unbound-method": "off",
      },
    },
    {
      files: leafFeatures.map((feature) => `src/features/${feature}/**/*.{ts,tsx}`),
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: restrictedImportPatterns,
                message:
                  "Leaf features must not depend on session, commands, or application components.",
              },
            ],
          },
        ],
      },
    },
  ],
});
