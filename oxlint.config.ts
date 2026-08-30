import { defineConfig } from "oxlint";

const leafFeatures = ["diagnostics", "document", "editor", "folder-context", "preferences"];
const restrictedImportRoots = [
  "@/features/session",
  "@/commands",
  "@/components/layout",
  "@/components/screens",
];

const restrictedImportPatterns = restrictedImportRoots.flatMap((root) => [root, `${root}/**`]);

export default defineConfig({
  plugins: ["eslint", "import", "oxc", "react", "typescript", "unicorn", "vitest"],
  env: {
    builtin: true,
    browser: true,
    node: true,
    serviceworker: true,
  },
  options: {
    typeAware: true,
  },
  rules: {
    "react/rules-of-hooks": "error",
    "no-var": "error",
    "prefer-const": "error",
    "react/react-compiler": "error",

    // Named individually because the categories holding them are dominated by style.
    "eslint/no-promise-executor-return": "error",
    // `u` changes character-class and escape semantics rather than only tightening them.
    "eslint/require-unicode-regexp": "error",
    // TypeScript permits cycles; the feature boundaries below only constrain direction.
    "import/no-cycle": "error",
    "import/no-duplicates": "error",
    "import/no-self-import": "error",
    "typescript/no-deprecated": "error",
    // `any` from an untyped mock disables every type-aware rule downstream of it.
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    // A `never` operand marks a narrowing that collapsed a type callers still rely on.
    "typescript/restrict-plus-operands": "error",

    // The suite asserts through these wrappers, which the rule cannot follow.
    "vitest/expect-expect": [
      "error",
      {
        assertFunctionNames: [
          "expect",
          "expectClipboardTextWritten",
          "expectControlsOutOfTabSequence",
          "expectMarkSource",
          "expectOversizedMarkdownFileToast",
        ],
      },
    ],
    // Would need a type parameter on every mock that does not otherwise want one.
    "vitest/require-mock-type-parameters": "off",
    // Cannot express a rejection assertion held across a timer advance before awaiting.
    "vitest/valid-expect": "off",
  },
  overrides: [
    {
      // `expect(mock.method)` references a method unbound on purpose, so every report
      // here is the assertion style rather than a `this` mistake.
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
