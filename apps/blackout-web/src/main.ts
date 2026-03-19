import { BlackoutWebApp } from "./app";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

void new BlackoutWebApp(app).mount();
