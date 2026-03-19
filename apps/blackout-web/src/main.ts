import { BlackoutWebApp } from "./app";
import { blackoutWebConfig } from "./index";
import "./styles.css";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

void new BlackoutWebApp(appRoot, blackoutWebConfig).mount();
