import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

window.__errs = [];
window.addEventListener("error", (e) => window.__errs.push(String(e.message || e.error)));
window.addEventListener("unhandledrejection", (e) => window.__errs.push(`unhandled: ${e.reason?.message || e.reason}`));

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { window.__errs.push(`${error?.message}\n${info?.componentStack || ""}`); }
  render() {
    if (this.state.error) {
      return (
        <div className="boot">
          <img src="/tree-icon.png" alt="" width="96" />
          <h1>Something broke</h1>
          <p className="err">{String(this.state.error?.message || this.state.error)}</p>
          {this.state.error?.stack ? <pre className="err-stack">{String(this.state.error.stack).split("\n").slice(0, 8).join("\n")}</pre> : null}
          <button type="button" onClick={() => { localStorage.removeItem("ftv:view"); localStorage.removeItem("ftv:root"); location.reload(); }}>Reset view and reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
