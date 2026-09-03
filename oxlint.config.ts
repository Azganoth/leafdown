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
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  options: {
    typeAware: true,
  },
  rules: {
    "react/rules-of-hooks": "error",
    "no-var": "error",
    "prefer-const": "error",

    "import/no-unassigned-import": [
      "error",
      { allow: ["**/*.css", "@testing-library/jest-dom/vitest"] },
    ],

    // Obsolete under the JSX transform `jsx: react-jsx` selects.
    "react/react-in-jsx-scope": "off",
    // `useVirtualizer` returns functions the compiler cannot memoize; the bailout is the library.
    "react/incompatible-library": "off",
    // The effect depends on a token it never reads, which is how the retry re-runs it.
    "react/exhaustive-effect-dependencies": "off",
    // Narrowing at the ProseMirror, Tauri, and persisted-state boundaries is those contracts.
    "typescript/no-unsafe-type-assertion": "off",
    // Every report is an exhaustive switch, and the `default` that would satisfy it is what
    // stops a new union member from failing the build.
    "typescript/consistent-return": "off",
    // Reports loop-invariant guards and comparison targets, which terminate on the rest of
    // their condition.
    "eslint/no-unmodified-loop-condition": "off",

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
          "expectSaved",
          "expectUnchanged",
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
      files: ["src/**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
      rules: {
        // `expect(mock.method)` references a method unbound on purpose, so every report here
        // is the assertion style rather than a `this` mistake.
        "typescript/unbound-method": "off",
        // Constructing without binding is the assertion when the test is that construction
        // alone does no work.
        "eslint/no-new": "off",
        // A helper local to one test case belongs in it, not beside the suite.
        "unicorn/consistent-function-scoping": "off",
        // Test helpers let the caller name the type they expect back.
        "typescript/no-unnecessary-type-parameters": "off",
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
