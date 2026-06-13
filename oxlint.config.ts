import { defineConfig } from "oxlint";

const leafFeatures = ["document", "editor", "folder-context", "preferences"];
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
  },
  overrides: [
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
