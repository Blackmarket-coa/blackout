import { BlackoutWebApp } from "./app";
import { blackoutWebConfig } from "./index";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

void new BlackoutWebApp(app).mount();
app.innerHTML = `
  <main class="container">
    <h1>Blackout Frontend</h1>
    <p class="status">Frontend bundle is reachable ✅</p>
    <p>This page is built with Vite from <code>apps/blackout-web</code>.</p>
    <dl>
      <dt>Mode</dt>
      <dd>${blackoutWebConfig.mode}</dd>
      <dt>Homeserver</dt>
      <dd>${blackoutWebConfig.homeserverUrl}</dd>
    </dl>
    <p>Service health endpoint: <a href="/health">/health</a></p>
  </main>
`;
