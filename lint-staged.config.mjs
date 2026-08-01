export default {
  "**/*.{js,jsx,ts,tsx,mjs,cjs}": ["oxlint --deny-warnings", "oxfmt"],
  "**/*.{json,md,css,html,yml,yaml}": "oxfmt --no-error-on-unmatched-pattern",
  "src-tauri/**/*.rs": () => "cargo fmt --manifest-path src-tauri/Cargo.toml",
};
