import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./fonts.css";

// Tela de abertura (identidade HBier Inteligência): aparece ao abrir o app, some sozinha ou ao tocar
function Abertura() {
  const [fase, setFase] = useState("visivel"); // visivel | saindo | fim
  useEffect(() => {
    const t1 = setTimeout(() => setFase("saindo"), 1800);
    const t2 = setTimeout(() => setFase("fim"), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (fase === "fim") return null;
  return (
    <div onClick={() => setFase("fim")}
      style={{
        position: "fixed", inset: 0, zIndex: 99999, background: "#025F1D",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: fase === "saindo" ? 0 : 1, transition: "opacity 0.7s ease", cursor: "pointer",
      }}>
      <img src={`${import.meta.env.BASE_URL}abertura.png`} alt="HBier Inteligência"
        style={{ width: "100%", height: "100%", objectFit: "contain", maxWidth: 1200 }} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <Abertura />
  </React.StrictMode>
);
