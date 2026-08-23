import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "design-system/dist/core/scss/styles.scss";
import "design-system/dist/core/icons/icons.css";
import "./styles/theme.scss";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
