import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.join(__dirname, "apps", "blackout-web", "public");

function resolvePort(value) {
  const parsed = Number.parseInt(value ?? "3000", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function resolvePublicBaseUrl() {
  const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (publicDomain) {
    return `https://${publicDomain}`;
  }

  return `http://0.0.0.0:${port}`;
}

function serveFrontendFile(res, relativePath) {
  const safePath = path.normalize(relativePath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(frontendRoot, safePath);

  if (!filePath.startsWith(frontendRoot)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const contentType = filePath.endsWith(".html")
    ? "text/html; charset=utf-8"
    : "text/plain; charset=utf-8";

  res.writeHead(200, { "content-type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const port = resolvePort(process.env.PORT);
const publicBaseUrl = resolvePublicBaseUrl();

const server = http.createServer((req, res) => {
  const { method = "GET", url = "/" } = req;

  if (method === "GET" && (url === "/health" || url === "/ready")) {
    sendJson(res, 200, {
      ok: true,
      service: "blackout-monorepo",
      deployment: {
        provider: process.env.RAILWAY_PUBLIC_DOMAIN ? "railway" : "local",
        environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
        service: process.env.RAILWAY_SERVICE_NAME ?? null,
      },
    });
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  if (url === "/" || url === "/index.html") {
    serveFrontendFile(res, "index.html");
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`blackout service listening on http://0.0.0.0:${port}`);
  console.log(`frontend available at ${publicBaseUrl}/`);
  console.log(`health endpoint available at ${publicBaseUrl}/health`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
