import { LeafIcon } from "lucide-react";
import type { ReactNode } from "react";

function PlaceholderArt({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" className="mx-auto block h-32 w-40" viewBox="0 0 160 128">
      <circle className="fill-art-tint" cx="80" cy="66" r="56" />
      {children}
    </svg>
  );
}

export function NoDocumentArt() {
  return (
    <PlaceholderArt>
      <rect
        className="fill-art-paper-back stroke-art-line"
        height="72"
        rx="8"
        strokeWidth="2"
        transform="rotate(-9 68 64)"
        width="56"
        x="40"
        y="28"
      />
      <rect
        className="fill-art-paper stroke-art-line"
        height="80"
        rx="8"
        strokeWidth="2"
        width="60"
        x="58"
        y="22"
      />
      <path className="stroke-art-ink" d="M69 39h26" strokeLinecap="round" strokeWidth="4" />
      <path
        className="stroke-art-soft"
        d="M69 52h38M69 61h34M69 70h37M69 79h22"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <circle className="fill-primary stroke-background" cx="116" cy="98" r="17" strokeWidth="4" />
      <LeafIcon className="text-primary-foreground" size={20} strokeWidth={2.2} x={106} y={88} />
    </PlaceholderArt>
  );
}

export function EmptyFolderArt() {
  return (
    <PlaceholderArt>
      <path
        className="fill-art-paper-back stroke-art-line"
        d="M36 52a8 8 0 0 1 8-8h19.7a8 8 0 0 1 5.66 2.34L75 52h41a8 8 0 0 1 8 8v38a8 8 0 0 1-8 8H44a8 8 0 0 1-8-8Z"
        strokeWidth="2"
      />
      <rect
        className="fill-art-paper stroke-art-ink"
        height="58"
        rx="6"
        strokeDasharray="5 4"
        strokeWidth="2"
        width="48"
        x="56"
        y="24"
      />
      <path
        className="fill-art-paper stroke-art-line"
        d="M37 68h86a6 6 0 0 1 5.85 7.35l-5.6 24.3A8 8 0 0 1 115.45 106h-70.9a8 8 0 0 1-7.8-6.35l-5.6-24.3A6 6 0 0 1 37 68Z"
        strokeWidth="2"
      />
      <g transform="rotate(18 122 24)">
        <LeafIcon className="text-primary" size={24} strokeWidth={2} x={110} y={12} />
      </g>
    </PlaceholderArt>
  );
}
