import { createRoot } from "react-dom/client";

import "katex/dist/katex.min.css";

import "./styles/base.css";
import "./styles/components.css";
import "./styles/overlays.css";
// First-paint fallback; the active theme is injected at runtime by theme.ts.
import "./styles/theme-dark.css";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}
