interface CalloutTypeIconProps {
  token: string;
}

/** The icon a callout of the type shows in its header, drawn in the surrounding text color. */
export function CalloutTypeIcon({ token }: CalloutTypeIconProps) {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 bg-current mask-contain mask-center mask-no-repeat"
      data-slot="callout-type-icon"
      style={{ maskImage: `url("/callout-${token.toLowerCase()}.svg")` }}
    />
  );
}
