import { createRoot } from "react-dom/client";
import OnlineGate from "./OnlineGate";
import "./style.css";
createRoot(document.getElementById("root")!).render(<OnlineGate />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
