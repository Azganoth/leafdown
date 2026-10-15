export function NoResultsArt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48">
      <circle className="fill-art-tint" cx="24" cy="24" r="24" />
      <circle className="fill-art-paper stroke-art-line" cx="21" cy="21" r="10" strokeWidth="2" />
      <path
        className="stroke-art-line"
        d="m28.5 28.5 8 8"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <path className="stroke-primary" d="M16.5 21h9" strokeLinecap="round" strokeWidth="2.25" />
    </svg>
  );
}
