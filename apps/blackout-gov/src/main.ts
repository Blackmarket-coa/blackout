import { BlackoutGovApp, type GovernanceShellOptions, type GovernanceShellView } from "./app";
import { blackoutGovConfig } from "./index";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

const params = new URLSearchParams(window.location.search);
const requestedView = params.get("view");
const view: GovernanceShellView = requestedView === "simplified" ? "simplified" : "default";

const options: GovernanceShellOptions = { view };

new BlackoutGovApp(root, blackoutGovConfig, options).mount();
