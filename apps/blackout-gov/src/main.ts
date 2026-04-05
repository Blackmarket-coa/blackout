import { BlackoutGovApp } from "./app";
import { blackoutGovConfig } from "./index";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

new BlackoutGovApp(root, blackoutGovConfig).mount();
