import type { ReactNode } from "react";

function NavigatorArt({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48">
      <circle className="fill-art-tint" cx="24" cy="24" r="24" />
      {children}
    </svg>
  );
}

export function EmptyFolderArt() {
  return (
    <NavigatorArt>
      <path
        className="fill-art-paper-back stroke-art-line"
        d="M10 18a3 3 0 0 1 3-3h7l3 3h12a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3Z"
        strokeWidth="1.5"
      />
      <rect
        className="fill-art-paper stroke-primary"
        height="16"
        rx="2"
        strokeDasharray="3 2.5"
        strokeWidth="1.5"
        width="13"
        x="18"
        y="10"
      />
      <rect
        className="fill-art-paper stroke-art-line"
        height="13"
        rx="3"
        strokeWidth="1.5"
        width="28"
        x="10"
        y="24"
      />
    </NavigatorArt>
  );
}

export function NoMatchesArt() {
  return (
    <NavigatorArt>
      <rect
        className="fill-art-paper stroke-art-line"
        height="25"
        rx="3"
        strokeWidth="1.5"
        width="19"
        x="12"
        y="9"
      />
      <path
        className="stroke-art-soft"
        d="M16 16h11M16 21h9M16 26h6"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle className="fill-art-paper stroke-primary" cx="30" cy="30" r="6.5" strokeWidth="2" />
      <path className="stroke-primary" d="m34.8 34.8 4 4" strokeLinecap="round" strokeWidth="2.5" />
    </NavigatorArt>
  );
}

export function NoVisibleEntriesArt() {
  return (
    <NavigatorArt>
      <path
        className="fill-none stroke-art-ink"
        d="M10 17a3 3 0 0 1 3-3h7l3 3h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3Z"
        strokeDasharray="3 2.5"
        strokeWidth="1.5"
      />
      <circle className="fill-primary stroke-card" cx="35" cy="34" r="6.5" strokeWidth="2" />
      <path
        className="stroke-primary-foreground"
        d="M32 34h6"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
    </NavigatorArt>
  );
}
