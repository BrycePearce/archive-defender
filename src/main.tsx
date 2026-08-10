import { createRoot } from "react-dom/client";
import { ArcadeGame } from "./game/ArcadeGame.tsx";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Archive Defender root element is missing");

createRoot(root).render(
  <main className="archive-standalone">
    <ArcadeGame />
  </main>,
);
