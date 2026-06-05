import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@/components/toast";
import { Dashboard } from "@/components/dashboard";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  </StrictMode>,
);
