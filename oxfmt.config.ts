import { defineConfig } from "oxfmt";

export default defineConfig({
  sortTailwindcss: {
    stylesheet: "./src/App.css",
    functions: ["cva", "cn"],
  },
});
