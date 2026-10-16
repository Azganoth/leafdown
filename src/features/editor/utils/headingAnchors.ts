/** GitHub's heading anchor: lowercase letters, digits, `-` and `_`, with spaces as hyphens. */
export const slugifyHeading = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replaceAll(" ", "-");

export const decodeFragment = (fragment: string) => {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
};
