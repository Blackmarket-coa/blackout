import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendBuildRoot = path.join(__dirname, "apps", "blackout-web", "dist");
const frontendFallbackRoot = path.join(__dirname, "apps", "blackout-web", "public");

function resolvePort(value) {
  const parsed = Number.parseInt(value ?? "3000", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function resolvePublicBaseUrl() {
  const publicDomain = process.env.PUBLIC_DOMAIN?.trim();
  if (publicDomain) {
    return `https://${publicDomain}`;
  }

  return `http://0.0.0.0:${port}`;
}


function readCallHealth() {
  const livekitUrl = process.env.LIVEKIT_PUBLIC_URL?.trim() ?? null;
  const jwtUrl = process.env.LIVEKIT_JWT_URL?.trim() ?? null;
  const configured = Boolean(livekitUrl && jwtUrl);

  return {
    configured,
    provider: configured ? "matrixrtc-livekit" : "widget-fallback",
    livekitUrl,
    jwtUrl,
    message: configured
      ? "LiveKit call endpoints configured."
      : "LiveKit call endpoints missing; clients should use widget fallback mode.",
  };
}

function resolveFrontendRoot() {
  if (fs.existsSync(frontendBuildRoot) && fs.statSync(frontendBuildRoot).isDirectory()) {
    return frontendBuildRoot;
  }
  return frontendFallbackRoot;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "text/plain; charset=utf-8";
}

function serveFrontendFile(res, relativePath) {
  const frontendRoot = resolveFrontendRoot();
  const safePath = path.normalize(relativePath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(frontendRoot, safePath);

  if (!filePath.startsWith(frontendRoot)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const fallbackFile = path.join(frontendRoot, "index.html");
    if (fs.existsSync(fallbackFile) && fs.statSync(fallbackFile).isFile()) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      fs.createReadStream(fallbackFile).pipe(res);
      return;
    }

    sendJson(res, 404, { error: "not_found" });
    return;
  }

  res.writeHead(200, { "content-type": contentTypeFor(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

const port = resolvePort(process.env.PORT);
const publicBaseUrl = resolvePublicBaseUrl();

const server = http.createServer((req, res) => {
  const { method = "GET", url = "/" } = req;

  if (method === "GET" && url === "/health/calls") {
    const callHealth = readCallHealth();
    sendJson(res, callHealth.configured ? 200 : 206, {
      ok: callHealth.configured,
      service: "blackout-monorepo",
      calls: callHealth,
    });
    return;
  }

  if (method === "GET" && (url === "/health" || url === "/ready")) {
    sendJson(res, 200, {
      ok: true,
      service: "blackout-monorepo",
      deployment: {
        provider: process.env.PUBLIC_DOMAIN ? "self-hosted" : "local",
        environment: process.env.DEPLOY_ENVIRONMENT ?? null,
        service: process.env.SERVICE_NAME ?? null,
      },
      calls: readCallHealth(),
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

  const [pathOnly] = url.split("?");
  const requestedPath = pathOnly.startsWith("/") ? pathOnly.slice(1) : pathOnly;
  serveFrontendFile(res, requestedPath);
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
