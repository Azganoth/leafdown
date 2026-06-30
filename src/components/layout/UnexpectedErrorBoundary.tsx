import { Component, type ErrorInfo, type ReactNode } from "react";

import { handleUnexpectedError } from "@/lib/errors";

interface UnexpectedErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  operation?: string;
}

interface UnexpectedErrorBoundaryState {
  hasError: boolean;
}

export class UnexpectedErrorBoundary extends Component<
  UnexpectedErrorBoundaryProps,
  UnexpectedErrorBoundaryState
> {
  state: UnexpectedErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): UnexpectedErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    handleUnexpectedError(error, {
      componentStack: errorInfo.componentStack ?? undefined,
      source: "react",
      operation: this.props.operation ?? "render",
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <UnexpectedErrorFallback />;
    }

    return this.props.children;
  }
}

function UnexpectedErrorFallback() {
  return (
    <main
      role="alert"
      aria-labelledby="unexpected-error-title"
      className="flex min-h-0 flex-1 items-center justify-center bg-background px-8 py-10"
    >
      <section className="max-w-md">
        <h1 id="unexpected-error-title" className="text-lg font-semibold text-foreground">
          Something went wrong.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Restart Leafdown or reopen the current document.
        </p>
      </section>
    </main>
  );
}
