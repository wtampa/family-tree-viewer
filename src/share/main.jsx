import React from "react";
import { createRoot } from "react-dom/client";
import ShareApp from "./ShareApp.jsx";
import "../index.css";
import "./share.css";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="boot">
          <img src="./tree-icon.png" alt="" width="96" />
          <h1>Something broke</h1>
          <p className="err">{String(this.state.error?.message || this.state.error)}</p>
          <button type="button" onClick={() => { try { localStorage.removeItem("fts:view"); localStorage.removeItem("fts:root"); } catch { /* ignore */ } location.reload(); }}>Reset view and reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ShareApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
