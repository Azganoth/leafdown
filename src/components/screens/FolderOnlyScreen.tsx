import { FileText } from "lucide-react";

export function FolderOnlyScreen() {
  return (
    <section
      aria-labelledby="folder-only-title"
      className="flex min-h-full items-center justify-center px-8 py-10"
    >
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
          <FileText aria-hidden="true" className="size-7" />
        </span>
        <h2 id="folder-only-title" className="mt-5 text-xl font-semibold">
          No document open
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Select a Markdown file from the sidebar or create a new document.
        </p>
      </div>
    </section>
  );
}
