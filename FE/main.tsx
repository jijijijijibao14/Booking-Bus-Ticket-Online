
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import "./styles/index.css";

  // createRoot(document.getElementById("root")!).render(
  //   <App />
  // );
  console.log(
  "VITE_GOOGLE_CLIENT_ID:",
  import.meta.env.VITE_GOOGLE_CLIENT_ID || "UNDEFINED"
);

createRoot(document.getElementById("root")!).render(
  <App />
);
  