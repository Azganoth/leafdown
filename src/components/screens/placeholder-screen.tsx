import type { ReactNode } from "react";

interface PlaceholderScreenProps {
  art: ReactNode;
  description: string;
  title: string;
  titleId: string;
}

export function PlaceholderScreen({ art, description, title, titleId }: PlaceholderScreenProps) {
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-full items-center justify-center px-8 py-10"
    >
      <div className="max-w-md text-center">
        {art}
        <h2 id={titleId} className="mt-4 text-xl font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}
