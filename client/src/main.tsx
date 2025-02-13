import { createRoot } from "react-dom/client";
import "./reset.css";
import Router from "./Router.tsx";
import { BrowserRouter } from "react-router-dom";
import io from "socket.io-client";

const serverUrl = import.meta.env.VITE_API_URL;
export const socket = io(serverUrl);

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Router />
  </BrowserRouter>
);
