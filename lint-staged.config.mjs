export default {
  "**/*.{js,jsx,ts,tsx,mjs,cjs}": ["oxlint --fix --deny-warnings", "oxfmt"],
  "**/*.{json,md,css,html,yml,yaml}": "oxfmt --no-error-on-unmatched-pattern",
  "src-tauri/**/*.rs": () => "cargo +nightly-2026-05-22 fmt --manifest-path src-tauri/Cargo.toml",
};
