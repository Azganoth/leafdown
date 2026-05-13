export default {
  "**/*.{js,jsx,ts,tsx,mjs,cjs}": ["oxlint --fix --deny-warnings", "oxfmt"],
  "**/*.{json,md,css,html,yml,yaml}": "oxfmt",
  "src-tauri/**/*.rs": () => "cargo +nightly fmt --manifest-path src-tauri/Cargo.toml",
};
