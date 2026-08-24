import { useEffect } from "react";
import { useStore } from "./store";
import LoginScreen from "./screens/LoginScreen";
import QueueScreen from "./screens/QueueScreen";

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export default function App() {
  const { accessToken, refreshToken, logout, touch } = useStore();
  const themeMode = useStore((s) => s.themeMode);

  // ORD-121 — mesmo mecanismo do admin: aplica data-theme no <html>, os
  // tokens --a-* (theme.scss) reagem a esse atributo.
  useEffect(() => {
    const apply = () => {
      const resolved =
        themeMode === "system"
          ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
          : themeMode;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeMode]);

  // Inatividade: 15 min sem interação → logout
  useEffect(() => {
    if (!accessToken) return;

    const interval = setInterval(() => {
      const idle = Date.now() - useStore.getState().lastActivity;
      if (idle >= INACTIVITY_TIMEOUT_MS) logout();
    }, 10_000);

    const handler = () => touch();
    ["click", "touchstart", "keydown", "mousemove"].forEach((ev) =>
      window.addEventListener(ev, handler)
    );

    return () => {
      clearInterval(interval);
      ["click", "touchstart", "keydown", "mousemove"].forEach((ev) =>
        window.removeEventListener(ev, handler)
      );
    };
  }, [accessToken]);

  if (!accessToken) return <LoginScreen />;
  return <QueueScreen />;
}
