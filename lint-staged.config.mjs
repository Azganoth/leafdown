export default {
  "**/*.{js,jsx,ts,tsx,mjs,cjs}": [
    "eslint --fix --max-warnings 0",
    "prettier --write",
  ],
  "**/*.{json,md,css,html,yml,yaml}": "prettier --write",
  "src-tauri/**/*.rs": () =>
    "cargo +nightly fmt --manifest-path src-tauri/Cargo.toml",
};
