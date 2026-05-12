// @ts-check
/** @type {import("prettier").Config} */
export default {
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./src/App.css",
  tailwindFunctions: ["cva"],
};
