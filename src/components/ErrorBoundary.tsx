import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort fallback for render errors. Without this, one malformed document
 * or settings value blanks the whole webview and leaves no way to recover.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("MarkView render failed", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          background: "#0a0e18",
          color: "#e9ecf6",
          fontFamily: '"Segoe UI", system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>
            MarkView hit an unexpected error
          </h1>
          <p style={{ margin: "0 0 18px", lineHeight: 1.6, color: "#a8b3cd" }}>
            The current view could not be rendered. Your document backups are
            still in the MarkView data folder. Reload to continue.
          </p>
          <pre
            style={{
              margin: "0 0 20px",
              padding: 12,
              overflow: "auto",
              borderRadius: 8,
              background: "#111827",
              color: "#fca5a5",
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              height: 34,
              padding: "0 16px",
              border: 0,
              borderRadius: 8,
              background: "#7c5cff",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reload MarkView
          </button>
        </div>
      </div>
    );
  }
}
