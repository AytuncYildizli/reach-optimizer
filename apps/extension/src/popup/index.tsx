import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<Popup />);
}
