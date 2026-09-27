import React from "react";
import { createRoot } from "react-dom/client";
// The design system goes first so feature stylesheets, imported by the components, override it.
import "./styles/base.css";
import App from "./app/App.tsx";
import { startAnalytics } from "./services/analytics.ts";

void startAnalytics();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
