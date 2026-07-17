import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["corpus/**"],
  sortTailwindcss: {
    stylesheet: "./src/App.css",
    functions: ["cva", "cn"],
  },
  sortImports: {
    customGroups: [
      {
        groupName: "alias",
        elementNamePattern: ["@/**"],
      },
      {
        groupName: "css",
        elementNamePattern: ["**/*.css", "**/*.scss"],
      },
    ],
    groups: [
      ["type-import", "value-builtin", "value-external"],
      ["type-internal", "alias"],
      ["type-parent", "type-sibling", "type-index", "value-parent", "value-sibling", "value-index"],
      "css",
      "unknown",
    ],
  },
});
